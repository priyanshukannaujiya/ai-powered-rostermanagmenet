import { formatDateOnly } from "@/lib/date-utils";
import { getMonthBounds } from "@/lib/scheduler/leave-days";

export type CanonicalDayStatus =
  | "working"
  | "weekly_off"
  | "leave"
  | "holiday"
  | "comp_off"
  | "unassigned";

export interface RosterDayRow {
  date: string | Date;
  status: string;
  brandProcessId: string | null;
  brandName: string | null;
  brandCode: string | null;
  processCode: string | null;
  notes: string | null;
  pinned: boolean;
  leaveOverride?: boolean;
}

export interface LeaveRow {
  startDate: string;
  endDate: string;
  type: string;
  status: "pending" | "approved" | "rejected";
}

export interface ScheduleDay {
  date: string;
  dayNum: number;
  /** 0 = Sunday .. 6 = Saturday */
  weekday: number;
  status: CanonicalDayStatus;
  brandName: string | null;
  brandCode: string | null;
  processCode: string | null;
  brand_name?: string | null;
  brand_code?: string | null;
  process_code?: string | null;
  brandProcessId: string | null;
  notes: string | null;
  holidayName: string | null;
  pinned: boolean;
  pendingLeave: boolean;
  assignments: Array<{ brandProcessId: string | null; brandName: string | null; brandCode: string | null; processCode: string | null; notes: string | null; pinned: boolean }>;
}

export interface ScheduleSummary {
  working: number;
  weeklyOff: number;
  leave: number;
  holiday: number;
  compOff: number;
  pendingLeave: number;
  unassigned: number;
}

const STATUS_PRIORITY: Record<string, number> = {
  leave: 5,
  working: 4,
  comp_off: 3,
  holiday: 3,
  weekly_off: 2,
  unassigned: 1,
};

/**
 * Selects the authoritative non-working status for a date.
 * Multiple working process rows are handled separately by the schedule builder.
 */
export function dedupeRosterDays(rows: RosterDayRow[]): Map<string, RosterDayRow> {
  const byDate = new Map<string, RosterDayRow>();
  for (const row of rows) {
    const date = formatDateOnly(row.date);
    if (!date) continue;
    const existing = byDate.get(date);
    if (!existing) {
      byDate.set(date, { ...row, date });
      continue;
    }
    const existingScore = (STATUS_PRIORITY[existing.status] || 0) + (existing.pinned ? 0.5 : 0);
    const incomingScore = (STATUS_PRIORITY[row.status] || 0) + (row.pinned ? 0.5 : 0);
    if (incomingScore > existingScore) {
      byDate.set(date, { ...row, date });
    }
  }
  return byDate;
}

function coversDate(startDate: string, endDate: string, date: string): boolean {
  return startDate <= date && endDate >= date;
}

/**
 * Builds a complete, gap-free calendar for one employee and one month.
 * Every calendar day is present exactly once with an explicit status.
 */
