// Pure TypeScript scoring functions for soft constraints and assignment candidate ranking

import { WeeklyOffRule } from "./types";
import { getDayOfWeek } from "./calendar";

export interface CandidateScoreContext {
  employeeId: string;
  date: string;
  currentMonthlyWorkingDays: number;
  assignedTodayCount: number;
  preferredOffWeekday: number;
  consecutiveWorkingDaysBefore: number;
}

/**
 * Calculates a preference score for assigning an employee to a slot on a given date.
 * Lower score = better candidate (cost function).
 * Deterministic and pure.
 */
export function calculateCandidateCost(context: CandidateScoreContext): number {
  let cost = 0;

  // 1. Fair distribution of workload (heaviest weight on cumulative month load)
  cost += context.currentMonthlyWorkingDays * 10;

  // 2. Multi-brand load penalty: if already assigned to a brand today, prefer employees not yet assigned today
  cost += context.assignedTodayCount * 50;

  // 3. Weekly off penalty: if today is their preferred weekly off weekday, high penalty (avoid violating soft preference if someone else is available)
  const currentDow = getDayOfWeek(context.date);
  if (currentDow === context.preferredOffWeekday) {
    cost += 30;
  }

  // 4. Consecutive working days penalty: avoid stretching too many consecutive days without a rest
  if (context.consecutiveWorkingDaysBefore >= 6) {
    cost += 20;
  }

  return cost;
}

/**
 * Evaluates the overall soft-preference score for a completed roster month.
 * Higher score is better (0 to 100).
 */
export function evaluateRosterQualityScore(params: {
  totalRequestedWeeklyOffs: number;
  honoredWeeklyOffs: number;
  employeeLoads: number[];
}): number {
  if (params.totalRequestedWeeklyOffs === 0) return 100;

  // Off-day satisfaction percentage (weight: 60%)
  const woRatio = (params.honoredWeeklyOffs / params.totalRequestedWeeklyOffs) * 60;

  // Load balance (standard deviation penalty, weight: 40%)
  if (params.employeeLoads.length === 0) return Math.round(woRatio);

  const mean =
    params.employeeLoads.reduce((acc, v) => acc + v, 0) / params.employeeLoads.length;
  const variance =
    params.employeeLoads.reduce((acc, v) => acc + Math.pow(v - mean, 2), 0) /
    params.employeeLoads.length;
  const stdDev = Math.sqrt(variance);

  // Lower stdDev is better. A stdDev of 0 gets 40 points, stdDev >= 5 loses points
  const loadScore = Math.max(0, 40 - stdDev * 4);

  return Math.round(woRatio + loadScore);
}
