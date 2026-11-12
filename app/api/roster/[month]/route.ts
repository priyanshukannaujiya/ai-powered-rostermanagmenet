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
import { isValidRosterMonth } from "@/lib/import/month";

export const dynamic = "force-dynamic";

// GET /api/roster/[month] - Retrieve roster, conflicts, and master metadata
export async function GET(
  req: NextRequest,
  { params }: { params: { month: string } }
) {
  const { user, errorResponse } = await requireAuth(["manager", "pod_lead"]);
  if (errorResponse) return errorResponse;

  const month = params.month;
  if (user!.role === "pod_lead" && !user!.employeeId) {
    return NextResponse.json({ error: "Pod lead account is not linked to an employee." }, { status: 403 });
  }
  if (!isValidRosterMonth(month)) {
    return NextResponse.json({ error: "Invalid month format. Expected YYYY-MM" }, { status: 400 });
  }

  const sql = neon(process.env.DATABASE_URL!);

  try {
    // 1. Fetch roster month record
    const monthRows = await sql`SELECT * FROM roster_months WHERE month = ${month} LIMIT 1;`;
    const rosterMonth = monthRows[0] || null;

    // 2. Fetch roster days
    const daysRaw = rosterMonth
      ? await sql`
          SELECT rd.*, bp.brand_id, bp.process_id, b.name as brand_name, p.code as process_code
          FROM roster_days rd
          LEFT JOIN brand_processes bp ON rd.brand_process_id = bp.id
          LEFT JOIN brands b ON bp.brand_id = b.id
          LEFT JOIN processes p ON bp.process_id = p.id
          WHERE rd.roster_month_id = ${rosterMonth.id}
            AND (
              ${user!.role} = 'manager'
              OR EXISTS (
                SELECT 1 FROM employees scoped_employee
                JOIN pods scoped_pod ON scoped_pod.id = scoped_employee.pod_id
                WHERE scoped_employee.id = rd.employee_id
                  AND scoped_pod.lead_employee_id = ${user!.employeeId || null}
              )
            )
          ORDER BY rd.date ASC;
        `
      : [];

    const days = daysRaw.map((rd: any) => ({
      ...rd,
      date: formatDateOnly(rd.date),
    }));

    // 3. Fetch conflicts
    let conflictsRaw = rosterMonth
      ? await sql`
          SELECT c.*, b.name as brand_name, p.code as process_code, e.name as employee_name
          FROM conflicts c
          LEFT JOIN brand_processes bp ON c.brand_process_id = bp.id
          LEFT JOIN brands b ON bp.brand_id = b.id
          LEFT JOIN processes p ON bp.process_id = p.id
          LEFT JOIN employees e ON c.employee_id = e.id
          WHERE c.roster_month_id = ${rosterMonth.id}
            AND (
              ${user!.role} = 'manager'
              OR EXISTS (
                SELECT 1 FROM employees scoped_employee
                JOIN pods scoped_pod ON scoped_pod.id = scoped_employee.pod_id
                WHERE scoped_employee.id = c.employee_id
                  AND scoped_pod.lead_employee_id = ${user!.employeeId || null}
              )
              OR (
                c.employee_id IS NULL
                AND EXISTS (
                  SELECT 1 FROM assignments scoped_assignment
                  JOIN employees scoped_employee ON scoped_employee.id = scoped_assignment.employee_id
                  JOIN pods scoped_pod ON scoped_pod.id = scoped_employee.pod_id
                  WHERE scoped_assignment.brand_process_id = c.brand_process_id
                    AND scoped_assignment.active = true
                    AND scoped_pod.lead_employee_id = ${user!.employeeId || null}
                )
              )
            )
          ORDER BY c.severity DESC, c.date ASC;
        `
      : [];

    const conflictsList = conflictsRaw.map((c: any) => ({
      ...c,
      date: c.date ? formatDateOnly(c.date) : null,
    }));

    // 4. Fetch metadata for UI filters and dropdowns
    const employees = await sql`
      SELECT e.*, p.name as pod_name
      FROM employees e
      LEFT JOIN pods p ON e.pod_id = p.id
      WHERE ${user!.role} = 'manager'
        OR p.lead_employee_id = ${user!.employeeId || null}
      ORDER BY e.name ASC;
    `;

    const pods = await sql`
      SELECT * FROM pods
      WHERE ${user!.role} = 'manager'
        OR lead_employee_id = ${user!.employeeId || null}
      ORDER BY name ASC;
    `;
    const brands = await sql`
      SELECT DISTINCT b.* FROM brands b
      WHERE b.active = true
        AND (
          ${user!.role} = 'manager'
          OR EXISTS (
            SELECT 1 FROM brand_processes bp
            JOIN assignments scoped_assignment ON scoped_assignment.brand_process_id = bp.id AND scoped_assignment.active = true
            JOIN employees scoped_employee ON scoped_employee.id = scoped_assignment.employee_id
            JOIN pods scoped_pod ON scoped_pod.id = scoped_employee.pod_id
            WHERE bp.brand_id = b.id AND scoped_pod.lead_employee_id = ${user!.employeeId || null}
          )
        )
      ORDER BY b.name ASC;
    `;
    const processes = await sql`
      SELECT DISTINCT p.* FROM processes p
      WHERE ${user!.role} = 'manager'
        OR EXISTS (
          SELECT 1 FROM brand_processes bp
          JOIN assignments scoped_assignment ON scoped_assignment.brand_process_id = bp.id AND scoped_assignment.active = true
          JOIN employees scoped_employee ON scoped_employee.id = scoped_assignment.employee_id
          JOIN pods scoped_pod ON scoped_pod.id = scoped_employee.pod_id
          WHERE bp.process_id = p.id AND scoped_pod.lead_employee_id = ${user!.employeeId || null}
        )
      ORDER BY p.code ASC;
    `;
    const brandProcesses = await sql`
      SELECT bp.*, b.name as brand_name, p.code as process_code,
        COALESCE(mr.operating_calendar, bp.operating_calendar) as month_operating_calendar,
        COALESCE(mr.min_headcount_weekday, bp.min_headcount_weekday) as month_min_headcount_weekday,
        COALESCE(mr.min_headcount_sunday, bp.min_headcount_sunday) as month_min_headcount_sunday,
        COALESCE(mr.min_headcount_holiday, bp.min_headcount_holiday) as month_min_headcount_holiday
      FROM brand_processes bp
      JOIN brands b ON bp.brand_id = b.id
      JOIN processes p ON bp.process_id = p.id
      LEFT JOIN roster_month_rules mr
        ON mr.brand_process_id = bp.id AND mr.month = ${month}
      WHERE bp.active = true AND b.active = true
        AND (
          ${user!.role} = 'manager'
          OR EXISTS (
            SELECT 1 FROM assignments scoped_assignment
            JOIN employees scoped_employee ON scoped_employee.id = scoped_assignment.employee_id
            JOIN pods scoped_pod ON scoped_pod.id = scoped_employee.pod_id
            WHERE scoped_assignment.brand_process_id = bp.id
              AND scoped_assignment.active = true
              AND scoped_pod.lead_employee_id = ${user!.employeeId || null}
          )
        );
    `;
    const [yStr, mStr] = month.split("-");
    const lastDayOfMonth = new Date(parseInt(yStr, 10), parseInt(mStr, 10), 0).getDate();
    const startDateStr = `${month}-01`;
    const endDateStr = `${month}-${String(lastDayOfMonth).padStart(2, "0")}`;

    const holidays = await sql`
      SELECT * FROM holidays
      WHERE date >= ${startDateStr} AND date <= ${endDateStr}
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
  const { user, errorResponse } = await requireAuth(["manager"]);
  if (errorResponse) return errorResponse;

  const month = params.month;
  if (!isValidRosterMonth(month)) {
    return NextResponse.json({ error: "Invalid month format. Expected YYYY-MM" }, { status: 400 });
  }

  const sql = neon(process.env.DATABASE_URL!);

  try {
    // Fetch master data needed for scheduler
    const employeesRaw = await sql`SELECT id, name, email, pod_id, active FROM employees WHERE active = true;`;
    const bpRaw = await sql`
      SELECT bp.*, b.name as brand_name, p.code as process_code,
        COALESCE(mr.operating_calendar, bp.operating_calendar) as month_operating_calendar,
        COALESCE(mr.min_headcount_weekday, bp.min_headcount_weekday) as month_min_headcount_weekday,
        COALESCE(mr.min_headcount_sunday, bp.min_headcount_sunday) as month_min_headcount_sunday,
        COALESCE(mr.min_headcount_holiday, bp.min_headcount_holiday) as month_min_headcount_holiday
      FROM brand_processes bp
      JOIN brands b ON bp.brand_id = b.id
      JOIN processes p ON bp.process_id = p.id
      LEFT JOIN roster_month_rules mr
        ON mr.brand_process_id = bp.id AND mr.month = ${month}
      WHERE bp.active = true AND b.active = true;
    `;
    const [postYStr, postMStr] = month.split("-");
    const postLastDay = new Date(parseInt(postYStr, 10), parseInt(postMStr, 10), 0).getDate();
    const postStartStr = `${month}-01`;
    const postEndStr = `${month}-${String(postLastDay).padStart(2, "0")}`;

    const asgnRaw = await sql`SELECT * FROM assignments WHERE active = true;`;
    const woRaw = await sql`SELECT * FROM weekly_offs;`;
    const holRaw = await sql`SELECT * FROM holidays WHERE date >= ${postStartStr} AND date <= ${postEndStr};`;
    const leavesRaw = await sql`SELECT * FROM leaves WHERE status = 'approved' AND end_date >= ${postStartStr} AND start_date <= ${postEndStr};`;
    const compOffsRaw = await sql`SELECT * FROM comp_offs WHERE date >= ${postStartStr} AND date <= ${postEndStr};`;

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
      operatingCalendar: b.month_operating_calendar,
      minHeadcountWeekday: b.month_min_headcount_weekday,
      minHeadcountSunday: b.month_min_headcount_sunday,
      minHeadcountHoliday: b.month_min_headcount_holiday,
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

    // Persist the complete generated roster atomically. A failure in any
    // delete/insert/audit statement rolls the entire generation back.
    const monthId = `roster-${month}`;
    const txResults = await sql.transaction((tx) => {
      const statements: any[] = [
        tx`
          INSERT INTO roster_months (id, month, status, generated_at, updated_at)
          VALUES (${monthId}, ${month}, 'draft', now(), now())
          ON CONFLICT (month) DO UPDATE
          SET status = 'draft', generated_at = now(), updated_at = now();
        `,
        tx`DELETE FROM roster_days WHERE roster_month_id = ${monthId} AND pinned = false;`,
        tx`DELETE FROM conflicts WHERE roster_month_id = ${monthId};`,
      ];

      for (const day of scheduleResult.days) {
        const rdId = `rd-${monthId}-${day.employeeId}-${day.date}-${day.brandProcessId || "none"}`;
        statements.push(tx`
          INSERT INTO roster_days (id, roster_month_id, employee_id, date, status, brand_process_id, pinned, notes, created_at, updated_at)
          VALUES (${rdId}, ${monthId}, ${day.employeeId}, ${day.date}, ${day.status as any}, ${day.brandProcessId || null}, ${day.pinned || false}, ${day.notes || null}, now(), now())
          ON CONFLICT (roster_month_id, employee_id, date, brand_process_id)
          DO UPDATE SET status = EXCLUDED.status, pinned = EXCLUDED.pinned, notes = EXCLUDED.notes, updated_at = now();
        `);
      }

      for (const c of scheduleResult.conflicts) {
        const cId = `cf-${monthId}-${c.id}`;
        statements.push(tx`
          INSERT INTO conflicts (id, roster_month_id, type, severity, brand_process_id, employee_id, date, message, suggested_fix, resolved, created_at, updated_at)
          VALUES (${cId}, ${monthId}, ${c.type}, ${c.severity as any}, ${c.brandProcessId || null}, ${c.employeeId || null}, ${c.date || null}, ${c.message}, ${c.suggestedFix || null}, false, now(), now());
        `);
      }

      statements.push(tx`
        INSERT INTO audit_log (id, actor_user_id, action, entity, entity_id, after, created_at, updated_at)
        VALUES (${`audit-${crypto.randomUUID()}`}, ${user?.id || null}, 'ROSTER_GENERATED', 'roster_months', ${monthId}, ${JSON.stringify(scheduleResult.metrics)}::jsonb, now(), now());
      `);
      return statements;
    });


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
