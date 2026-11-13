// Pure TypeScript types for the Scheduler Engine (No Database or External dependencies)

export type OperatingCalendarType = "all_365" | "daily_no_holidays" | "mon_sat_no_holidays" | "custom";

export interface CustomScheduleConfig {
  activeWeekdays: number[]; // 0 = Sun, 1 = Mon, ..., 6 = Sat
  noHolidays: boolean;
}

export interface BrandProcessRule {
  id: string;
  brandId: string;
  brandName: string;
  processId: string;
  processCode: string; // CS, ACC, RET, NDR
  operatingCalendar: OperatingCalendarType;
  minHeadcountWeekday: number;
  minHeadcountSunday: number;
  minHeadcountHoliday: number;
  customConfig?: CustomScheduleConfig;
}

export interface EmployeeInfo {
  id: string;
  name: string;
  email: string;
  podId?: string;
  active: boolean;
}

export interface AssignmentRule {
  id: string;
  employeeId: string;
  brandProcessId: string;
  startDate: string; // YYYY-MM-DD
  endDate?: string | null;
  priority: number;
  isExclusive?: boolean;
}

export interface WeeklyOffRule {
  id: string;
  employeeId: string;
  weekday: number; // 0 = Sunday, 1 = Monday, ..., 6 = Saturday
  effectiveFrom: string;
  effectiveTo?: string | null;
}

export interface HolidayItem {
  id: string;
  date: string; // YYYY-MM-DD
  name: string;
}

export interface LeaveItem {
  id: string;
  employeeId: string;
  startDate: string; // YYYY-MM-DD
  endDate: string; // YYYY-MM-DD
  type: "planned" | "sick" | "other";
  status: "pending" | "approved" | "rejected";
}

export interface CompOffItem {
  id: string;
  employeeId: string;
  date: string; // YYYY-MM-DD
  status: "pending" | "approved" | "used";
}

export type DayStatus = "working" | "weekly_off" | "leave" | "holiday" | "comp_off" | "unassigned";

export interface RosterDayAssignment {
  employeeId: string;
  date: string; // YYYY-MM-DD
  status: DayStatus;
  brandProcessId?: string | null;
  pinned?: boolean;
  leaveOverride?: boolean;
  notes?: string;
}

export type ConflictSeverity = "blocking" | "warning";

export type ConflictType =
  | "INSUFFICIENT_HEADCOUNT"
  | "UNAVAILABLE_SOLE_RESOURCE"
  | "UNAVAILABLE_LEAVE"
  | "UNAVAILABLE_COMP_OFF"
  | "WEEKLY_OFF_VIOLATION"
  | "CONSECUTIVE_DAYS_WARNING"
  | "OVERALLOCATED_EMPLOYEE";

export interface ConflictItem {
  id: string;
  type: ConflictType;
  severity: ConflictSeverity;
  brandProcessId?: string | null;
  employeeId?: string | null;
  date?: string | null; // YYYY-MM-DD
  message: string;
  suggestedFix?: string;
  resolved?: boolean;
}

export interface RequiredDemandDay {
  brandProcessId: string;
  brandName: string;
  processCode: string;
  date: string; // YYYY-MM-DD
  requiredHeadcount: number;
  isSunday: boolean;
  isHoliday: boolean;
  holidayName?: string;
}

export interface SchedulerInput {
  month: string; // YYYY-MM
  employees: EmployeeInfo[];
  brandProcesses: BrandProcessRule[];
  assignments: AssignmentRule[];
  weeklyOffs: WeeklyOffRule[];
  holidays: HolidayItem[];
  leaves: LeaveItem[];
  compOffs: CompOffItem[];
  existingDays?: RosterDayAssignment[];
  maxProcessesPerEmployeePerDay?: number; // default 2
}

export interface SchedulerOutput {
  month: string;
  days: RosterDayAssignment[];
  conflicts: ConflictItem[];
  metrics: {
    totalRequiredSlots: number;
    filledSlots: number;
    coveragePercentage: number;
    blockingConflictsCount: number;
    warningsCount: number;
  };
}

export interface AvailabilityResult {
  isAvailable: boolean;
  reason?: "ON_LEAVE" | "COMP_OFF" | "WEEKLY_OFF" | "HOLIDAY" | "INACTIVE";
  detail?: string;
}

export interface BackupCandidate {
  employeeId: string;
  employeeName: string;
  qualificationReason: "SAME_PROCESS" | "SAME_BRAND" | "CROSS_TRAINED";
  currentLoadThisMonth: number;
}

