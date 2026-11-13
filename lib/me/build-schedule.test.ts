import { describe, expect, it } from "vitest";
import { buildEmployeeSchedule } from "./build-schedule";

describe("buildEmployeeSchedule", () => {
  const base = { month: "2026-11", leaves: [], weeklyOffWeekdays: [], holidays: [] };

  it("keeps multiple process assignments on the same employee date", () => {
    const { days, summary } = buildEmployeeSchedule({
      ...base,
      rosterDays: [
        { date: "2026-11-02", status: "working", brandProcessId: "bp-a", brandName: "Alpha", brandCode: "A", processCode: "CS", notes: null, pinned: false },
        { date: "2026-11-02", status: "working", brandProcessId: "bp-b", brandName: "Beta", brandCode: "B", processCode: "ACC", notes: null, pinned: false },
      ],
    });
    const day = days.find((item) => item.date === "2026-11-02")!;
    expect(day.status).toBe("working");
    expect(day.assignments).toHaveLength(2);
    expect(day.assignments.map((item) => item.brandProcessId)).toEqual(["bp-a", "bp-b"]);
    expect(summary.working).toBe(1);
  });

  it("does not let an ordinary pinned shift override approved leave", () => {
    const { days } = buildEmployeeSchedule({
      ...base,
      leaves: [{ startDate: "2026-11-02", endDate: "2026-11-02", type: "planned", status: "approved" }],
      rosterDays: [
        { date: "2026-11-02", status: "working", brandProcessId: "bp-a", brandName: "Alpha", brandCode: "A", processCode: "CS", notes: null, pinned: true },
      ],
    });
    expect(days.find((item) => item.date === "2026-11-02")?.status).toBe("leave");
  });

  it("honors only an explicit manager leave override", () => {
    const { days } = buildEmployeeSchedule({
      ...base,
      leaves: [{ startDate: "2026-11-02", endDate: "2026-11-02", type: "planned", status: "approved" }],
      rosterDays: [
        { date: "2026-11-02", status: "working", brandProcessId: "bp-a", brandName: "Alpha", brandCode: "A", processCode: "CS", notes: null, pinned: true, leaveOverride: true },
      ],
    });
    expect(days.find((item) => item.date === "2026-11-02")?.status).toBe("working");
  });
});
