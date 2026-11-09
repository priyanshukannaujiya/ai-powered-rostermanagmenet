// Pure TypeScript constraints for employee availability and eligibility

import {
  EmployeeInfo,
  AssignmentRule,
  WeeklyOffRule,
  LeaveItem,
  CompOffItem,
  AvailabilityResult,
  DayStatus,
  HolidayItem,
} from "./types";
import { getDayOfWeek } from "./calendar";

export interface ConstraintContext {
  employees: EmployeeInfo[];
  assignments: AssignmentRule[];
  weeklyOffs: WeeklyOffRule[];
  leaves: LeaveItem[];
  compOffs: CompOffItem[];
  holidays?: HolidayItem[];
}

/**
 * Checks if an employee has an approved leave on a given date.
 */
export function getApprovedLeaveOnDate(
  employeeId: string,
  date: string,
  leaves: LeaveItem[]
): LeaveItem | undefined {
  return leaves.find(
    (l) =>
      l.employeeId === employeeId &&
      l.status === "approved" &&
      l.startDate <= date &&
      date <= l.endDate
  );
}

/**
 * Checks if an employee has a comp-off on a given date.
 */
export function getCompOffOnDate(
  employeeId: string,
  date: string,
  compOffs: CompOffItem[]
): CompOffItem | undefined {
  return compOffs.find(
    (c) =>
      c.employeeId === employeeId &&
      c.date === date &&
      (c.status === "approved" || c.status === "used")
  );
}

/**
 * Checks if a given date matches the employee's designated weekly off weekday.
 */
export function isDesignatedWeeklyOffDay(
  employeeId: string,
  date: string,
  weeklyOffs: WeeklyOffRule[]
): boolean {
  const dow = getDayOfWeek(date);
  return weeklyOffs.some(
    (w) =>
      w.employeeId === employeeId &&
      w.weekday === dow &&
      w.effectiveFrom <= date &&
      (!w.effectiveTo || w.effectiveTo >= date)
  );
}

/**
 * Checks if an employee is eligible for a specific brand-process based on assignments.
 */
export function isEmployeeEligibleForBrandProcess(
  employeeId: string,
  brandProcessId: string,
  date: string,
  assignments: AssignmentRule[]
): boolean {
  return assignments.some(
    (a) =>
      a.employeeId === employeeId &&
      a.brandProcessId === brandProcessId &&
      a.startDate <= date &&
      (!a.endDate || a.endDate >= date)
  );
}

/**
 * Checks if an employee is available on a given date, giving an explicit reason if not.
 */
export function isAvailable(
  employeeId: string,
  date: string,
  context: ConstraintContext,
  options?: { ignoreWeeklyOff?: boolean }
): AvailabilityResult {
  const employee = context.employees.find((e) => e.id === employeeId);
  if (!employee || !employee.active) {
    return {
      isAvailable: false,
      reason: "INACTIVE",
      detail: `Employee ${employee?.name ?? employeeId} is inactive or not found.`,
    };
  }

  // 1. Approved Leave
  const leave = getApprovedLeaveOnDate(employeeId, date, context.leaves);
  if (leave) {
    return {
      isAvailable: false,
      reason: "ON_LEAVE",
      detail: `On approved ${leave.type} leave from ${leave.startDate} to ${leave.endDate}.`,
    };
  }

  // 2. Comp Off
  const compOff = getCompOffOnDate(employeeId, date, context.compOffs);
  if (compOff) {
    return {
      isAvailable: false,
      reason: "COMP_OFF",
      detail: `Comp-off scheduled on ${date}.`,
    };
  }

  // 3. Weekly Off (unless soft-evaluated during assignment placement)
  if (!options?.ignoreWeeklyOff) {
    const isWO = isDesignatedWeeklyOffDay(employeeId, date, context.weeklyOffs);
    if (isWO) {
      return {
        isAvailable: false,
        reason: "WEEKLY_OFF",
        detail: `Designated weekly-off day on this weekday.`,
      };
    }
  }

  return { isAvailable: true };
}

/**
 * Returns list of all employees eligible for a specific brand-process on a date.
 */
export function getEligibleEmployees(
  brandProcessId: string,
  date: string,
  assignments: AssignmentRule[],
  employees: EmployeeInfo[]
): EmployeeInfo[] {
  const eligibleIds = new Set(
    assignments
      .filter(
        (a) =>
          a.brandProcessId === brandProcessId &&
          a.startDate <= date &&
          (!a.endDate || a.endDate >= date)
      )
      .map((a) => a.employeeId)
  );

  return employees.filter((e) => e.active && eligibleIds.has(e.id));
}