export function buildEmployeeSchedule(params: {
  month: string;
  rosterDays: RosterDayRow[];
  leaves: LeaveRow[];
  weeklyOffWeekdays: number[];
  holidays: Array<{ date: string; name: string }>;
}): { days: ScheduleDay[]; summary: ScheduleSummary } {
  const { month, rosterDays, leaves, weeklyOffWeekdays, holidays } = params;
  const { daysInMonth } = getMonthBounds(month);

  const rosterByDate = dedupeRosterDays(rosterDays);
  const workingRowsByDate = new Map<string, RosterDayRow[]>();
  for (const row of rosterDays) {
    const date = formatDateOnly(row.date);
    if (!date || row.status !== "working" || !row.brandProcessId) continue;
    const rows = workingRowsByDate.get(date) || [];
    if (!rows.some((item) => item.brandProcessId === row.brandProcessId)) rows.push({ ...row, date });
    workingRowsByDate.set(date, rows);
  }
  const holidayByDate = new Map<string, string>();
  for (const holiday of holidays) {
    const date = formatDateOnly(holiday.date);
    if (date) holidayByDate.set(date, holiday.name);
  }
  const weeklyOffSet = new Set(weeklyOffWeekdays);
  const approvedLeaves = leaves
    .filter((leave) => leave.status === "approved")
    .map((leave) => ({
      ...leave,
      startDate: formatDateOnly(leave.startDate),
      endDate: formatDateOnly(leave.endDate),
    }));
  const pendingLeaves = leaves
    .filter((leave) => leave.status === "pending")
    .map((leave) => ({
      ...leave,
      startDate: formatDateOnly(leave.startDate),
      endDate: formatDateOnly(leave.endDate),
    }));

  const days: ScheduleDay[] = [];
  const summary: ScheduleSummary = {
    working: 0,
    weeklyOff: 0,
    leave: 0,
    holiday: 0,
    compOff: 0,
    pendingLeave: 0,
    unassigned: 0,
  };

  for (let dayNum = 1; dayNum <= daysInMonth; dayNum += 1) {
    const date = `${month}-${String(dayNum).padStart(2, "0")}`;
    const weekday = new Date(`${date}T00:00:00.000Z`).getUTCDay();
    const roster = rosterByDate.get(date);
    const workingRows = workingRowsByDate.get(date) || [];
    const approvedLeave = approvedLeaves.find((leave) => coversDate(leave.startDate, leave.endDate, date));
    const pendingLeave = pendingLeaves.find((leave) => coversDate(leave.startDate, leave.endDate, date));
    const holidayName = holidayByDate.get(date) || null;

    let status: CanonicalDayStatus;
    let brandName: string | null = null;
    let brandCode: string | null = null;
    let processCode: string | null = null;
    let brandProcessId: string | null = null;
    let notes: string | null = null;

    const managerOverride = workingRows.some((row) => row.pinned && row.leaveOverride === true);
    if (approvedLeave && !managerOverride) {
      status = "leave";
      notes = "Approved Leave";
    } else if (workingRows.length > 0 && (!approvedLeave || managerOverride)) {
      status = "working";
      const primary = workingRows[0];
      brandName = primary.brandName;
      brandCode = primary.brandCode;
      processCode = primary.processCode;
      brandProcessId = primary.brandProcessId;
      notes = primary.notes;
    } else if (roster && roster.status !== "unassigned") {
      status = (roster.status as CanonicalDayStatus) || "unassigned";
      notes = roster.notes;
    } else if (holidayName) {
      status = "holiday";
      notes = holidayName;
    } else if (weeklyOffSet.has(weekday)) {
      status = "weekly_off";
    } else {
      status = "unassigned";
    }

    if (status !== "working") {
      brandName = null;
      brandCode = null;
      processCode = null;
      brandProcessId = null;
    }

    if (pendingLeave && status !== "leave") {
      notes = "Leave request pending approval";
    }

    switch (status) {
      case "working":
        summary.working += 1;
        break;
      case "weekly_off":
        summary.weeklyOff += 1;
        break;
      case "leave":
        summary.leave += 1;
        break;
      case "holiday":
        summary.holiday += 1;
        break;
      case "comp_off":
        summary.compOff += 1;
        break;
      default:
        summary.unassigned += 1;
        break;
    }
    if (pendingLeave) summary.pendingLeave += 1;

    days.push({
      date,
      dayNum,
      weekday,
      status,
      brandName,
      brandCode,
      processCode,
      brand_name: brandName,
      brand_code: brandCode,
      process_code: processCode,
      brandProcessId,
      notes,
      holidayName,
      pinned: Boolean(roster?.pinned) || status === "leave",
      pendingLeave: Boolean(pendingLeave),
      assignments: status === "working" ? workingRows.map((row) => ({
        brandProcessId: row.brandProcessId,
        brandName: row.brandName,
        brandCode: row.brandCode,
        processCode: row.processCode,
        notes: row.notes,
        pinned: row.pinned,
      })) : [],
    });
  }

  return { days, summary };
}
