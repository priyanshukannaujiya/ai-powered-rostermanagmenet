import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth-helpers";
import { neon } from "@neondatabase/serverless";
import "@/lib/db/dns-patch";
import { parseImportFileBuffer } from "@/lib/import/parse";
import { validateWorkbook, computeEntityDiff } from "@/lib/import/validate";
import { ImportDiff } from "@/lib/import/types";
import { formatDateOnly } from "@/lib/date-utils";
import { isValidRosterMonth } from "@/lib/import/month";
import { intersectMonthRange } from "@/lib/import/month";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const { user, errorResponse } = await requireAuth(["manager"]);
  if (errorResponse) return errorResponse;

  try {
    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    const targetMonth = String(formData.get("targetMonth") || "");

    if (!file) {
      return NextResponse.json(
        { ok: false, errors: [{ sheet: "File", row: 0, field: "file", message: "No CSV or Excel file uploaded" }] },
        { status: 400 }
      );
    }
    if (!isValidRosterMonth(targetMonth)) {
      return NextResponse.json(
        { ok: false, errors: [{ sheet: "Import", row: 0, field: "targetMonth", message: "Select a valid roster month before previewing." }] },
        { status: 400 }
      );
    }

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // 1. Parse buffer and check sheet/header structure
    const isCsvImport = file.name.toLowerCase().endsWith(".csv");
    const parseResult = parseImportFileBuffer(buffer, file.name);
    if (!parseResult.ok || !parseResult.data) {
      const formattedErrors = (parseResult.errors || ["Failed to parse file"]).map((msg) => ({
        sheet: "Structure",
        row: 1,
        field: "header",
        message: msg,
      }));
      return NextResponse.json(
        { ok: false, errors: formattedErrors, warnings: [] },
        { status: 422 }
      );
    }

    // 2. Validate rows, referential integrity, and business rules
    const data = { ...parseResult.data, target_month: targetMonth };
    const fileTargetMonth = parseResult.data.target_month || null;
    const validation = validateWorkbook(data, { requireInitialPasswords: isCsvImport, targetMonth });
    if (!validation.ok) {
      return NextResponse.json(
        {
          ok: false,
          errors: validation.errors,
          warnings: [
            ...validation.warnings,
            ...(!isCsvImport ? [{
              code: "ACCOUNTS_NOT_PROVISIONED",
              message: "This workbook does not contain initial passwords. Employee and pod-lead login accounts will not be created by this import.",
            }] : []),
            ...(fileTargetMonth && fileTargetMonth !== targetMonth ? [{
              code: "SELECTED_MONTH_OVERRIDES_FILE",
              message: `The file specifies ${fileTargetMonth}; this import will use the explicitly selected month ${targetMonth}.`,
            }] : []),
          ],
          rowCounts: validation.rowCounts,
        },
        { status: 422 }
      );
    }

    // 3. Compute Diff against current database without writing
    const sql = neon(process.env.DATABASE_URL!);
    const [year, monthNumber] = targetMonth.split("-").map(Number);
    const monthStart = `${targetMonth}-01`;
    const monthEnd = `${targetMonth}-${String(new Date(Date.UTC(year, monthNumber, 0)).getUTCDate()).padStart(2, "0")}`;

    const [
      existingPods,
      existingEmployees,
      existingBrands,
      existingProcesses,
      existingBp,
      existingAssignments,
      existingLeaves,
      existingHolidays,
    ] = await Promise.all([
      sql`SELECT id, name, lead_employee_id FROM pods;`,
      sql`SELECT id, name, email, pod_id, active FROM employees;`,
      sql`SELECT id, name, code, category, active FROM brands;`,
      sql`SELECT id, name, code FROM processes;`,
      sql`
        SELECT bp.id, b.code as brand_code, p.code as process_code, bp.operating_calendar, 
               COALESCE(mr.operating_calendar, bp.operating_calendar) as month_operating_calendar,
               COALESCE(mr.min_headcount_weekday, bp.min_headcount_weekday) as month_min_headcount_weekday,
               COALESCE(mr.min_headcount_sunday, bp.min_headcount_sunday) as month_min_headcount_sunday,
               COALESCE(mr.min_headcount_holiday, bp.min_headcount_holiday) as month_min_headcount_holiday
        FROM brand_processes bp
        JOIN brands b ON bp.brand_id = b.id
        JOIN processes p ON bp.process_id = p.id
        LEFT JOIN roster_month_rules mr
          ON mr.brand_process_id = bp.id AND mr.month = ${targetMonth};
      `,
      sql`
        SELECT DISTINCT ON (e.id, b.code, p.code)
               a.id, e.id as employee_id, b.code as brand_code, p.code as process_code,
               GREATEST(a.start_date, ${monthStart}::date) as start_date,
               LEAST(COALESCE(a.end_date, ${monthEnd}::date), ${monthEnd}::date) as end_date,
               a.priority, a.is_exclusive
        FROM assignments a
        JOIN employees e ON a.employee_id = e.id
        JOIN brand_processes bp ON a.brand_process_id = bp.id
        JOIN brands b ON bp.brand_id = b.id
        JOIN processes p ON bp.process_id = p.id;
        WHERE a.active = true
          AND a.start_date <= ${monthEnd}
          AND (a.end_date IS NULL OR a.end_date >= ${monthStart})
        ORDER BY e.id, b.code, p.code, a.start_date DESC;
      `,
      sql`
        SELECT id, employee_id,
          GREATEST(start_date, ${monthStart}::date) as start_date,
          LEAST(end_date, ${monthEnd}::date) as end_date,
          type, status
        FROM leaves
        WHERE start_date <= ${monthEnd} AND end_date >= ${monthStart};
      `,
      sql`SELECT id, date, name FROM holidays WHERE date >= ${monthStart} AND date <= ${monthEnd};`,
    ]);

    // Diff pods (natural key: pod_code)
    const podsDiff = computeEntityDiff(
      data.pods,
      existingPods,
      (p) => p.pod_code || p.id,
      (newItem, existing) =>
        newItem.pod_name === existing.name &&
        (newItem.lead_employee_id || null) === (existing.lead_employee_id || null)
    );

    // Diff employees (natural key: employee_id)
    const employeesDiff = computeEntityDiff(
      data.employees,
      existingEmployees,
      (e) => e.employee_id || e.id,
      (newItem, existing) =>
        newItem.name === existing.name &&
        newItem.email === existing.email &&
        newItem.pod_code === existing.pod_id &&
        newItem.active === existing.active
    );

    // Diff brands (natural key: brand_code)
    const brandsDiff = computeEntityDiff(
      data.brands,
      existingBrands,
      (b) => b.brand_code || b.code || b.id,
      (newItem, existing) =>
        newItem.brand_name === existing.name &&
        (newItem.category || null) === (existing.category || null)
    );

    // Diff processes (natural key: process_code)
    const processesDiff = computeEntityDiff(
      data.processes,
      existingProcesses,
      (p) => p.process_code || p.code || p.id,
      (newItem, existing) => newItem.process_name === existing.name
    );

    // Diff schedules (natural key: brand_code + process_code)
    const schedulesDiff = computeEntityDiff(
      data.schedules,
      existingBp,
      (s) => `${s.brand_code}:${s.process_code}`,
      (newItem, existing) =>
        newItem.operating_calendar === existing.month_operating_calendar &&
        newItem.weekday_headcount === existing.month_min_headcount_weekday &&
        newItem.sunday_headcount === existing.month_min_headcount_sunday &&
        newItem.holiday_headcount === existing.month_min_headcount_holiday
    );

    const monthAssignments = data.assignments.flatMap((assignment) => {
      const range = intersectMonthRange(assignment.valid_from, assignment.valid_to, targetMonth);
      return range ? [{ ...assignment, valid_from: range.start, valid_to: range.end }] : [];
    });
    const assignmentsDiff = computeEntityDiff(
      monthAssignments,
      existingAssignments,
      (a) => `${a.employee_id}:${a.brand_code}:${a.process_code}:${targetMonth}`,
      (newItem, existing) =>
        newItem.valid_from === formatDateOnly(existing.start_date) &&
        newItem.valid_to === formatDateOnly(existing.end_date) &&
        newItem.priority === existing.priority &&
        newItem.is_exclusive === existing.is_exclusive
    );

    const monthLeaves = data.leaves.flatMap((leave) => {
      const range = intersectMonthRange(leave.date_from, leave.date_to, targetMonth);
      return range ? [{ ...leave, date_from: range.start, date_to: range.end }] : [];
    });
    const leavesDiff = computeEntityDiff(
      monthLeaves,
      existingLeaves,
      (l) => `${l.employee_id}:${l.date_from}:${l.date_to}`,
      (newItem, existing) =>
        newItem.type === existing.type && newItem.status === existing.status
    );

    // Diff holidays
    const holidaysDiff = computeEntityDiff(
      data.holidays,
      existingHolidays,
      (h) => formatDateOnly(h.date),
      (newItem, existing) => newItem.name === existing.name
    );

    const diff: ImportDiff = {
      pods: podsDiff,
      employees: employeesDiff,
      brands: brandsDiff,
      processes: processesDiff,
      schedules: schedulesDiff,
      assignments: assignmentsDiff,
      leaves: leavesDiff,
      holidays: holidaysDiff,
    };
    for (const entityDiff of Object.values(diff)) entityDiff.removed = 0;

    return NextResponse.json({
      ok: true,
      filename: file.name,
      fileSize: file.size,
      targetMonth,
      importMode: "merge",
      rowCounts: validation.rowCounts,
      errors: [],
      warnings: validation.warnings,
      diff,
    });
  } catch (error: any) {
    console.error("Preview error:", error);
    return NextResponse.json(
      {
        ok: false,
        errors: [{ sheet: "Server", row: 0, field: "exception", message: error.message }],
        warnings: [],
      },
      { status: 500 }
    );
  }
}
