// Pure TypeScript pre-solve capacity check and backup finder

import {
  SchedulerInput,
  ConflictItem,
  RequiredDemandDay,
  BackupCandidate,
  EmployeeInfo,
  BrandProcessRule,
} from "./types";
import { expandDemandForMonth, formatFriendlyDate } from "./calendar";
import {
  getEligibleEmployees,
  isAvailable,
  getApprovedLeaveOnDate,
  getCompOffOnDate,
} from "./constraints";

/**
 * Finds potential backup candidates for a brand-process on a given date.
 * Backups are active employees available on that date who:
 * 1. Share the same process (cross-brand), OR
 * 2. Share the same brand (cross-process), OR
 * 3. Have related assignments.
 */
export function findBackupCandidates(
  targetBp: BrandProcessRule,
  date: string,
  input: SchedulerInput,
  currentAssignedIds: Set<string> = new Set()
): BackupCandidate[] {
  const allBps = input.brandProcesses;
  const targetProcessId = targetBp.processId;
  const targetBrandId = targetBp.brandId;

  const candidateMap = new Map<string, BackupCandidate>();

  for (const emp of input.employees) {
    if (!emp.active || currentAssignedIds.has(emp.id)) continue;

    // Check availability (ignoring weekly off as soft emergency or checking pure availability)
    const avail = isAvailable(emp.id, date, {
      employees: input.employees,
      assignments: input.assignments,
      weeklyOffs: input.weeklyOffs,
      leaves: input.leaves,
      compOffs: input.compOffs,
    }, { ignoreWeeklyOff: true }); // Backups can be requested on off days if needed, but not on leave/comp-off

    // If on approved leave or comp-off, they strictly cannot back up
    if (!avail.isAvailable && (avail.reason === "ON_LEAVE" || avail.reason === "COMP_OFF")) {
      continue;
    }

    // Check qualification
    // Find all assignments for this employee
    const empAssignments = input.assignments.filter(
      (a) => a.employeeId === emp.id && a.startDate <= date && (!a.endDate || a.endDate >= date)
    );

    let reason: BackupCandidate["qualificationReason"] | null = null;

    for (const a of empAssignments) {
      const bp = allBps.find((b) => b.id === a.brandProcessId);
      if (!bp) continue;

      if (bp.processId === targetProcessId) {
        reason = "SAME_PROCESS";
        break;
      }
      if (bp.brandId === targetBrandId) {
        reason = "SAME_BRAND";
        break;
      }
    }

    if (reason) {
      candidateMap.set(emp.id, {
        employeeId: emp.id,
        employeeName: emp.name,
        qualificationReason: reason,
        currentLoadThisMonth: 0,
      });
    }
  }

  return Array.from(candidateMap.values());
}

/**
 * Runs a pre-solve capacity analysis across all brand processes and operating days.
 */
export function checkCapacity(
  input: SchedulerInput,
  demands: RequiredDemandDay[]
): {
  blockingConflicts: ConflictItem[];
  shortageMap: Map<string, number>; // key: `${brandProcessId}_${date}`, value: shortage count
} {
  const blockingConflicts: ConflictItem[] = [];
  const shortageMap = new Map<string, number>();

  const bpMap = new Map<string, BrandProcessRule>();
  for (const bp of input.brandProcesses) {
    bpMap.set(bp.id, bp);
  }

  for (const demand of demands) {
    const bp = bpMap.get(demand.brandProcessId);
    if (!bp) continue;

    const eligible = getEligibleEmployees(
      demand.brandProcessId,
      demand.date,
      input.assignments,
      input.employees
    );

    // Filter by strict availability (ignoring weekly off here since weekly off can be scheduled dynamically around demand)
    const strictlyAvailable = eligible.filter((emp) => {
      const res = isAvailable(
        emp.id,
        demand.date,
        {
          employees: input.employees,
          assignments: input.assignments,
          weeklyOffs: input.weeklyOffs,
          leaves: input.leaves,
          compOffs: input.compOffs,
        },
        { ignoreWeeklyOff: true } // Weekly offs can shift to other days in week
      );
      return res.isAvailable;
    });

    const shortage = demand.requiredHeadcount - strictlyAvailable.length;

    if (shortage > 0) {
      const key = `${demand.brandProcessId}_${demand.date}`;
      shortageMap.set(key, shortage);

      // Single-resource brand check
      const isSoleResource = eligible.length === 1;
      const soleEmp = isSoleResource ? eligible[0] : null;

      // Find backups
      const backups = findBackupCandidates(
        bp,
        demand.date,
        input,
        new Set(strictlyAvailable.map((e) => e.id))
      );

      const backupNames = backups.length > 0
        ? backups.map((b) => b.employeeName).slice(0, 3).join(", ")
        : "None found";

      let message = "";
      let fix = "";

      const friendlyDate = formatFriendlyDate(demand.date);

      if (eligible.length === 0) {
        message = `${bp.brandName} (${bp.processCode}) on ${friendlyDate} requires ${demand.requiredHeadcount} staff, but has 0 assigned employees.`;
        fix = backups.length > 0
          ? `Assign eligible backup candidates: ${backupNames}.`
          : `Create assignments for this brand-process.`;
      } else if (isSoleResource && soleEmp) {
        const leave = getApprovedLeaveOnDate(soleEmp.id, demand.date, input.leaves);
        const compOff = getCompOffOnDate(soleEmp.id, demand.date, input.compOffs);
        const reasonStr = leave
          ? `approved ${leave.type} leave`
          : compOff
          ? `approved comp-off`
          : `unavailability`;

        message = `${bp.brandName} (${bp.processCode}) on ${friendlyDate} needs ${demand.requiredHeadcount} person. 0 available. Only assigned employee ${soleEmp.name} is on ${reasonStr}.`;
        fix = backups.length > 0
          ? `Assign backup from cross-trained team (${backupNames}) who are available, or approve partial coverage.`
          : `Reassign coverage or adjust leave for ${soleEmp.name}.`;
      } else {
        message = `${bp.brandName} (${bp.processCode}) on ${friendlyDate} needs ${demand.requiredHeadcount} staff, but only ${strictlyAvailable.length} available (${shortage} short).`;
        fix = backups.length > 0
          ? `Assign cross-trained backups (${backupNames}) to fill the ${shortage} remaining slot(s).`
          : `Adjust weekly-off distribution or reassign staff.`;
      }

      blockingConflicts.push({
        id: `CAP_${demand.brandProcessId}_${demand.date}`,
        type: isSoleResource ? "UNAVAILABLE_SOLE_RESOURCE" : "INSUFFICIENT_HEADCOUNT",
        severity: "blocking",
        brandProcessId: demand.brandProcessId,
        employeeId: soleEmp ? soleEmp.id : null,
        date: demand.date,
        message,
        suggestedFix: fix,
        resolved: false,
      });
    }
  }

  return { blockingConflicts, shortageMap };
}
