import * as XLSX from "xlsx";

const CSV_TEMPLATE_HEADERS = [
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

export function generateTemplateCsv(): Buffer {
  const worksheet = XLSX.utils.aoa_to_sheet([CSV_TEMPLATE_HEADERS]);
  return Buffer.from(XLSX.utils.sheet_to_csv(worksheet), "utf8");
}

export function generateTemplateWorkbook(): Buffer {
  const wb = XLSX.utils.book_new();

  const sheets = {
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

  for (const [sheetName, headers] of Object.entries(sheets)) {
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([headers]), sheetName);
  }

  const buffer = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
  return buffer;
}
