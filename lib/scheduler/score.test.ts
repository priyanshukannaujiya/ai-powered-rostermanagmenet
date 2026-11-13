import { describe, expect, it } from "vitest";
import { calculateCandidateCost } from "./score";

describe("assignment priority", () => {
  it("prefers lower numeric priority before balancing workload", () => {
    const base = {
      employeeId: "emp",
      date: "2026-11-02",
      currentMonthlyWorkingDays: 0,
      assignedTodayCount: 0,
      preferredOffWeekday: 0,
      consecutiveWorkingDaysBefore: 0,
    };
    expect(calculateCandidateCost({ ...base, assignmentPriority: 1 }))
      .toBeLessThan(calculateCandidateCost({ ...base, assignmentPriority: 2 }));
  });
});
