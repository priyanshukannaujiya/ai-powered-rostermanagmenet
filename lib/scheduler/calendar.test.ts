import { describe, expect, it } from "vitest";
import { expandDemandForMonth } from "./calendar";
import type { BrandProcessRule } from "./types";

describe("custom operating calendars", () => {
  const base: BrandProcessRule = {
    id: "bp-custom", brandId: "brand", brandName: "Custom", processId: "process",
    processCode: "CS", operatingCalendar: "custom",
    minHeadcountWeekday: 2, minHeadcountSunday: 3, minHeadcountHoliday: 4,
    customConfig: { activeWeekdays: [1, 3], noHolidays: false },
  };

  it("uses configured weekdays and holiday headcount", () => {
    const demands = expandDemandForMonth("2026-11", base, [
      { id: "holiday", date: "2026-11-04", name: "Holiday Wednesday" },
    ]);
    expect(demands.map((d) => d.date)).toEqual(["2026-11-02", "2026-11-04", "2026-11-09", "2026-11-11", "2026-11-16", "2026-11-18", "2026-11-23", "2026-11-25", "2026-11-30"]);
    expect(demands.find((d) => d.date === "2026-11-04")?.requiredHeadcount).toBe(4);
  });

  it("skips holidays when configured", () => {
    const demands = expandDemandForMonth("2026-11", {
      ...base, customConfig: { activeWeekdays: [3], noHolidays: true },
    }, [{ id: "holiday", date: "2026-11-04", name: "Holiday Wednesday" }]);
    expect(demands.some((d) => d.date === "2026-11-04")).toBe(false);
  });
});
