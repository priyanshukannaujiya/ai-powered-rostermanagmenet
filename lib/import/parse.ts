import * as XLSX from "xlsx";
import { EmployeeRow, ParsedWorkbook, ScheduleRow } from "./types";

export interface ParseResult {
  ok: boolean;
  data?: ParsedWorkbook;
  errors?: string[];
}

export const REQUIRED_SHEETS: Record<string, string[]> = {
  Pods: ["pod_code", "pod_name", "lead_employee_id"],
  Employees: ["employee_id", "name", "email", "pod_code", "weekly_off_day", "active"],
  Brands: ["brand_code", "brand_name", "category"],
  Processes: ["process_code", "process_name"],
  Schedules: [
    "brand_code",
    "process_code",
    "operating_calendar",
    "weekday_headcount",
    "sunday_headcount",
    "holiday_headcount",
    "min_staff_required",
  ],
  Assignments: [
    "employee_id",
    "brand_code",
    "process_code",
    "valid_from",
    "valid_to",
    "priority",
    "is_exclusive",
  ],
  Leaves: ["employee_id", "date_from", "date_to", "type", "status"],
  Holidays: ["date", "name"],
};

export function normalizeBoolean(val: any): boolean {
  if (typeof val === "boolean") return val;
  if (typeof val === "number") return val === 1;
  if (!val) return false;
  const str = String(val).trim().toLowerCase();
  return str === "true" || str === "yes" || str === "1" || str === "y" || str === "t";
}

