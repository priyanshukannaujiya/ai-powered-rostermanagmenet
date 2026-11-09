// Pure TypeScript replanning engine for incremental updates without touching past or pinned days

import {
  SchedulerInput,
  SchedulerOutput,
  RosterDayAssignment,
  ConflictItem,
  BackupCandidate,
  BrandProcessRule,
} from "./types";
import { generateRoster } from "./assign";
import { findBackupCandidates } from "./capacity";

export interface ReplanChangeDetails {
  type: "LEAVE_APPROVED" | "MANUAL_EDIT" | "ASSIGNMENT_CHANGED" | "COMP_OFF_APPROVED";
  employeeId?: string;
  startDate?: string;
  endDate?: string;
  date?: string;
  description?: string;
}

export interface DayDiff {
  date: string;
  employeeId: string;
  before: {
    status: string;
    brandProcessId?: string | null;
  };
  after: {
    status: string;
    brandProcessId?: string | null;
  };
}

export interface ReplanResult {
  updatedDays: RosterDayAssignment[];
  updatedConflicts: ConflictItem[];
  diff: {
    changedDays: DayDiff[];
    newConflicts: ConflictItem[];
    resolvedConflicts: ConflictItem[];
    suggestedBackups: Array<{
      date: string;
      brandProcessId: string;
      brandName: string;
      processCode: string;
      candidates: BackupCandidate[];
    }>;
  };
  metrics: SchedulerOutput["metrics"];
}

/**
 * Re-plans a roster after an event (e.g. leave approved), strictly preserving past and pinned days.
 */
export function replanRoster(params: {
  input: SchedulerInput;
  currentDays: RosterDayAssignment[];
  currentConflicts: ConflictItem[];
  cutoffDate: string; // YYYY-MM-DD (days before this are strictly frozen)
  change: ReplanChangeDetails;
}): ReplanResult {
  const { input, currentDays, currentConflicts, cutoffDate } = params;

  // 1. Separate days into frozen vs re-plannable
  // Frozen: any day < cutoffDate OR any day explicitly marked pinned: true
  const frozenDays: RosterDayAssignment[] = [];

  for (const day of currentDays) {
    if (day.date < cutoffDate || day.pinned) {
      frozenDays.push({
        ...day,
        pinned: true, // mark as pinned so the assignment engine treats it as fixed
      });
    }
  }

  // 2. Prepare new scheduler input with frozen days supplied as existingDays
  const replanInput: SchedulerInput = {
    ...input,
    existingDays: frozenDays,
  };

  // 3. Generate updated roster
  const result = generateRoster(replanInput);

  // 4. Calculate diff
  const beforeMap = new Map<string, RosterDayAssignment>();
  for (const d of currentDays) {
    beforeMap.set(`${d.date}_${d.employeeId}`, d);
  }

  const afterMap = new Map<string, RosterDayAssignment>();
  for (const d of result.days) {
    afterMap.set(`${d.date}_${d.employeeId}`, d);
  }

  const changedDays: DayDiff[] = [];
  for (const [key, afterDay] of afterMap.entries()) {
    const beforeDay = beforeMap.get(key);
    if (!beforeDay) {
      changedDays.push({
        date: afterDay.date,
        employeeId: afterDay.employeeId,
        before: { status: "none", brandProcessId: null },
        after: { status: afterDay.status, brandProcessId: afterDay.brandProcessId },
      });
    } else if (
      beforeDay.status !== afterDay.status ||
      beforeDay.brandProcessId !== afterDay.brandProcessId
    ) {
      changedDays.push({
        date: afterDay.date,
        employeeId: afterDay.employeeId,
        before: { status: beforeDay.status, brandProcessId: beforeDay.brandProcessId },
        after: { status: afterDay.status, brandProcessId: afterDay.brandProcessId },
      });
    }
  }

  // Conflict diff
  const prevConflictIds = new Set(currentConflicts.map((c) => c.id));
  const nextConflictIds = new Set(result.conflicts.map((c) => c.id));

  const newConflicts = result.conflicts.filter((c) => !prevConflictIds.has(c.id));
  const resolvedConflicts = currentConflicts.filter((c) => !nextConflictIds.has(c.id));

  // Find suggested backups for new blocking conflicts
  const suggestedBackups: ReplanResult["diff"]["suggestedBackups"] = [];
  const bpMap = new Map<string, BrandProcessRule>();
  for (const bp of input.brandProcesses) {
    bpMap.set(bp.id, bp);
  }

  for (const conflict of newConflicts) {
    if (conflict.severity === "blocking" && conflict.brandProcessId && conflict.date) {
      const bp = bpMap.get(conflict.brandProcessId);
      if (bp) {
        const candidates = findBackupCandidates(bp, conflict.date, input);
        suggestedBackups.push({
          date: conflict.date,
          brandProcessId: bp.id,
          brandName: bp.brandName,
          processCode: bp.processCode,
          candidates,
        });
      }
    }
  }

  return {
    updatedDays: result.days,
    updatedConflicts: result.conflicts,
    diff: {
      changedDays,
      newConflicts,
      resolvedConflicts,
      suggestedBackups,
    },
    metrics: result.metrics,
  };
}

