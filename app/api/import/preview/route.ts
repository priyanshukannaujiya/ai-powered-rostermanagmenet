import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth-helpers";
import { neon } from "@neondatabase/serverless";
import "@/lib/db/dns-patch";
import { parseWorkbookBuffer } from "@/lib/import/parse";
import { validateWorkbook, computeEntityDiff } from "@/lib/import/validate";
import { ImportDiff } from "@/lib/import/types";
import { formatDateOnly } from "@/lib/date-utils";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const { user, errorResponse } = await requireAuth(["manager"]);
  if (errorResponse) return errorResponse;

  try {
    const formData = await req.formData();
    const file = formData.get("file") as File | null;

    if (!file) {
      return NextResponse.json(
        { ok: false, errors: [{ sheet: "File", row: 0, field: "file", message: "No Excel file uploaded" }] },
        { status: 400 }
      );
    }

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // 1. Parse buffer and check sheet/header structure
    const parseResult = parseWorkbookBuffer(buffer);
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
    const validation = validateWorkbook(parseResult.data);
    if (!validation.ok) {
      return NextResponse.json(
        {
          ok: false,
          errors: validation.errors,
          warnings: validation.warnings,
          rowCounts: validation.rowCounts,
        },
        { status: 422 }
      );
    }

    // 3. Compute Diff against current database without writing
    const sql = neon(process.env.DATABASE_URL!);

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
               bp.min_headcount_weekday, bp.min_headcount_sunday, bp.min_headcount_holiday
        FROM brand_processes bp
        JOIN brands b ON bp.brand_id = b.id
        JOIN processes p ON bp.process_id = p.id;
      `,
      sql`
        SELECT a.id, e.id as employee_id, b.code as brand_code, p.code as process_code,
               a.start_date, a.end_date, a.priority, a.is_exclusive
        FROM assignments a
        JOIN employees e ON a.employee_id = e.id
        JOIN brand_processes bp ON a.brand_process_id = bp.id
        JOIN brands b ON bp.brand_id = b.id
        JOIN processes p ON bp.process_id = p.id;
      `,
      sql`SELECT id, employee_id, start_date, end_date, type, status FROM leaves;`,
      sql`SELECT id, date, name FROM holidays;`,
    ]);

    const data = parseResult.data;

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
        newItem.operating_calendar === existing.operating_calendar &&
        newItem.weekday_headcount === existing.min_headcount_weekday &&
        newItem.sunday_headcount === existing.min_headcount_sunday &&
        newItem.holiday_headcount === existing.min_headcount_holiday
    );

    // Diff assignments (natural key: employee_id + brand_code + process_code + valid_from)
    const assignmentsDiff = computeEntityDiff(
      data.assignments,
      existingAssignments,
      (a) => `${a.employee_id}:${a.brand_code}:${a.process_code}:${formatDateOnly(a.valid_from || a.start_date)}`,
      (newItem, existing) =>
        newItem.priority === existing.priority &&
        newItem.is_exclusive === existing.is_exclusive &&
        (newItem.valid_to || null) === (existing.end_date ? formatDateOnly(existing.end_date) : null)
    );

    // Diff leaves
    const leavesDiff = computeEntityDiff(
      data.leaves,
      existingLeaves,
      (l) => `${l.employee_id}:${formatDateOnly(l.date_from || l.start_date)}:${formatDateOnly(l.date_to || l.end_date)}`,
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

    return NextResponse.json({
      ok: true,
      filename: file.name,
      fileSize: file.size,
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
