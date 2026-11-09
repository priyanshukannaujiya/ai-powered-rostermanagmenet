import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth-helpers";
import { neon } from "@neondatabase/serverless";
import "@/lib/db/dns-patch";
import { generateRoster } from "@/lib/scheduler/assign";
import {
  EmployeeInfo,
  BrandProcessRule,
  AssignmentRule,
  WeeklyOffRule,
  HolidayItem,
  LeaveItem,
  CompOffItem,
} from "@/lib/scheduler/types";

import { formatDateOnly } from "@/lib/date-utils";

export const dynamic = "force-dynamic";

// GET /api/roster/[month] - Retrieve roster, conflicts, and master metadata
export async function GET(
  req: NextRequest,
  { params }: { params: { month: string } }
) {
  const { user, errorResponse } = await requireAuth();
  if (errorResponse) return errorResponse;

  const month = params.month;
  if (!month || !/^\d{4}-\d{2}$/.test(month)) {
    return NextResponse.json({ error: "Invalid month format. Expected YYYY-MM" }, { status: 400 });
  }

  const sql = neon(process.env.DATABASE_URL!);

  try {
    // 1. Fetch roster month record
    const monthRows = await sql`SELECT * FROM roster_months WHERE month = ${month} LIMIT 1;`;
    const rosterMonth = monthRows[0] || null;

    // 2. Fetch roster days
    const days = rosterMonth
      ? await sql`
          SELECT rd.*, bp.brand_id, bp.process_id, b.name as brand_name, p.code as process_code
          FROM roster_days rd
          LEFT JOIN brand_processes bp ON rd.brand_process_id = bp.id
          LEFT JOIN brands b ON bp.brand_id = b.id
          LEFT JOIN processes p ON bp.process_id = p.id
          WHERE rd.roster_month_id = ${rosterMonth.id}
          ORDER BY rd.date ASC;
        `
      : [];

    // 3. Fetch conflicts
    const conflictsList = rosterMonth
      ? await sql`
          SELECT c.*, b.name as brand_name, p.code as process_code, e.name as employee_name
          FROM conflicts c
          LEFT JOIN brand_processes bp ON c.brand_process_id = bp.id
          LEFT JOIN brands b ON bp.brand_id = b.id
          LEFT JOIN processes p ON bp.process_id = p.id
          LEFT JOIN employees e ON c.employee_id = e.id
          WHERE c.roster_month_id = ${rosterMonth.id}
          ORDER BY c.severity DESC, c.date ASC;
        `
      : [];

    // 4. Fetch metadata for UI filters and dropdowns
    const employees = await sql`
      SELECT e.*, p.name as pod_name
      FROM employees e
      LEFT JOIN pods p ON e.pod_id = p.id
      ORDER BY e.name ASC;
    `;

    const pods = await sql`SELECT * FROM pods ORDER BY name ASC;`;
    const brands = await sql`SELECT * FROM brands WHERE active = true ORDER BY name ASC;`;
    const processes = await sql`SELECT * FROM processes ORDER BY code ASC;`;
    const brandProcesses = await sql`
      SELECT bp.*, b.name as brand_name, p.code as process_code
      FROM brand_processes bp
      JOIN brands b ON bp.brand_id = b.id
      JOIN processes p ON bp.process_id = p.id;
    `;
    const holidays = await sql`
      SELECT * FROM holidays
      WHERE date >= ${`${month}-01`} AND date <= ${`${month}-31`}
      ORDER BY date ASC;
    `;

    return NextResponse.json({
      month,
      rosterMonth,
      days,
      conflicts: conflictsList,
      meta: {
        employees,
        pods,
        brands,
        processes,
        brandProcesses,
        holidays,
      },
    });
  } catch (error: any) {
    console.error("Failed to fetch roster:", error);
    return NextResponse.json({ error: error.message || "Failed to load roster" }, { status: 500 });
  }
}

