export interface PodRow {
  pod_code: string;
  pod_name: string;
  lead_employee_id?: string | null;
}

export interface EmployeeRow {
  employee_id: string;
  name: string;
  email: string;
  pod_code: string;
  weekly_off_day: "MON" | "TUE" | "WED" | "THU" | "FRI" | "SAT" | "SUN";
  active: boolean;
}

export interface BrandRow {
  brand_code: string;
  brand_name: string;
  category?: string | null;
}

export interface ProcessRow {
  process_code: string;
  process_name: string;
}

export interface ScheduleRow {
  brand_code: string;
  process_code: string;
  operating_calendar: "all_365" | "daily_no_holidays" | "mon_sat_no_holidays" | "custom";
  weekday_headcount: number;
  sunday_headcount: number;
  holiday_headcount: number;
  min_staff_required: number;
}

export interface AssignmentRow {
  employee_id: string;
  brand_code: string;
  process_code: string;
  valid_from: string; // YYYY-MM-DD
  valid_to?: string | null; // YYYY-MM-DD
  priority: number;
  is_exclusive: boolean;
}

export interface LeaveRow {
  employee_id: string;
  date_from: string; // YYYY-MM-DD
  date_to: string; // YYYY-MM-DD
  type: "leave" | "comp_off";
  status: "approved" | "pending";
}

export interface HolidayRow {
  date: string; // YYYY-MM-DD
  name: string;
}

export interface ParsedWorkbook {
  pods: PodRow[];
  employees: EmployeeRow[];
  brands: BrandRow[];
  processes: ProcessRow[];
  schedules: ScheduleRow[];
  assignments: AssignmentRow[];
  leaves: LeaveRow[];
  holidays: HolidayRow[];
}

export interface ValidationError {
  sheet: string;
  row: number;
  field: string;
  message: string;
}

export interface ValidationWarning {
  code: string;
  message: string;
  details?: any;
}

export interface EntityDiff {
  added: number;
  changed: number;
  unchanged: number;
  removed: number;
  sampleAdded?: string[];
  sampleChanged?: string[];
  sampleRemoved?: string[];
}

export interface ImportDiff {
  pods: EntityDiff;
  employees: EntityDiff;
  brands: EntityDiff;
  processes: EntityDiff;
  schedules: EntityDiff;
  assignments: EntityDiff;
  leaves: EntityDiff;
  holidays: EntityDiff;
}

export interface ValidationResult {
  ok: boolean;
  errors: ValidationError[];
  warnings: ValidationWarning[];
  data?: ParsedWorkbook;
  diff?: ImportDiff;
  rowCounts?: Record<string, number>;
}
