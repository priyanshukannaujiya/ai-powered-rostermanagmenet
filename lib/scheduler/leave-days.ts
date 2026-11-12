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

/** Strictly validates that a string is a valid YYYY-MM-DD calendar date (e.g. rejects 2026-02-31, 2026-11-31). */
export function isValidCalendarDate(dateStr: string): boolean {
  if (typeof dateStr !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
    return false;
  }
  const [yearStr, monthStr, dayStr] = dateStr.split("-");
  const year = parseInt(yearStr, 10);
  const month = parseInt(monthStr, 10);
  const day = parseInt(dayStr, 10);

  if (month < 1 || month > 12) return false;
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return day >= 1 && day <= daysInMonth;
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

/**
 * Every `YYYY-MM-DD` between two dates, inclusive.
 * Strictly validates calendar dates, prevents inverted ranges, and rejects ranges > 366 days
 * instead of silently truncating.
 */
export function enumerateDateRange(startDate: string, endDate: string): string[] {
  const normStart = formatDateOnly(startDate);
  const normEnd = formatDateOnly(endDate);

  if (!isValidCalendarDate(normStart)) {
    throw new Error(`Invalid start date: '${startDate}' is not a valid calendar date.`);
  }
  if (!isValidCalendarDate(normEnd)) {
    throw new Error(`Invalid end date: '${endDate}' is not a valid calendar date.`);
  }

  const cursor = new Date(`${normStart}T00:00:00.000Z`);
  const end = new Date(`${normEnd}T00:00:00.000Z`);

  if (cursor > end) {
    throw new Error(`Invalid date range: start date '${normStart}' cannot be after end date '${normEnd}'.`);
  }

  const diffDays = Math.round((end.getTime() - cursor.getTime()) / 86400000) + 1;
  if (diffDays > 366) {
    throw new Error(`Date range (${diffDays} days) exceeds maximum allowable duration of 366 days.`);
  }

  const dates: string[] = [];
  while (cursor <= end) {
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
