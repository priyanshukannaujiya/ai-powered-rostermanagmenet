import type { NeonQueryFunction } from "@neondatabase/serverless";
import { formatDateOnly } from "@/lib/date-utils";

export const APPROVED_LEAVE_NOTE = "Approved Leave";

export interface MonthBounds {
  /** YYYY-MM-DD */
  start: string;
  /** YYYY-MM-DD */
  end: string;
  daysInMonth: number;
}

/** Inclusive calendar bounds for a `YYYY-MM` month, safe for 28/29/30/31-day months. */
export function getMonthBounds(month: string): MonthBounds {
  const [yearStr, monthStr] = month.split("-");
  const year = parseInt(yearStr, 10);
  const monthIndex = parseInt(monthStr, 10);
  const daysInMonth = new Date(Date.UTC(year, monthIndex, 0)).getUTCDate();
  return {
    start: `${month}-01`,
    end: `${month}-${String(daysInMonth).padStart(2, "0")}`,
    daysInMonth,
  };
}

/** Every `YYYY-MM-DD` between two dates, inclusive. */
export function enumerateDateRange(startDate: string, endDate: string): string[] {
  const dates: string[] = [];
  const cursor = new Date(`${formatDateOnly(startDate)}T00:00:00.000Z`);
  const end = new Date(`${formatDateOnly(endDate)}T00:00:00.000Z`);
  if (Number.isNaN(cursor.getTime()) || Number.isNaN(end.getTime())) return dates;

  while (cursor <= end && dates.length <= 400) {
    dates.push(cursor.toISOString().slice(0, 10));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return dates;
}

/** Groups an inclusive date range into `YYYY-MM` buckets. */
export function groupDatesByMonth(dates: string[]): Map<string, string[]> {
  const grouped = new Map<string, string[]>();
  for (const date of dates) {
    const month = date.slice(0, 7);
    const bucket = grouped.get(month);
    if (bucket) bucket.push(date);
    else grouped.set(month, [date]);
  }
  return grouped;
}

/**
 * Deterministically converts an employee's dates into pinned `leave` roster days.
 *
 * The prior record for `(month, employee, date)` is deleted first, so a stale
 * working shift can never survive alongside the approved leave (the unique index
 * treats NULL `brand_process_id` values as distinct, which would otherwise let
 * duplicates accumulate).
 */
export async function pinEmployeeLeaveDays(
  sql: NeonQueryFunction<false, false>,
  monthId: string,
  employeeId: string,
  dates: string[]
): Promise<number> {
  if (dates.length === 0) return 0;

  for (const date of dates) {
    await sql`
      DELETE FROM roster_days
      WHERE roster_month_id = ${monthId} AND employee_id = ${employeeId} AND date = ${date};
    `;
    const rdId = `rd-${monthId}-${employeeId}-${date}-leave`;
    await sql`
      INSERT INTO roster_days (
        id, roster_month_id, employee_id, date, status, brand_process_id, pinned, notes, created_at, updated_at
      )
      VALUES (
        ${rdId}, ${monthId}, ${employeeId}, ${date}, 'leave', NULL, true, ${APPROVED_LEAVE_NOTE}, now(), now()
      );
    `;
  }

  return dates.length;
}

/** True when the date falls inside the approved-leave window for that employee. */
export function isDateOnApprovedLeave(
  date: string,
  employeeId: string,
  leaveEmployeeId: string,
  startDate: string,
  endDate: string
): boolean {
  return employeeId === leaveEmployeeId && date >= startDate && date <= endDate;
}
