import * as XLSX from "xlsx";
import { ParsedWorkbook } from "./types";

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
