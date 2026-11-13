// Pure TypeScript greedy deterministic assignment engine

import {
  SchedulerInput,
  SchedulerOutput,
  RosterDayAssignment,
  RequiredDemandDay,
  ConflictItem,
} from "./types";
import { getDatesInMonth, expandDemandForMonth, getDayOfWeek } from "./calendar";
import {
  getEligibleEmployees,
  isAvailable,
  getApprovedLeaveOnDate,
  getCompOffOnDate,
} from "./constraints";
import { checkCapacity } from "./capacity";
import { calculateCandidateCost } from "./score";
import { validateRosterAndGenerateConflicts } from "./conflicts";

/**
 * Groups an array of dates into calendar weeks (Monday to Sunday).
 */
export function groupDatesByCalendarWeek(dates: string[]): string[][] {
  const weeks: string[][] = [];
  let currentWeek: string[] = [];

  for (const date of dates) {
    currentWeek.push(date);
    const dow = getDayOfWeek(date);
    if (dow === 0) {
      // Sunday is end of calendar week
      weeks.push(currentWeek);
      currentWeek = [];
    }
  }

  if (currentWeek.length > 0) {
    weeks.push(currentWeek);
  }

  return weeks;
}

/**
 * Core greedy deterministic scheduler.
 */
export function generateRoster(input: SchedulerInput): SchedulerOutput {
  const dates = getDatesInMonth(input.month);
  const maxPerDay = input.maxProcessesPerEmployeePerDay ?? 2;

  // 1. Build demand list for the month across all brand processes
  const allDemands: RequiredDemandDay[] = [];
  for (const bp of input.brandProcesses) {
    const bpDemands = expandDemandForMonth(input.month, bp, input.holidays);
    allDemands.push(...bpDemands);
  }

  // 2. Pre-solve capacity check
  const { blockingConflicts: preSolveConflicts } = checkCapacity(input, allDemands);

  // Initialize tracking state
  // Track working assignments per employee
  const employeeMonthlyLoad = new Map<string, number>();
  // Key: `${date}_${employeeId}` -> array of brandProcessIds
  const employeeDailyWorking = new Map<string, string[]>();
  // Output assignments map: `${date}_${employeeId}` -> RosterDayAssignment
  // An employee has at most 1 primary status per day. If they work multiple processes, we record the assignments.
  const assignmentList: RosterDayAssignment[] = [];
  const handledDayEmp = new Set<string>(); // `${date}_${employeeId}`

  // Build week indexes before loading pinned assignments so their workload
  // contributes to the same weekly limits as newly generated assignments.
  const calendarWeeks = groupDatesByCalendarWeek(dates);
  const dateToWeekMap = new Map<string, number>();
  for (let wIdx = 0; wIdx < calendarWeeks.length; wIdx++) {
    for (const d of calendarWeeks[wIdx]) dateToWeekMap.set(d, wIdx);
  }
  const empWeeklyWorkedDays = new Map<string, number>();

  for (const emp of input.employees) {
    employeeMonthlyLoad.set(emp.id, 0);
  }

  // Incorporate existing pinned days if any
  if (input.existingDays && input.existingDays.length > 0) {
    for (const d of input.existingDays) {
      if (d.pinned) {
        assignmentList.push(d);
        handledDayEmp.add(`${d.date}_${d.employeeId}`);
        if (d.status === "working") {
          const key = `${d.date}_${d.employeeId}`;
          const isFirstWorkingAssignmentForDay =
            !employeeDailyWorking.has(key) || employeeDailyWorking.get(key)!.length === 0;
          if (isFirstWorkingAssignmentForDay) {
            const count = employeeMonthlyLoad.get(d.employeeId) || 0;
            employeeMonthlyLoad.set(d.employeeId, count + 1);
            const weekIndex = dateToWeekMap.get(d.date);
            if (weekIndex !== undefined) {
              const weekKey = `${d.employeeId}_${weekIndex}`;
              empWeeklyWorkedDays.set(weekKey, (empWeeklyWorkedDays.get(weekKey) || 0) + 1);
            }
          }
          if (!employeeDailyWorking.has(key)) employeeDailyWorking.set(key, []);
          if (d.brandProcessId && !employeeDailyWorking.get(key)!.includes(d.brandProcessId)) {
            employeeDailyWorking.get(key)!.push(d.brandProcessId);
          }
        }
      }
    }
  }

  // 3. Calculate scarcity and sort demands
  // Scarcity = available eligible headcount - required headcount (lowest first)
  const demandScarcity = allDemands.map((demand) => {
    const eligible = getEligibleEmployees(
      demand.brandProcessId,
      demand.date,
      input.assignments,
      input.employees
    );
    const available = eligible.filter((emp) => {
      // Check if pinned to non-working
      const key = `${demand.date}_${emp.id}`;
      const existing = input.existingDays?.find(
        (ex) => ex.employeeId === emp.id && ex.date === demand.date && ex.pinned
      );
      if (existing && existing.status !== "working") return false;

      const avail = isAvailable(
        emp.id,
        demand.date,
        {
          employees: input.employees,
          assignments: input.assignments,
          weeklyOffs: input.weeklyOffs,
          leaves: input.leaves,
          compOffs: input.compOffs,
        },
        { ignoreWeeklyOff: true } // Weekly off can be adapted
      );
      return avail.isAvailable;
    });

    const scarcity = available.length - demand.requiredHeadcount;
    return { demand, scarcity, availableCount: available.length };
  });

  // Sort by scarcity ascending (hardest to fill first), then date, then brandProcessId
  demandScarcity.sort((a, b) => {
    if (a.scarcity !== b.scarcity) return a.scarcity - b.scarcity;
    if (a.demand.date !== b.demand.date) return a.demand.date.localeCompare(b.demand.date);
    return a.demand.brandProcessId.localeCompare(b.demand.brandProcessId);
  });

  // Helper to get preferred weekly off weekday for an employee
  function getPreferredOffDow(empId: string, date: string): number {
    const woRule = input.weeklyOffs.find(
      (w) =>
        w.employeeId === empId &&
        w.effectiveFrom <= date &&
        (!w.effectiveTo || w.effectiveTo >= date)
    );
    return woRule ? woRule.weekday : 0; // Default 0 (Sunday)
  }

  // 4. Greedy assignment pass
  let filledSlots = 0;
  const totalRequiredSlots = allDemands.reduce((acc, d) => acc + d.requiredHeadcount, 0);

  for (const { demand } of demandScarcity) {
    const wIdx = dateToWeekMap.get(demand.date) ?? 0;
    const weekDates = calendarWeeks[wIdx];
    const dow = getDayOfWeek(demand.date);

    const eligible = getEligibleEmployees(
      demand.brandProcessId,
      demand.date,
      input.assignments,
      input.employees
    );

    // Candidates who can be assigned
    const candidates = eligible.filter((emp) => {
      // If already pinned on this day, check compatibility
      const key = `${demand.date}_${emp.id}`;
      const currentProcesses = employeeDailyWorking.get(key) || [];
      const activeRules = input.assignments.filter(
        (rule) =>
          rule.employeeId === emp.id &&
          rule.startDate <= demand.date &&
          (!rule.endDate || rule.endDate >= demand.date)
      );
      // An exclusive assignment reserves the employee for that process on this date.
      if (activeRules.some((rule) => rule.isExclusive && rule.brandProcessId !== demand.brandProcessId)) {
        return false;
      }
      if (
        activeRules.some((rule) => rule.isExclusive && rule.brandProcessId === demand.brandProcessId) &&
        currentProcesses.some((processId) => processId !== demand.brandProcessId)
      ) {
        return false;
      }
      const existing = input.existingDays?.find(
        (ex) => ex.employeeId === emp.id && ex.date === demand.date && ex.pinned
      );
      if (existing) {
        if (existing.status !== "working") return false;
        // Already pinned working on another bp
        const currentProcesses = employeeDailyWorking.get(key) || [];
        if (currentProcesses.includes(demand.brandProcessId)) return false; // already assigned
        if (currentProcesses.length >= maxPerDay) return false;
        return true;
      }

      // Check hard availability (leave or comp-off)
      const leave = getApprovedLeaveOnDate(emp.id, demand.date, input.leaves);
      if (leave) return false;

      const compOff = getCompOffOnDate(emp.id, demand.date, input.compOffs);
      if (compOff) return false;

      // Check daily process limit
      const currentProcesses = employeeDailyWorking.get(key) || [];
      if (currentProcesses.length >= maxPerDay) return false;
      if (currentProcesses.includes(demand.brandProcessId)) return false;

      // Rule: An employee must get a weekly off in a full calendar week.
      // If the employee is already working on this date (another process), adding this process doesn't increase days worked in week
      const isAlreadyWorkingToday = currentProcesses.length > 0;
      if (!isAlreadyWorkingToday) {
        const empWeekKey = `${emp.id}_${wIdx}`;
        const daysWorkedThisWeek = empWeeklyWorkedDays.get(empWeekKey) || 0;

        // In a 7-day week, max working days is 6 (at least 1 day off)
        if (weekDates.length >= 6 && daysWorkedThisWeek >= weekDates.length - 1) {
          return false;
        }

        // If today is the employee's designated off weekday, and they are the sole employee on this process:
        // preserve their designated off day so they get their weekly off!
        const prefDow = getPreferredOffDow(emp.id, demand.date);
        if (dow === prefDow && eligible.length === 1) {
          // If all days in this week are required for this 365 process, protect their designated weekly off!
          return false;
        }
      }

      return true;
    });

    // Score and rank candidates
    const scoredCandidates = candidates.map((emp) => {
      const key = `${demand.date}_${emp.id}`;
      const currentProcesses = employeeDailyWorking.get(key) || [];
      const preferredOffWeekday = getPreferredOffDow(emp.id, demand.date);

      // Check consecutive days worked before this date
      let consecutiveBefore = 0;
      const dateIndex = dates.indexOf(demand.date);
      for (let i = dateIndex - 1; i >= 0 && i >= dateIndex - 7; i--) {
        const prevDate = dates[i];
        const prevKey = `${prevDate}_${emp.id}`;
        if (employeeDailyWorking.has(prevKey) && employeeDailyWorking.get(prevKey)!.length > 0) {
          consecutiveBefore++;
        } else {
          break;
        }
      }

      const cost = calculateCandidateCost({
        employeeId: emp.id,
        date: demand.date,
        currentMonthlyWorkingDays: employeeMonthlyLoad.get(emp.id) || 0,
        assignedTodayCount: currentProcesses.length,
        preferredOffWeekday,
        consecutiveWorkingDaysBefore: consecutiveBefore,
      });

      return { emp, cost };
    });

    // Sort by cost ascending, then deterministically by employee id
    scoredCandidates.sort((a, b) => {
      if (a.cost !== b.cost) return a.cost - b.cost;
      return a.emp.id.localeCompare(b.emp.id);
    });

    // Pick top candidates up to required headcount
    const needed = demand.requiredHeadcount;
    const selected = scoredCandidates.slice(0, needed);

    for (const { emp } of selected) {
      const key = `${demand.date}_${emp.id}`;
      const isNewWorkingDay = !employeeDailyWorking.has(key) || employeeDailyWorking.get(key)!.length === 0;

      if (!employeeDailyWorking.has(key)) {
        employeeDailyWorking.set(key, []);
      }
      employeeDailyWorking.get(key)!.push(demand.brandProcessId);

      // Record assignment
      assignmentList.push({
        employeeId: emp.id,
        date: demand.date,
        status: "working",
        brandProcessId: demand.brandProcessId,
        pinned: false,
      });
      handledDayEmp.add(key);

      // Update load
      const currentLoad = employeeMonthlyLoad.get(emp.id) || 0;
      employeeMonthlyLoad.set(emp.id, currentLoad + 1);

      if (isNewWorkingDay) {
        const empWeekKey = `${emp.id}_${wIdx}`;
        const wCount = empWeeklyWorkedDays.get(empWeekKey) || 0;
        empWeeklyWorkedDays.set(empWeekKey, wCount + 1);
      }

      filledSlots++;
    }
  }

  // 5. Weekly Off Placement pass
  // Each employee gets at most 1 weekly off per calendar week.
  // Rule: prefer their designated weekday; if that is required for work, find nearest non-working day.

  for (const emp of input.employees) {
    if (!emp.active) continue;

    const woRule = input.weeklyOffs.find(
      (w) =>
        w.employeeId === emp.id &&
        w.effectiveFrom <= dates[dates.length - 1] &&
        (!w.effectiveTo || w.effectiveTo >= dates[0])
    );
    const preferredDow = woRule ? woRule.weekday : 0; // 0 = Sunday default

    for (const weekDates of calendarWeeks) {
      // Check if employee already has an assignment in this week that counts as off (pinned weekly_off, leave, comp-off)
      const weekKeys = weekDates.map((d) => `${d}_${emp.id}`);
      const hasExistingOff = weekDates.some((d) => {
        const key = `${d}_${emp.id}`;
        const asgn = assignmentList.find((a) => a.date === d && a.employeeId === emp.id);
        return asgn && (asgn.status === "weekly_off" || asgn.status === "leave" || asgn.status === "comp_off");
      });

      if (hasExistingOff) {
        continue;
      }

      // Check if preferred day in this week is available (not working and not pinned)
      const preferredDate = weekDates.find((d) => getDayOfWeek(d) === preferredDow);
      const isPreferredWorking = preferredDate && employeeDailyWorking.has(`${preferredDate}_${emp.id}`) && employeeDailyWorking.get(`${preferredDate}_${emp.id}`)!.length > 0;

      let chosenDate: string | null = null;

      if (preferredDate && !isPreferredWorking && !handledDayEmp.has(`${preferredDate}_${emp.id}`)) {
        chosenDate = preferredDate;
      } else {
        // Find nearest available non-working date in this week
        const candidateDates = weekDates.filter((d) => {
          const key = `${d}_${emp.id}`;
          const isWorking = employeeDailyWorking.has(key) && employeeDailyWorking.get(key)!.length > 0;
          return !isWorking && !handledDayEmp.has(key);
        });

        if (candidateDates.length > 0) {
          // Sort by distance to preferred day
          candidateDates.sort((a, b) => {
            const circularWeekdayDistance = (day: number) => {
              const direct = Math.abs(day - preferredDow);
              return Math.min(direct, 7 - direct);
            };
            const distA = preferredDate ? circularWeekdayDistance(getDayOfWeek(a)) : 0;
            const distB = preferredDate ? circularWeekdayDistance(getDayOfWeek(b)) : 0;
            return distA - distB;
          });
          chosenDate = candidateDates[0];
        }
      }

      if (chosenDate) {
        assignmentList.push({
          employeeId: emp.id,
          date: chosenDate,
          status: "weekly_off",
          pinned: false,
        });
        handledDayEmp.add(`${chosenDate}_${emp.id}`);
      }
    }
  }

  // 6. Fill remaining days: leave, comp_off, holiday, or unassigned
  const holidayMap = new Map<string, string>();
  for (const h of input.holidays) {
    holidayMap.set(h.date, h.name);
  }

  for (const emp of input.employees) {
    if (!emp.active) continue;

    for (const date of dates) {
      const key = `${date}_${emp.id}`;
      if (handledDayEmp.has(key)) continue;

      // Check leave
      const leave = getApprovedLeaveOnDate(emp.id, date, input.leaves);
      if (leave) {
        assignmentList.push({
          employeeId: emp.id,
          date,
          status: "leave",
          notes: `${leave.type} leave`,
          pinned: false,
        });
        handledDayEmp.add(key);
        continue;
      }

      // Check comp off
      const compOff = getCompOffOnDate(emp.id, date, input.compOffs);
      if (compOff) {
        assignmentList.push({
          employeeId: emp.id,
          date,
          status: "comp_off",
          pinned: false,
        });
        handledDayEmp.add(key);
        continue;
      }

      // Check holiday
      if (holidayMap.has(date)) {
        assignmentList.push({
          employeeId: emp.id,
          date,
          status: "holiday",
          notes: holidayMap.get(date),
          pinned: false,
        });
        handledDayEmp.add(key);
        continue;
      }

      // Otherwise unassigned
      assignmentList.push({
        employeeId: emp.id,
        date,
        status: "unassigned",
        pinned: false,
      });
      handledDayEmp.add(key);
    }
  }

  // 7. Post-solve conflict analysis
  const postSolveConflicts = validateRosterAndGenerateConflicts(
    input,
    allDemands,
    assignmentList
  );

  // Merge pre-solve and post-solve conflicts, but dedupe the same coverage shortage by date + brand/process.
  // The same staffing gap can be reported by both the pre-solve capacity check and the post-solve validation,
  // which produces duplicate cards in the UI. Keep the richer/backed suggestion and drop the redundant one.
  const conflictMap = new Map<string, ConflictItem>();
  const chooseBetterConflict = (current: ConflictItem, next: ConflictItem) => {
    const score = (c: ConflictItem) => {
      const message = c.message ?? "";
      const fix = c.suggestedFix ?? "";
      return (
        (message.includes("has 0 assigned employees") ? 12 : 0) +
        (message.includes("assigned employees") ? 5 : 0) +
        (message.includes("available") ? 3 : 0) +
        (message.includes("backup") ? 2 : 0) +
        (fix.includes("backup") ? 3 : 0) +
        (fix.includes("Assign") ? 1 : 0) +
        (message.length + fix.length)
      );
    };

    return score(next) > score(current) ? next : current;
  };

  for (const c of [...preSolveConflicts, ...postSolveConflicts]) {
    const isCoverageConflict = ["INSUFFICIENT_HEADCOUNT", "UNAVAILABLE_SOLE_RESOURCE"].includes(c.type);
    const dedupeKey = isCoverageConflict ? `${c.date ?? "unknown"}|${c.brandProcessId ?? "unknown"}` : c.id;
    const existing = conflictMap.get(dedupeKey);
    if (!existing) {
      conflictMap.set(dedupeKey, c);
      continue;
    }
    conflictMap.set(dedupeKey, chooseBetterConflict(existing, c));
  }

  const allConflicts = Array.from(conflictMap.values());
  const blockingConflictsCount = allConflicts.filter((c) => c.severity === "blocking").length;
  const warningsCount = allConflicts.filter((c) => c.severity === "warning").length;

  const coveragePercentage =
    totalRequiredSlots > 0 ? Math.round((filledSlots / totalRequiredSlots) * 100) : 100;

  return {
    month: input.month,
    days: assignmentList,
    conflicts: allConflicts,
    metrics: {
      totalRequiredSlots,
      filledSlots,
      coveragePercentage,
      blockingConflictsCount,
      warningsCount,
    },
  };
}
