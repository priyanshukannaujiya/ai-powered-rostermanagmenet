import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth-helpers";
import { neon } from "@neondatabase/serverless";
import "@/lib/db/dns-patch";
import { parseWorkbookBuffer } from "@/lib/import/parse";
import { validateWorkbook } from "@/lib/import/validate";
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

const WEEKDAY_MAP: Record<string, number> = {
  SUN: 0,
  MON: 1,
  TUE: 2,
  WED: 3,
  THU: 4,
  FRI: 5,
  SAT: 6,
};

export async function POST(req: NextRequest) {
  const { user, errorResponse } = await requireAuth(["manager"]);
  if (errorResponse) return errorResponse;

  try {
    const formData = await req.formData();
    const file = formData.get("file") as File | null;

    if (!file) {
      return NextResponse.json(
        { ok: false, error: "No Excel file provided" },
        { status: 400 }
      );
    }

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // 1. Re-parse and validate strictly
    const parseResult = parseWorkbookBuffer(buffer);
    if (!parseResult.ok || !parseResult.data) {
      return NextResponse.json(
        { ok: false, errors: parseResult.errors || ["Failed to parse file"] },
        { status: 422 }
      );
    }

    const validation = validateWorkbook(parseResult.data);
    if (!validation.ok) {
      return NextResponse.json(
        { ok: false, errors: validation.errors, warnings: validation.warnings },
        { status: 422 }
      );
    }

    const data = parseResult.data;
    const sql = neon(process.env.DATABASE_URL!);
    const importId = `imp-${Date.now()}`;

    // 2. Transactional Upsert Execution
    // Record the import
    await sql`
      INSERT INTO imports (id, filename, uploaded_by, uploaded_at, status, row_counts, error_summary, created_at, updated_at)
      VALUES (
        ${importId},
        ${file.name},
        ${user?.id || "system"},
        now(),
        'committed',
        ${JSON.stringify(validation.rowCounts)}::jsonb,
        ${JSON.stringify({ warnings: validation.warnings })}::jsonb,
        now(),
        now()
      );
    `;

    // 2a. Upsert Pods
    for (const pod of data.pods) {
      await sql`
        INSERT INTO pods (id, name, lead_employee_id, created_at, updated_at)
        VALUES (${pod.pod_code}, ${pod.pod_name}, ${pod.lead_employee_id || null}, now(), now())
        ON CONFLICT (id) DO UPDATE SET
          name = EXCLUDED.name,
          lead_employee_id = EXCLUDED.lead_employee_id,
          updated_at = now();
      `;
    }

    // 2b. Upsert Brands
    const brandMap = new Map<string, string>(); // brand_code -> brand_id
    for (const b of data.brands) {
      const existing = await sql`SELECT id FROM brands WHERE code = ${b.brand_code} LIMIT 1;`;
      let bId: string;
      if (existing.length > 0) {
        bId = existing[0].id;
        await sql`
          UPDATE brands 
          SET name = ${b.brand_name}, category = ${b.category || null}, active = true, updated_at = now()
          WHERE id = ${bId};
        `;
      } else {
        bId = `brand-${b.brand_code.toLowerCase().replace(/[^a-z0-9]/g, "-")}`;
        await sql`
          INSERT INTO brands (id, name, code, category, active, created_at, updated_at)
          VALUES (${bId}, ${b.brand_name}, ${b.brand_code}, ${b.category || null}, true, now(), now())
          ON CONFLICT (id) DO UPDATE SET
            name = EXCLUDED.name,
            code = EXCLUDED.code,
            category = EXCLUDED.category,
            active = true,
            updated_at = now();
        `;
      }
      brandMap.set(b.brand_code, bId);
    }

    // 2c. Upsert Processes
    const processMap = new Map<string, string>(); // process_code -> process_id
    for (const p of data.processes) {
      const existing = await sql`SELECT id FROM processes WHERE code = ${p.process_code} LIMIT 1;`;
      let pId: string;
      if (existing.length > 0) {
        pId = existing[0].id;
        await sql`
          UPDATE processes SET name = ${p.process_name}, updated_at = now() WHERE id = ${pId};
        `;
      } else {
        pId = `proc-${p.process_code.toLowerCase()}`;
        await sql`
          INSERT INTO processes (id, name, code, created_at, updated_at)
          VALUES (${pId}, ${p.process_name}, ${p.process_code}, now(), now())
          ON CONFLICT (id) DO UPDATE SET
            name = EXCLUDED.name,
            code = EXCLUDED.code,
            updated_at = now();
        `;
      }
      processMap.set(p.process_code, pId);
    }

    // 2d. Upsert Employees
    const uploadedEmpIds = new Set(data.employees.map((e) => e.employee_id));
    for (const emp of data.employees) {
      await sql`
        INSERT INTO employees (id, name, email, pod_id, active, import_id, created_at, updated_at)
        VALUES (${emp.employee_id}, ${emp.name}, ${emp.email}, ${emp.pod_code}, ${emp.active}, ${importId}, now(), now())
        ON CONFLICT (id) DO UPDATE SET
          name = EXCLUDED.name,
          email = EXCLUDED.email,
          pod_id = EXCLUDED.pod_id,
          active = EXCLUDED.active,
          import_id = ${importId},
          updated_at = now();
      `;

      // Update weekly off for this employee
      const weekdayNum = WEEKDAY_MAP[emp.weekly_off_day] ?? 0;
      await sql`DELETE FROM weekly_offs WHERE employee_id = ${emp.employee_id};`;
      await sql`
        INSERT INTO weekly_offs (id, employee_id, weekday, effective_from, created_at, updated_at)
        VALUES (
          ${'wo-' + emp.employee_id},
          ${emp.employee_id},
          ${weekdayNum},
          '2026-01-01',
          now(),
          now()
        );
      `;
    }

    // Soft delete employees absent in this upload
    const empIdArray = Array.from(uploadedEmpIds);
    if (empIdArray.length > 0) {
      await sql`
        UPDATE employees 
        SET active = false, updated_at = now()
        WHERE NOT (id = ANY(${empIdArray}));
      `;
    }

    // 2e. Upsert Brand Processes (Schedules)
    const bpMap = new Map<string, string>(); // "brand_code:process_code" -> bp_id
    const uploadedBpKeys = new Set<string>();

    for (const sch of data.schedules) {
      const bId = brandMap.get(sch.brand_code);
      const pId = processMap.get(sch.process_code);
      if (!bId || !pId) continue;

      const bpKey = `${sch.brand_code}:${sch.process_code}`;
      uploadedBpKeys.add(bpKey);

      const existingBp = await sql`
        SELECT id FROM brand_processes WHERE brand_id = ${bId} AND process_id = ${pId} LIMIT 1;
      `;
      let bpId: string;
      if (existingBp.length > 0) {
        bpId = existingBp[0].id;
        await sql`
          UPDATE brand_processes SET
            operating_calendar = ${sch.operating_calendar},
            min_headcount_weekday = ${sch.weekday_headcount},
            min_headcount_sunday = ${sch.sunday_headcount},
            min_headcount_holiday = ${sch.holiday_headcount},
            active = true,
            import_id = ${importId},
            updated_at = now()
          WHERE id = ${bpId};
        `;
      } else {
        bpId = `bp-${sch.brand_code.toLowerCase()}-${sch.process_code.toLowerCase()}`;
        await sql`
          INSERT INTO brand_processes (
            id, brand_id, process_id, operating_calendar, min_headcount_weekday, 
            min_headcount_sunday, min_headcount_holiday, active, import_id, created_at, updated_at
          ) VALUES (
            ${bpId}, ${bId}, ${pId}, ${sch.operating_calendar}, ${sch.weekday_headcount},
            ${sch.sunday_headcount}, ${sch.holiday_headcount}, true, ${importId}, now(), now()
          )
          ON CONFLICT (brand_id, process_id) DO UPDATE SET
            operating_calendar = EXCLUDED.operating_calendar,
            min_headcount_weekday = EXCLUDED.min_headcount_weekday,
            min_headcount_sunday = EXCLUDED.min_headcount_sunday,
            min_headcount_holiday = EXCLUDED.min_headcount_holiday,
            active = true,
            import_id = ${importId},
            updated_at = now();
        `;
      }
      bpMap.set(bpKey, bpId);
    }

    // 2f. Upsert Assignments
    // Clear previous assignments linked to other imports or refresh active assignments
    await sql`UPDATE assignments SET active = false WHERE active = true;`;

    for (const asg of data.assignments) {
      const bpId = bpMap.get(`${asg.brand_code}:${asg.process_code}`);
      if (!bpId) continue;

      const asgId = `asg-${asg.employee_id}-${asg.brand_code}-${asg.process_code}-${asg.valid_from}`;
      await sql`
        INSERT INTO assignments (
          id, employee_id, brand_process_id, start_date, end_date, priority, is_exclusive, active, import_id, created_at, updated_at
        ) VALUES (
          ${asgId}, ${asg.employee_id}, ${bpId}, ${asg.valid_from}, ${asg.valid_to || null},
          ${asg.priority}, ${asg.is_exclusive}, true, ${importId}, now(), now()
        )
        ON CONFLICT (id) DO UPDATE SET
          brand_process_id = EXCLUDED.brand_process_id,
          start_date = EXCLUDED.start_date,
          end_date = EXCLUDED.end_date,
          priority = EXCLUDED.priority,
          is_exclusive = EXCLUDED.is_exclusive,
          active = true,
          import_id = ${importId},
          updated_at = now();
      `;
    }

    // 2g. Upsert Leaves
    for (const lv of data.leaves) {
      const leaveId = `leave-${lv.employee_id}-${lv.date_from}-${lv.date_to}`;
      await sql`
        INSERT INTO leaves (
          id, employee_id, start_date, end_date, type, status, created_at, updated_at
        ) VALUES (
          ${leaveId}, ${lv.employee_id}, ${lv.date_from}, ${lv.date_to}, ${lv.type === "comp_off" ? "other" : "planned"},
          ${lv.status}, now(), now()
        )
        ON CONFLICT (id) DO UPDATE SET
          start_date = EXCLUDED.start_date,
          end_date = EXCLUDED.end_date,
          type = EXCLUDED.type,
          status = EXCLUDED.status,
          updated_at = now();
      `;
    }

    // 2h. Upsert Holidays
    for (const hol of data.holidays) {
      const holId = `hol-${hol.date}`;
      await sql`
        INSERT INTO holidays (id, date, name, created_at, updated_at)
        VALUES (${holId}, ${hol.date}, ${hol.name}, now(), now())
        ON CONFLICT (date) DO UPDATE SET
          name = EXCLUDED.name,
          updated_at = now();
      `;
    }

    // 3. Auto-regenerate roster for affected month (Default November 2026 or from assignments)
    const targetMonth = "2026-11";
    const monthId = `roster-${targetMonth}`;

    // Ensure roster_months record exists
    await sql`
      INSERT INTO roster_months (id, month, status, generated_at, created_at, updated_at)
      VALUES (${monthId}, ${targetMonth}, 'draft', now(), now(), now())
      ON CONFLICT (month) DO UPDATE SET
        status = 'draft',
        generated_at = now(),
        updated_at = now();
    `;

    // Fetch freshly committed master data to run deterministic scheduler
    const [empRows, bpRows, asgnRows, woRows, holRows, leaveRows] = await Promise.all([
      sql`SELECT id, name, email, pod_id, active FROM employees WHERE active = true;`,
      sql`
        SELECT bp.*, b.name as brand_name, p.code as process_code
        FROM brand_processes bp
        JOIN brands b ON bp.brand_id = b.id
        JOIN processes p ON bp.process_id = p.id
        WHERE bp.active = true;
      `,
      sql`SELECT * FROM assignments WHERE active = true;`,
      sql`SELECT * FROM weekly_offs;`,
      sql`SELECT * FROM holidays WHERE date >= '2026-11-01' AND date <= '2026-11-30';`,
      sql`SELECT * FROM leaves WHERE status = 'approved' AND start_date <= '2026-11-30' AND end_date >= '2026-11-01';`,
    ]);

    const solverEmployees: EmployeeInfo[] = empRows.map((e: any) => ({
      id: e.id,
      name: e.name,
      email: e.email,
      podId: e.pod_id,
      active: e.active,
    }));

    const solverBp: BrandProcessRule[] = bpRows.map((b: any) => ({
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

    const solverAsgn: AssignmentRule[] = asgnRows.map((a: any) => ({
      id: a.id,
      employeeId: a.employee_id,
      brandProcessId: a.brand_process_id,
      startDate: formatDateOnly(a.start_date),
      endDate: a.end_date ? formatDateOnly(a.end_date) : null,
      priority: a.priority,
      isExclusive: a.is_exclusive,
    }));

    const solverWo: WeeklyOffRule[] = woRows.map((w: any) => ({
      id: w.id,
      employeeId: w.employee_id,
      weekday: w.weekday,
      effectiveFrom: formatDateOnly(w.effective_from),
      effectiveTo: w.effective_to ? formatDateOnly(w.effective_to) : null,
    }));

    const solverHol: HolidayItem[] = holRows.map((h: any) => ({
      id: h.id,
      date: formatDateOnly(h.date),
      name: h.name,
    }));

    const solverLeaves: LeaveItem[] = leaveRows.map((l: any) => ({
      id: l.id,
      employeeId: l.employee_id,
      startDate: formatDateOnly(l.start_date),
      endDate: formatDateOnly(l.end_date),
      type: l.type,
      status: l.status,
    }));

    // Run scheduler
    const solverOutput = generateRoster({
      month: targetMonth,
      employees: solverEmployees,
      brandProcesses: solverBp,
      assignments: solverAsgn,
      weeklyOffs: solverWo,
      holidays: solverHol,
      leaves: solverLeaves,
      compOffs: [],
    });

    // Clear previous month assignments and conflicts
    await sql`DELETE FROM roster_days WHERE roster_month_id = ${monthId};`;
    await sql`DELETE FROM conflicts WHERE roster_month_id = ${monthId};`;

    // Persist new roster days
    for (const d of solverOutput.days) {
      const cellId = `rd-${monthId}-${d.employeeId}-${d.date}-${d.brandProcessId || "none"}`;
      await sql`
        INSERT INTO roster_days (id, roster_month_id, employee_id, date, status, brand_process_id, pinned, notes, created_at, updated_at)
        VALUES (${cellId}, ${monthId}, ${d.employeeId}, ${d.date}, ${d.status}, ${d.brandProcessId || null}, ${d.pinned || false}, ${d.notes || null}, now(), now())
        ON CONFLICT (id) DO UPDATE SET
          status = EXCLUDED.status,
          brand_process_id = EXCLUDED.brand_process_id,
          pinned = EXCLUDED.pinned,
          notes = EXCLUDED.notes,
          updated_at = now();
      `;
    }

    // Persist new conflicts
    for (const c of solverOutput.conflicts) {
      const conflictId = `cf-${monthId}-${c.type}-${c.date || "nodate"}-${c.brandProcessId || "nobp"}-${c.employeeId || "noemp"}`;
      await sql`
        INSERT INTO conflicts (id, roster_month_id, type, severity, brand_process_id, employee_id, date, message, suggested_fix, resolved, created_at, updated_at)
        VALUES (${conflictId}, ${monthId}, ${c.type}, ${c.severity}, ${c.brandProcessId || null}, ${c.employeeId || null}, ${c.date || null}, ${c.message}, ${c.suggestedFix || null}, false, now(), now())
        ON CONFLICT (id) DO NOTHING;
      `;
    }

    return NextResponse.json({
      ok: true,
      importId,
      message: "Workbook committed successfully. Master data updated and roster regenerated.",
      targetMonth,
      conflictsCount: solverOutput.conflicts.length,
      daysAssigned: solverOutput.days.length,
      rowCounts: validation.rowCounts,
    });
  } catch (error: any) {
    console.error("Commit error:", error);
    return NextResponse.json(
      { ok: false, error: "Failed to commit import", details: error.message },
      { status: 500 }
    );
  }
}
