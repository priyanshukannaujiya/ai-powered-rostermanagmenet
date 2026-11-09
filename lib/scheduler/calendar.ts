// Pure TypeScript calendar and demand expansion

import { BrandProcessRule, HolidayItem, RequiredDemandDay } from "./types";

/**
 * Returns all dates in 'YYYY-MM-DD' format for a given 'YYYY-MM' month string.
 */
export function getDatesInMonth(month: string): string[] {
  const [yearStr, monthStr] = month.split("-");
  const year = parseInt(yearStr, 10);
  const monthNum = parseInt(monthStr, 10); // 1-12

  // Month in JS Date is 0-indexed; day 0 of next month is last day of this month
  const totalDays = new Date(year, monthNum, 0).getDate();
  const dates: string[] = [];

  for (let d = 1; d <= totalDays; d++) {
    const dayPadded = String(d).padStart(2, "0");
    const monthPadded = String(monthNum).padStart(2, "0");
    dates.push(`${year}-${monthPadded}-${dayPadded}`);
  }

  return dates;
}

/**
 * Returns day of week: 0 = Sunday, 1 = Monday, ..., 6 = Saturday
 */
export function getDayOfWeek(dateStr: string): number {
  const [year, month, day] = dateStr.split("-").map(Number);
  return new Date(year, month - 1, day).getDay();
}

/**
 * Formats a date string into friendly readable format, e.g. "Sun, 15 Nov 2026"
 */
export function formatFriendlyDate(dateStr: string): string {
  const [year, month, day] = dateStr.split("-").map(Number);
  const d = new Date(year, month - 1, day);
  return d.toLocaleDateString("en-US", {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

/**
 * Expands a brand-process rule into the list of required operating dates in a month with headcount requirements.
 */
export function expandDemandForMonth(
  month: string,
  rule: BrandProcessRule,
  holidays: HolidayItem[]
): RequiredDemandDay[] {
  const dates = getDatesInMonth(month);
  const holidayMap = new Map<string, string>();
  for (const h of holidays) {
    holidayMap.set(h.date, h.name);
  }

  const demands: RequiredDemandDay[] = [];

  for (const date of dates) {
    const dow = getDayOfWeek(date);
    const isSunday = dow === 0;
    const isHoliday = holidayMap.has(date);
    const holidayName = holidayMap.get(date);

    let isOperating = false;
    let requiredHeadcount = 0;

    switch (rule.operatingCalendar) {
      case "all_365": {
        isOperating = true;
        if (isHoliday) {
          requiredHeadcount =
            rule.minHeadcountHoliday > 0
              ? rule.minHeadcountHoliday
              : isSunday && rule.minHeadcountSunday > 0
              ? rule.minHeadcountSunday
              : rule.minHeadcountWeekday;
        } else if (isSunday) {
          requiredHeadcount =
            rule.minHeadcountSunday > 0 ? rule.minHeadcountSunday : rule.minHeadcountWeekday;
        } else {
          requiredHeadcount = rule.minHeadcountWeekday;
        }
        break;
      }
      case "daily_no_holidays": {
        if (!isHoliday) {
          isOperating = true;
          requiredHeadcount =
            isSunday && rule.minHeadcountSunday > 0
              ? rule.minHeadcountSunday
              : rule.minHeadcountWeekday;
        }
        break;
      }
      case "mon_sat_no_holidays": {
        if (!isSunday && !isHoliday) {
          isOperating = true;
          requiredHeadcount = rule.minHeadcountWeekday;
        }
        break;
      }
      case "custom": {
        const activeWeekdays = rule.customConfig?.activeWeekdays ?? [1, 2, 3, 4, 5];
        const skipHolidays = rule.customConfig?.noHolidays ?? true;

        if (skipHolidays && isHoliday) {
          isOperating = false;
        } else if (activeWeekdays.includes(dow)) {
          isOperating = true;
          if (isHoliday && rule.minHeadcountHoliday > 0) {
            requiredHeadcount = rule.minHeadcountHoliday;
          } else if (isSunday && rule.minHeadcountSunday > 0) {
            requiredHeadcount = rule.minHeadcountSunday;
          } else {
            requiredHeadcount = rule.minHeadcountWeekday;
          }
        }
        break;
      }
    }

    if (isOperating && requiredHeadcount > 0) {
      demands.push({
        brandProcessId: rule.id,
        brandName: rule.brandName,
        processCode: rule.processCode,
        date,
        requiredHeadcount,
        isSunday,
        isHoliday,
        holidayName,
      });
    }
  }

  return demands;
}

