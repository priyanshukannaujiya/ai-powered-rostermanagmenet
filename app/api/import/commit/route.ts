import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth-helpers";
import bcrypt from "bcryptjs";
import "@/lib/db/dns-patch";
import { beginTransaction, TransactionalSql } from "@/lib/db/transaction";
import { parseImportFileBuffer } from "@/lib/import/parse";
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
import { intersectMonthRange, isValidRosterMonth } from "@/lib/import/month";

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

function addDays(date: string, days: number): string {
  const value = new Date(`${date}T00:00:00.000Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

function getMonthRange(month: string) {
  const [year, monthNumber] = month.split("-").map(Number);
  const lastDay = new Date(Date.UTC(year, monthNumber, 0)).getUTCDate();
  return {
    start: `${month}-01`,
    end: `${month}-${String(lastDay).padStart(2, "0")}`,
  };
}

export async function POST(req: NextRequest) {
  const { user, errorResponse } = await requireAuth(["manager"]);
  if (errorResponse) return errorResponse;

  let transaction: TransactionalSql | undefined;
  try {
    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    const selectedMonth = String(formData.get("targetMonth") || "");

    if (!file) {
      return NextResponse.json(
        { ok: false, error: "No CSV or Excel file provided" },
        { status: 400 }
      );
    }
    const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB limit
    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        { ok: false, error: "File exceeds maximum permitted size of 10MB." },
        { status: 413 }
      );
    }
    if (!isValidRosterMonth(selectedMonth)) {
      return NextResponse.json(
        { ok: false, error: "Select a valid roster month before committing the import." },
        { status: 400 }
      );
    }

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // 1. Re-parse and validate strictly
    const isCsvImport = file.name.toLowerCase().endsWith(".csv");
    const parseResult = parseImportFileBuffer(buffer, file.name);
    if (!parseResult.ok || !parseResult.data) {
      return NextResponse.json(
        { ok: false, errors: parseResult.errors || ["Failed to parse file"] },
        { status: 422 }
      );
    }

    const data = { ...parseResult.data, target_month: selectedMonth };
    const validation = validateWorkbook(data, { requireInitialPasswords: isCsvImport, targetMonth: selectedMonth });
    if (!validation.ok) {
      return NextResponse.json(
        { ok: false, errors: validation.errors, warnings: validation.warnings },
        { status: 422 }
      );
    }

    const targetMonth = selectedMonth;
    const { start: monthStart, end: monthEnd } = getMonthRange(targetMonth);
    if (!process.env.DATABASE_URL) {
      throw new Error("DATABASE_URL is not configured.");
    }
    const sql = transaction = await beginTransaction(process.env.DATABASE_URL);
    const importId = `imp-${Date.now()}`;

    // 2. Transactional Upsert Execution
    // Record the import
    await sql`
      INSERT INTO imports (id, filename, uploaded_by, uploaded_at, status, row_counts, error_summary, target_month, created_at, updated_at)
      VALUES (
        ${importId},
        ${file.name},
        ${user?.id || "system"},
        now(),
        'previewed',
        ${JSON.stringify(validation.rowCounts)}::jsonb,
        ${JSON.stringify({ warnings: validation.warnings })}::jsonb,
        ${targetMonth},
        now(),
        now()
      );
    `;

    // 2a. Upsert Pods
    for (const pod of data.pods) {
      await sql`
        INSERT INTO pods (id, name, created_at, updated_at)
        VALUES (${pod.pod_code}, ${pod.pod_name}, now(), now())
        ON CONFLICT (id) DO UPDATE SET
          name = EXCLUDED.name,
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

      // CSV weekly offs apply only to the selected month; workbook imports retain legacy replacement behavior.
      const weekdayNum = WEEKDAY_MAP[emp.weekly_off_day] ?? 0;
      const overlappingRules = await sql`
          SELECT id, weekday, effective_from, effective_to
          FROM weekly_offs
          WHERE employee_id = ${emp.employee_id}
            AND effective_from <= ${monthEnd}
            AND (effective_to IS NULL OR effective_to >= ${monthStart});
      `;

      for (const rule of overlappingRules) {
        const ruleStart = formatDateOnly(rule.effective_from);
        const ruleEnd = rule.effective_to ? formatDateOnly(rule.effective_to) : null;
        const hasEarlierRange = ruleStart < monthStart;
        const hasLaterRange = !ruleEnd || ruleEnd > monthEnd;

        if (hasEarlierRange) {
          await sql`
              UPDATE weekly_offs
              SET effective_to = ${addDays(monthStart, -1)}, updated_at = now()
              WHERE id = ${rule.id};
          `;
          if (hasLaterRange) {
            await sql`
                INSERT INTO weekly_offs (id, employee_id, weekday, effective_from, effective_to, created_at, updated_at)
                VALUES (
                  ${`wo-${emp.employee_id}-${addDays(monthEnd, 1)}-${importId}`},
                  ${emp.employee_id},
                  ${rule.weekday},
                  ${addDays(monthEnd, 1)},
                  ${ruleEnd},
                  now(),
                  now()
                );
            `;
          }
        } else if (hasLaterRange) {
          await sql`
              UPDATE weekly_offs
              SET effective_from = ${addDays(monthEnd, 1)}, updated_at = now()
              WHERE id = ${rule.id};
          `;
        } else {
          await sql`DELETE FROM weekly_offs WHERE id = ${rule.id};`;
        }
      }

      await sql`
          INSERT INTO weekly_offs (id, employee_id, weekday, effective_from, effective_to, created_at, updated_at)
          VALUES (
            ${`wo-${emp.employee_id}-${monthStart}`},
            ${emp.employee_id},
            ${weekdayNum},
            ${monthStart},
            ${monthEnd},
            now(),
            now()
          );
      `;
    }

    for (const pod of data.pods) {
      await sql`
        UPDATE pods
        SET lead_employee_id = ${pod.lead_employee_id || null}, updated_at = now()
        WHERE id = ${pod.pod_code};
      `;
    }

    if (isCsvImport) {
      const podLeadIds = new Set(
        data.pods.map((pod) => pod.lead_employee_id).filter((id): id is string => Boolean(id))
      );
      for (const employee of data.employees) {
        const password = employee.initial_password;
        if (!password) {
          throw new Error(`Missing initial password for imported employee ${employee.employee_id}.`);
        }
        const passwordHash = await bcrypt.hash(password, 12);
        const role = podLeadIds.has(employee.employee_id) ? "pod_lead" : "employee";
        const matches = await sql`
          SELECT id, role, employee_id
          FROM users
          WHERE LOWER(email) = ${employee.email} OR employee_id = ${employee.employee_id};
        `;
        if (matches.some((account) => account.role === "manager")) {
          throw new Error(`Employee ${employee.employee_id} conflicts with a manager account. Use a different employee email.`);
        }
        if (matches.length > 1 || matches.some((account) =>
          account.employee_id && account.employee_id !== employee.employee_id
        )) {
          throw new Error(`Login email ${employee.email} or employee ID ${employee.employee_id} is already linked to another account.`);
        }

        if (matches.length === 1) {
          await sql`
            UPDATE users
            SET email = ${employee.email}, password_hash = ${passwordHash},
                role = ${role}, employee_id = ${employee.employee_id}, updated_at = now()
            WHERE id = ${matches[0].id};
          `;
        } else {
          await sql`
            INSERT INTO users (id, email, password_hash, role, employee_id, created_at, updated_at)
            VALUES (
              ${`user-${employee.employee_id}`}, ${employee.email}, ${passwordHash},
              ${role}, ${employee.employee_id}, now(), now()
            );
          `;
        }
      }
    }

    // 2e. Upsert Brand Processes (Schedules)
    const bpMap = new Map<string, string>(); // "brand_code:process_code" -> bp_id
    for (const sch of data.schedules) {
      const bId = brandMap.get(sch.brand_code);
      const pId = processMap.get(sch.process_code);
      if (!bId || !pId) continue;

      const bpKey = `${sch.brand_code}:${sch.process_code}`;
      const existingBp = await sql`
        SELECT id FROM brand_processes WHERE brand_id = ${bId} AND process_id = ${pId} LIMIT 1;
      `;
      let bpId: string;
      if (existingBp.length > 0) {
        bpId = existingBp[0].id;
        await sql`
          UPDATE brand_processes
          SET active = true, updated_at = now()
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
            active = true,
            updated_at = now();
        `;
      }
      bpMap.set(bpKey, bpId);

      await sql`
        INSERT INTO roster_month_rules (
          id, month, brand_process_id, operating_calendar,
          min_headcount_weekday, min_headcount_sunday, min_headcount_holiday,
          created_at, updated_at
        ) VALUES (
          ${`rmp-${targetMonth}-${bpId}`}, ${targetMonth}, ${bpId}, ${sch.operating_calendar},
          ${sch.weekday_headcount}, ${sch.sunday_headcount}, ${sch.holiday_headcount}, now(), now()
        )
        ON CONFLICT (month, brand_process_id) DO UPDATE SET
          operating_calendar = EXCLUDED.operating_calendar,
          min_headcount_weekday = EXCLUDED.min_headcount_weekday,
          min_headcount_sunday = EXCLUDED.min_headcount_sunday,
          min_headcount_holiday = EXCLUDED.min_headcount_holiday,
          updated_at = now();
      `;
    }

    // 2f. Upsert Assignments
    for (const asg of data.assignments) {
      const bpId = bpMap.get(`${asg.brand_code}:${asg.process_code}`);
      if (!bpId) continue;

      const assignmentRange = intersectMonthRange(asg.valid_from, asg.valid_to, targetMonth);
      if (!assignmentRange) continue;

      const overlappingAssignments = await sql`
        SELECT id, start_date, end_date, priority, is_exclusive, import_id
        FROM assignments
        WHERE employee_id = ${asg.employee_id}
          AND brand_process_id = ${bpId}
          AND active = true
          AND start_date <= ${monthEnd}
          AND (end_date IS NULL OR end_date >= ${monthStart});
      `;
      for (const existing of overlappingAssignments) {
        const existingStart = formatDateOnly(existing.start_date);
        const existingEnd = existing.end_date ? formatDateOnly(existing.end_date) : null;
        const hasEarlierRange = existingStart < monthStart;
        const hasLaterRange = !existingEnd || existingEnd > monthEnd;

        if (hasEarlierRange) {
          await sql`
            UPDATE assignments
            SET end_date = ${addDays(monthStart, -1)}, updated_at = now()
            WHERE id = ${existing.id};
          `;
          if (hasLaterRange) {
            await sql`
              INSERT INTO assignments (
                id, employee_id, brand_process_id, start_date, end_date, priority,
                is_exclusive, active, import_id, created_at, updated_at
              ) VALUES (
                ${`${existing.id}-after-${targetMonth}`}, ${asg.employee_id}, ${bpId},
                ${addDays(monthEnd, 1)}, ${existingEnd}, ${existing.priority},
                ${existing.is_exclusive}, true, ${existing.import_id}, now(), now()
              )
              ON CONFLICT (id) DO NOTHING;
            `;
          }
        } else if (hasLaterRange) {
          await sql`
            UPDATE assignments
            SET start_date = ${addDays(monthEnd, 1)}, updated_at = now()
            WHERE id = ${existing.id};
          `;
        } else {
          await sql`
            UPDATE assignments SET active = false, updated_at = now()
            WHERE id = ${existing.id};
          `;
        }
      }

      const asgId = `asg-${asg.employee_id}-${asg.brand_code}-${asg.process_code}-${targetMonth}`;
      await sql`
        INSERT INTO assignments (
          id, employee_id, brand_process_id, start_date, end_date, priority, is_exclusive, active, import_id, created_at, updated_at
        ) VALUES (
          ${asgId}, ${asg.employee_id}, ${bpId}, ${assignmentRange.start}, ${assignmentRange.end},
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
      const leaveRange = intersectMonthRange(lv.date_from, lv.date_to, targetMonth);
      if (!leaveRange) continue;
      const leaveId = `leave-${lv.employee_id}-${targetMonth}-${leaveRange.start}-${leaveRange.end}`;
      await sql`
        INSERT INTO leaves (
          id, employee_id, start_date, end_date, type, status, created_at, updated_at
        ) VALUES (
          ${leaveId}, ${lv.employee_id}, ${leaveRange.start}, ${leaveRange.end}, ${lv.type === "comp_off" ? "other" : "planned"},
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

    // 3. Auto-regenerate the roster for the selected import month
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
        SELECT bp.*, b.name as brand_name, p.code as process_code,
          COALESCE(mr.operating_calendar, bp.operating_calendar) as month_operating_calendar,
          COALESCE(mr.min_headcount_weekday, bp.min_headcount_weekday) as month_min_headcount_weekday,
          COALESCE(mr.min_headcount_sunday, bp.min_headcount_sunday) as month_min_headcount_sunday,
          COALESCE(mr.min_headcount_holiday, bp.min_headcount_holiday) as month_min_headcount_holiday
        FROM brand_processes bp
        JOIN brands b ON bp.brand_id = b.id
        JOIN processes p ON bp.process_id = p.id
        LEFT JOIN roster_month_rules mr
          ON mr.brand_process_id = bp.id AND mr.month = ${targetMonth}
        WHERE bp.active = true AND b.active = true;
      `,
      sql`SELECT * FROM assignments WHERE active = true;`,
      sql`SELECT * FROM weekly_offs;`,
      sql`SELECT * FROM holidays WHERE date >= ${monthStart} AND date <= ${monthEnd};`,
      sql`SELECT * FROM leaves WHERE status = 'approved' AND start_date <= ${monthEnd} AND end_date >= ${monthStart};`,
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
      operatingCalendar: b.month_operating_calendar,
      minHeadcountWeekday: b.month_min_headcount_weekday,
      minHeadcountSunday: b.month_min_headcount_sunday,
      minHeadcountHoliday: b.month_min_headcount_holiday,
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

    await sql`
      UPDATE imports
      SET status = 'committed', updated_at = now()
      WHERE id = ${importId};
    `;
    await sql.commit();

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
    if (transaction) {
      try {
        await transaction.rollback();
      } catch (rollbackError) {
        console.error("Import rollback failed:", rollbackError);
      }
    }
    console.error("Commit error:", error);
    return NextResponse.json(
      { ok: false, error: "Failed to commit import", details: error.message },
      { status: 500 }
    );
  } finally {
    if (transaction) await transaction.close();
  }
}
