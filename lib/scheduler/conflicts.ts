// Pure TypeScript conflict generation and detection for post-solve roster validation

import {
  SchedulerInput,
  ConflictItem,
  RosterDayAssignment,
  RequiredDemandDay,
} from "./types";
import { formatFriendlyDate, getDayOfWeek } from "./calendar";

/**
 * Validates a solved roster against requirements and rules, producing detailed explainable conflicts.
 */
export function validateRosterAndGenerateConflicts(
  input: SchedulerInput,
  demands: RequiredDemandDay[],
  assignments: RosterDayAssignment[]
): ConflictItem[] {
  const conflicts: ConflictItem[] = [];

  // Index assignments by date and employee
  const dayEmpMap = new Map<string, RosterDayAssignment[]>(); // key: `${date}_${employeeId}`
  const bpDateAssignedEmps = new Map<string, Set<string>>(); // key: `${bpId}_${date}`

  for (const asgn of assignments) {
    const dayEmpKey = `${asgn.date}_${asgn.employeeId}`;
    if (!dayEmpMap.has(dayEmpKey)) {
      dayEmpMap.set(dayEmpKey, []);
    }
    dayEmpMap.get(dayEmpKey)!.push(asgn);

    if (asgn.status === "working" && asgn.brandProcessId) {
      const bpKey = `${asgn.brandProcessId}_${asgn.date}`;
      if (!bpDateAssignedEmps.has(bpKey)) {
        bpDateAssignedEmps.set(bpKey, new Set());
      }
      bpDateAssignedEmps.get(bpKey)!.add(asgn.employeeId);
    }
  }

  // 1. Demand coverage checks
  for (const demand of demands) {
    const bpKey = `${demand.brandProcessId}_${demand.date}`;
    const assignedEmps = bpDateAssignedEmps.get(bpKey) || new Set();
    const count = assignedEmps.size;

    if (count < demand.requiredHeadcount) {
      const shortage = demand.requiredHeadcount - count;
      const friendlyDate = formatFriendlyDate(demand.date);

      conflicts.push({
        id: `COV_GAP_${demand.brandProcessId}_${demand.date}`,
        type: "INSUFFICIENT_HEADCOUNT",
        severity: "blocking",
        brandProcessId: demand.brandProcessId,
        date: demand.date,
        message: `${demand.brandName} (${demand.processCode}) on ${friendlyDate} requires ${demand.requiredHeadcount} staff, but only ${count} assigned (${shortage} short).`,
        suggestedFix: `Assign ${shortage} more qualified employee(s) to this shift.`,
        resolved: false,
      });
    }
  }

  // 2. Employee daily load & conflict checks
  const maxPerDay = input.maxProcessesPerEmployeePerDay ?? 2;

  for (const [dayEmpKey, asgnList] of dayEmpMap.entries()) {
    const [date, empId] = dayEmpKey.split("_");
    const emp = input.employees.find((e) => e.id === empId);
    const empName = emp?.name ?? empId;
    const friendlyDate = formatFriendlyDate(date);

    // Filter working statuses
    const workingSlots = asgnList.filter((a: RosterDayAssignment) => a.status === "working");
    const nonWorkingSlots = asgnList.filter((a: RosterDayAssignment) => a.status !== "working");

    // Hard Constraint Check: Max 1 overall primary status (cannot be both working AND on leave/comp-off)
    if (workingSlots.length > 0 && nonWorkingSlots.length > 0) {
      for (const nw of nonWorkingSlots) {
        if (nw.status === "leave" || nw.status === "comp_off") {
          conflicts.push({
            id: `STATUS_CLASH_${empId}_${date}`,
            type: "OVERALLOCATED_EMPLOYEE",
            severity: "blocking",
            employeeId: empId,
            date,
            message: `${empName} is scheduled to work on ${friendlyDate} while having status '${nw.status}'.`,
            suggestedFix: `Remove working shift or adjust ${nw.status} status.`,
            resolved: false,
          });
        }
      }
    }

    // Daily process limit
    if (workingSlots.length > maxPerDay) {
      conflicts.push({
        id: `OVERLOAD_${empId}_${date}`,
        type: "OVERALLOCATED_EMPLOYEE",
        severity: "warning",
        employeeId: empId,
        date,
        message: `${empName} is assigned to ${workingSlots.length} processes on ${friendlyDate}, exceeding the recommended limit of ${maxPerDay}.`,
        suggestedFix: `Reassign one of the processes to another available colleague.`,
        resolved: false,
      });
    }
  }

  // 3. Weekly Off Distribution checks (At most 1 weekly off per calendar week, or warning if 0)
  // Group dates by Monday-Sunday calendar week
  // Warning if an employee has 7+ consecutive working days without any off
  for (const emp of input.employees) {
    if (!emp.active) continue;
    const empAssignments = assignments
      .filter((a) => a.employeeId === emp.id)
      .sort((a, b) => a.date.localeCompare(b.date));

    let consecutiveWorking = 0;
    for (const a of empAssignments) {
      if (a.status === "working") {
        consecutiveWorking++;
        if (consecutiveWorking > 6) {
          conflicts.push({
            id: `CONSECUTIVE_${emp.id}_${a.date}`,
            type: "CONSECUTIVE_DAYS_WARNING",
            severity: "warning",
            employeeId: emp.id,
            date: a.date,
            message: `${emp.name} has worked ${consecutiveWorking} consecutive days as of ${formatFriendlyDate(a.date)} without a weekly off.`,
            suggestedFix: `Schedule a weekly off or rest day to prevent burnout.`,
            resolved: false,
          });
          consecutiveWorking = 0; // Don't spam warnings every day
        }
      } else {
        consecutiveWorking = 0;
      }
    }
  }

  return conflicts;
}