// POST /api/roster/[month] - Generate or regenerate the roster using the pure scheduler engine
export async function POST(
  req: NextRequest,
  { params }: { params: { month: string } }
) {
  const { user, errorResponse } = await requireAuth(["manager", "pod_lead"]);
  if (errorResponse) return errorResponse;

  const month = params.month;
  if (!month || !/^\d{4}-\d{2}$/.test(month)) {
    return NextResponse.json({ error: "Invalid month format. Expected YYYY-MM" }, { status: 400 });
  }

  const sql = neon(process.env.DATABASE_URL!);

  try {
    // Check if month is already published
    const existingMonth = await sql`SELECT * FROM roster_months WHERE month = ${month} LIMIT 1;`;
    if (existingMonth.length > 0 && existingMonth[0].status === "published") {
      return NextResponse.json(
        { error: "Cannot regenerate a published roster. Unpublish or edit cells manually." },
        { status: 400 }
      );
    }

    // Fetch master data needed for scheduler
    const employeesRaw = await sql`SELECT id, name, email, pod_id, active FROM employees WHERE active = true;`;
    const bpRaw = await sql`
      SELECT bp.*, b.name as brand_name, p.code as process_code
      FROM brand_processes bp
      JOIN brands b ON bp.brand_id = b.id
      JOIN processes p ON bp.process_id = p.id;
    `;
    const asgnRaw = await sql`SELECT * FROM assignments;`;
    const woRaw = await sql`SELECT * FROM weekly_offs;`;
    const holRaw = await sql`SELECT * FROM holidays WHERE date >= ${`${month}-01`} AND date <= ${`${month}-31`};`;
    const leavesRaw = await sql`SELECT * FROM leaves WHERE status = 'approved' AND end_date >= ${`${month}-01`} AND start_date <= ${`${month}-31`};`;
    const compOffsRaw = await sql`SELECT * FROM comp_offs WHERE date >= ${`${month}-01`} AND date <= ${`${month}-31`};`;

    const employees: EmployeeInfo[] = employeesRaw.map((e: any) => ({
      id: e.id,
      name: e.name,
      email: e.email,
      podId: e.pod_id,
      active: e.active,
    }));

    const brandProcesses: BrandProcessRule[] = bpRaw.map((b: any) => ({
      id: b.id,
      brandId: b.brand_id,
      brandName: b.brand_name,
      processId: b.process_id,
      processCode: b.process_code,
      operatingCalendar: b.operating_calendar,
      minHeadcountWeekday: b.min_headcount_weekday,
      minHeadcountSunday: b.min_headcount_sunday,
      minHeadcountHoliday: b.min_headcount_holiday,
    }));

    const assignments: AssignmentRule[] = asgnRaw.map((a: any) => ({
      id: a.id,
      employeeId: a.employee_id,
      brandProcessId: a.brand_process_id,
      startDate: formatDateOnly(a.start_date),
      endDate: a.end_date ? formatDateOnly(a.end_date) : null,
      priority: a.priority,
      isExclusive: a.is_exclusive,
    }));

    const weeklyOffs: WeeklyOffRule[] = woRaw.map((w: any) => ({
      id: w.id,
      employeeId: w.employee_id,
      weekday: w.weekday,
      effectiveFrom: formatDateOnly(w.effective_from),
      effectiveTo: w.effective_to ? formatDateOnly(w.effective_to) : null,
    }));

    const holidays: HolidayItem[] = holRaw.map((h: any) => ({
      id: h.id,
      date: formatDateOnly(h.date),
      name: h.name,
    }));

    const leaves: LeaveItem[] = leavesRaw.map((l: any) => ({
      id: l.id,
      employeeId: l.employee_id,
      startDate: formatDateOnly(l.start_date),
      endDate: formatDateOnly(l.end_date),
      type: l.type,
      status: l.status,
    }));

    const compOffs: CompOffItem[] = compOffsRaw.map((c: any) => ({
      id: c.id,
      employeeId: c.employee_id,
      date: formatDateOnly(c.date),
      status: c.status,
    }));

    // Run Pure Scheduler Engine
    const scheduleResult = generateRoster({
      month,
      employees,
      brandProcesses,
      assignments,
      weeklyOffs,
      holidays,
      leaves,
      compOffs,
    });

    // Save into Database
    const monthId = `roster-${month}`;
    await sql`
      INSERT INTO roster_months (id, month, status, generated_at, updated_at)
      VALUES (${monthId}, ${month}, 'draft', now(), now())
      ON CONFLICT (month) DO UPDATE SET generated_at = now(), updated_at = now();
    `;

    // Clear previous unpinned days and conflicts for this month
    await sql`DELETE FROM roster_days WHERE roster_month_id = ${monthId} AND pinned = false;`;
    await sql`DELETE FROM conflicts WHERE roster_month_id = ${monthId};`;

    // Insert newly generated roster days
    for (const day of scheduleResult.days) {
      const rdId = `rd-${monthId}-${day.employeeId}-${day.date}-${day.brandProcessId || "none"}`;
      await sql`
        INSERT INTO roster_days (id, roster_month_id, employee_id, date, status, brand_process_id, pinned, notes, created_at, updated_at)
        VALUES (${rdId}, ${monthId}, ${day.employeeId}, ${day.date}, ${day.status as any}, ${day.brandProcessId || null}, ${day.pinned || false}, ${day.notes || null}, now(), now())
        ON CONFLICT (roster_month_id, employee_id, date, brand_process_id)
        DO UPDATE SET status = EXCLUDED.status, pinned = EXCLUDED.pinned, notes = EXCLUDED.notes, updated_at = now();
      `;
    }

    // Insert generated conflicts
    for (const c of scheduleResult.conflicts) {
      const cId = `cf-${monthId}-${c.id}`;
      await sql`
        INSERT INTO conflicts (id, roster_month_id, type, severity, brand_process_id, employee_id, date, message, suggested_fix, resolved, created_at, updated_at)
        VALUES (${cId}, ${monthId}, ${c.type}, ${c.severity as any}, ${c.brandProcessId || null}, ${c.employeeId || null}, ${c.date || null}, ${c.message}, ${c.suggestedFix || null}, false, now(), now());
      `;
    }

    // Record audit log
    await sql`
      INSERT INTO audit_log (id, actor_user_id, action, entity, entity_id, after, created_at, updated_at)
      VALUES (${`audit-${Date.now()}`}, ${user?.id || null}, 'ROSTER_GENERATED', 'roster_months', ${monthId}, ${JSON.stringify(scheduleResult.metrics)}, now(), now());
    `;

    return NextResponse.json({
      success: true,
      month,
      metrics: scheduleResult.metrics,
      conflictsCount: scheduleResult.conflicts.length,
    });
  } catch (error: any) {
    console.error("Scheduler generation failed:", error);
    return NextResponse.json({ error: error.message || "Failed to generate roster" }, { status: 500 });
  }
}