export function normalizeDate(val: any): string {
  if (!val && val !== 0) return "";
  if (val instanceof Date) {
    const y = val.getFullYear();
    const m = String(val.getMonth() + 1).padStart(2, "0");
    const d = String(val.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }
  if (typeof val === "number") {
    // Excel serial number
    const dateObj = XLSX.SSF.parse_date_code(val);
    if (dateObj) {
      const y = dateObj.y;
      const m = String(dateObj.m).padStart(2, "0");
      const d = String(dateObj.d).padStart(2, "0");
      return `${y}-${m}-${d}`;
    }
  }
  const str = String(val).trim();
  return str;
}

export function parseWorkbookBuffer(buffer: Buffer): ParseResult {
  const missingSheetErrors: string[] = [];
  const missingHeaderErrors: string[] = [];

  let wb: XLSX.WorkBook;
  try {
    wb = XLSX.read(buffer, { type: "buffer", cellDates: true });
  } catch (err: any) {
    return { ok: false, errors: [`Failed to read Excel workbook: ${err.message}`] };
  }

  // Check required sheets
  const existingSheetNames = new Set(wb.SheetNames.map((s) => s.trim().toLowerCase()));
  for (const sheetName of Object.keys(REQUIRED_SHEETS)) {
    if (!existingSheetNames.has(sheetName.toLowerCase())) {
      missingSheetErrors.push(`Missing required sheet: "${sheetName}"`);
    }
  }

  if (missingSheetErrors.length > 0) {
    return { ok: false, errors: missingSheetErrors };
  }

  const getSheet = (name: string): XLSX.WorkSheet => {
    const actualName = wb.SheetNames.find((s) => s.trim().toLowerCase() === name.toLowerCase())!;
    return wb.Sheets[actualName];
  };

  // Check required headers per sheet
  for (const [sheetName, reqHeaders] of Object.entries(REQUIRED_SHEETS)) {
    const ws = getSheet(sheetName);
    const rows = XLSX.utils.sheet_to_json<any>(ws, { header: 1 });
    const firstRow: any[] = rows[0] || [];
    const headers = firstRow.map((h) => String(h || "").trim().toLowerCase());

    for (const h of reqHeaders) {
      if (!headers.includes(h.toLowerCase())) {
        missingHeaderErrors.push(
          `Sheet "${sheetName}" is missing required column header: "${h}"`
        );
      }
    }
  }

  if (missingHeaderErrors.length > 0) {
    return { ok: false, errors: missingHeaderErrors };
  }

  // Read and normalize sheet rows
  const readRows = (sheetName: string): any[] => {
    const ws = getSheet(sheetName);
    const raw: any[] = XLSX.utils.sheet_to_json(ws, { defval: "" });
    // Normalize keys to lowercase snake_case
    return raw.map((row) => {
      const normalized: Record<string, any> = {};
      for (const [k, v] of Object.entries(row)) {
        normalized[k.trim().toLowerCase()] = v;
      }
      return normalized;
    });
  };

  const podsRaw = readRows("Pods");
  const pods = podsRaw.map((r) => ({
    pod_code: String(r.pod_code || "").trim().toUpperCase(),
    pod_name: String(r.pod_name || "").trim(),
    lead_employee_id: r.lead_employee_id ? String(r.lead_employee_id).trim().toUpperCase() : null,
  }));

  const employeesRaw = readRows("Employees");
  const employees = employeesRaw.map((r) => ({
    employee_id: String(r.employee_id || "").trim().toUpperCase(),
    name: String(r.name || "").trim(),
    email: String(r.email || "").trim().toLowerCase(),
    pod_code: String(r.pod_code || "").trim().toUpperCase(),
    weekly_off_day: String(r.weekly_off_day || "").trim().toUpperCase() as any,
    active: normalizeBoolean(r.active),
  }));

  const brandsRaw = readRows("Brands");
  const brands = brandsRaw.map((r) => ({
    brand_code: String(r.brand_code || "").trim().toUpperCase(),
    brand_name: String(r.brand_name || "").trim(),
    category: r.category ? String(r.category).trim() : null,
  }));

  const processesRaw = readRows("Processes");
  const processes = processesRaw.map((r) => ({
    process_code: String(r.process_code || "").trim().toUpperCase(),
    process_name: String(r.process_name || "").trim(),
  }));

  const schedulesRaw = readRows("Schedules");
  const schedules = schedulesRaw.map((r) => ({
    brand_code: String(r.brand_code || "").trim().toUpperCase(),
    process_code: String(r.process_code || "").trim().toUpperCase(),
    operating_calendar: String(r.operating_calendar || "").trim().toLowerCase() as any,
    weekday_headcount: parseInt(r.weekday_headcount, 10) || 0,
    sunday_headcount: parseInt(r.sunday_headcount, 10) || 0,
    holiday_headcount: parseInt(r.holiday_headcount, 10) || 0,
    min_staff_required: parseInt(r.min_staff_required, 10) || 0,
  }));

  const assignmentsRaw = readRows("Assignments");
  const assignments = assignmentsRaw.map((r) => ({
    employee_id: String(r.employee_id || "").trim().toUpperCase(),
    brand_code: String(r.brand_code || "").trim().toUpperCase(),
    process_code: String(r.process_code || "").trim().toUpperCase(),
    valid_from: normalizeDate(r.valid_from),
    valid_to: r.valid_to ? normalizeDate(r.valid_to) : null,
    priority: parseInt(r.priority, 10) || 1,
    is_exclusive: normalizeBoolean(r.is_exclusive),
  }));

  const leavesRaw = readRows("Leaves");
  const leaves = leavesRaw.map((r) => ({
    employee_id: String(r.employee_id || "").trim().toUpperCase(),
    date_from: normalizeDate(r.date_from),
    date_to: normalizeDate(r.date_to),
    type: String(r.type || "leave").trim().toLowerCase() as any,
    status: String(r.status || "pending").trim().toLowerCase() as any,
  }));

  const holidaysRaw = readRows("Holidays");
  const holidays = holidaysRaw.map((r) => ({
    date: normalizeDate(r.date),
    name: String(r.name || "").trim(),
  }));

  return {
    ok: true,
    data: {
      pods,
      employees,
      brands,
      processes,
      schedules,
      assignments,
      leaves,
      holidays,
    },
  };
}

const REQUIRED_CSV_HEADERS = [
  "schedule_month",
  "pod_code",
  "pod_name",
  "pod_lead_employee_id",
  "employee_id",
  "employee_name",
  "employee_email",
  "initial_password",
  "weekly_off_day",
  "employee_active",
  "brand_code",
  "brand_name",
  "brand_category",
  "process_code",
  "process_name",
  "operating_calendar",
  "weekday_headcount",
  "sunday_headcount",
  "holiday_headcount",
  "min_staff_required",
  "valid_from",
  "valid_to",
  "priority",
  "is_exclusive",
];

export function parseRosterCsvBuffer(buffer: Buffer): ParseResult {
  let workbook: XLSX.WorkBook;
  try {
    workbook = XLSX.read(buffer, { type: "buffer", raw: true });
  } catch (error) {
    return {
      ok: false,
      errors: [`Failed to read CSV: ${error instanceof Error ? error.message : String(error)}`],
    };
  }

  const firstSheet = workbook.SheetNames[0];
  if (!firstSheet) {
    return { ok: false, errors: ["CSV file is empty"] };
  }

  const sheet = workbook.Sheets[firstSheet];
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: "" });
  if (rows.length === 0) {
    return { ok: false, errors: ["CSV file must contain a header and at least one data row"] };
  }

  const normalizeKey = (key: string) => key.trim().toLowerCase();
  const normalizedRows = rows.map((row) =>
    Object.fromEntries(Object.entries(row).map(([key, value]) => [normalizeKey(key), value]))
  );
  const headers = new Set(Object.keys(normalizedRows[0]));
  const missingHeaders = REQUIRED_CSV_HEADERS.filter((header) => !headers.has(header));
  if (missingHeaders.length > 0) {
    return {
      ok: false,
      errors: missingHeaders.map((header) => `Missing required CSV column: "${header}"`),
    };
  }

  const errors: string[] = [];
  const targetMonths = new Set<string>();
  const dedupe = <T>(keyFor: (value: T) => string, name: string, values: T[]): T[] => {
    const result = new Map<string, { value: T; row: number }>();
    for (const [index, value] of values.entries()) {
      const key = keyFor(value);
      const existing = result.get(key);
      if (existing && JSON.stringify(existing.value) !== JSON.stringify(value)) {
        errors.push(`${name} "${key}" has inconsistent values on CSV rows ${existing.row} and ${index + 2}`);
      } else if (!existing) {
        result.set(key, { value, row: index + 2 });
      }
    }
    return [...result.values()].map(({ value }) => value);
  };

  normalizedRows.forEach((row, index) => {
    const rowNumber = index + 2;
    const month = String(row.schedule_month || "").trim();
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) {
      errors.push(`CSV row ${rowNumber}: schedule_month must be YYYY-MM`);
    } else {
      targetMonths.add(month);
    }
  });
  if (targetMonths.size > 1) {
    errors.push("All CSV rows must use the same schedule_month");
  }

  const read = (row: Record<string, unknown>, key: string) => String(row[key] ?? "").trim();
  const required = (row: Record<string, unknown>, key: string, rowNumber: number) => {
    const value = read(row, key);
    if (!value) errors.push(`CSV row ${rowNumber}: ${key} cannot be empty`);
    return value;
  };
  const number = (row: Record<string, unknown>, key: string, rowNumber: number) => {
    const value = read(row, key);
    if (!/^\d+$/.test(value)) {
      errors.push(`CSV row ${rowNumber}: ${key} must be a non-negative integer`);
      return 0;
    }
    return Number(value);
  };

  const pods = normalizedRows.map((row, index) => {
    const rowNumber = index + 2;
    return {
      pod_code: required(row, "pod_code", rowNumber).toUpperCase(),
      pod_name: required(row, "pod_name", rowNumber),
      lead_employee_id: read(row, "pod_lead_employee_id").toUpperCase() || null,
    };
  });
  const employees = normalizedRows.map((row, index) => {
    const rowNumber = index + 2;
    return {
      employee_id: required(row, "employee_id", rowNumber).toUpperCase(),
      name: required(row, "employee_name", rowNumber),
      email: required(row, "employee_email", rowNumber).toLowerCase(),
      initial_password: read(row, "initial_password"),
      pod_code: required(row, "pod_code", rowNumber).toUpperCase(),
      weekly_off_day: required(row, "weekly_off_day", rowNumber).toUpperCase() as EmployeeRow["weekly_off_day"],
      active: normalizeBoolean(row.employee_active),
    };
  });

  const assignedRows = normalizedRows.filter((row) =>
    [row.brand_code, row.brand_name, row.process_code, row.process_name].some((value) => String(value ?? "").trim())
  );
  const brands = assignedRows.map((row) => ({
    brand_code: read(row, "brand_code").toUpperCase(),
    brand_name: read(row, "brand_name"),
    category: read(row, "brand_category") || null,
  }));
  const processes = assignedRows.map((row) => ({
    process_code: read(row, "process_code").toUpperCase(),
    process_name: read(row, "process_name"),
  }));
  const schedules = assignedRows.map((row, index) => ({
    brand_code: required(row, "brand_code", index + 2).toUpperCase(),
    process_code: required(row, "process_code", index + 2).toUpperCase(),
    operating_calendar: required(row, "operating_calendar", index + 2).toLowerCase() as ScheduleRow["operating_calendar"],
    weekday_headcount: number(row, "weekday_headcount", index + 2),
    sunday_headcount: number(row, "sunday_headcount", index + 2),
    holiday_headcount: number(row, "holiday_headcount", index + 2),
    min_staff_required: number(row, "min_staff_required", index + 2),
  }));
  const assignments = assignedRows.map((row, index) => ({
    employee_id: required(row, "employee_id", index + 2).toUpperCase(),
    brand_code: required(row, "brand_code", index + 2).toUpperCase(),
    process_code: required(row, "process_code", index + 2).toUpperCase(),
    valid_from: normalizeDate(row.valid_from),
    valid_to: read(row, "valid_to") ? normalizeDate(row.valid_to) : null,
    priority: number(row, "priority", index + 2),
    is_exclusive: normalizeBoolean(row.is_exclusive),
  }));

  const data: ParsedWorkbook = {
    target_month: [...targetMonths][0],
    pods: dedupe((value) => value.pod_code, "Pod", pods),
    employees: dedupe((value) => value.employee_id, "Employee", employees),
    brands: dedupe((value) => value.brand_code, "Brand", brands),
    processes: dedupe((value) => value.process_code, "Process", processes),
    schedules: dedupe((value) => `${value.brand_code}:${value.process_code}`, "Schedule", schedules),
    assignments: dedupe(
      (value) => `${value.employee_id}:${value.brand_code}:${value.process_code}:${value.valid_from}`,
      "Assignment",
      assignments
    ),
    leaves: [],
    holidays: [],
  };

  if (errors.length > 0) return { ok: false, errors };
  return { ok: true, data };
}

export function parseImportFileBuffer(buffer: Buffer, filename: string): ParseResult {
  return filename.toLowerCase().endsWith(".csv")
    ? parseRosterCsvBuffer(buffer)
    : parseWorkbookBuffer(buffer);
}
