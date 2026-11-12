import { describe, it, expect } from "vitest";
import { buildEmployeeSchedule, dedupeRosterDays, type RosterDayRow, type LeaveRow } from "@/lib/me/build-schedule";

describe("Real-Time Roster Leave Sync & Brand Assignment Reflection", () => {
  it("dedupeRosterDays gives highest priority to leave over working shifts", () => {
    const rows: RosterDayRow[] = [
      {
        date: "2026-11-20",
        status: "working",
        brandProcessId: "bp-brand_01-cs",
        brandName: "Lumora Skincare",
        brandCode: "LS",
        processCode: "CS",
        notes: "Regular shift",
        pinned: true,
      },
      {
        date: "2026-11-20",
        status: "leave",
        brandProcessId: null,
        brandName: null,
        brandCode: null,
        processCode: null,
        notes: "Approved Leave",
        pinned: true,
      },
    ];

    const deduped = dedupeRosterDays(rows);
    const day = deduped.get("2026-11-20");
    expect(day).toBeDefined();
    expect(day?.status).toBe("leave");
    expect(day?.notes).toBe("Approved Leave");
  });

  it("buildEmployeeSchedule replaces working shift with approved leave block", () => {
    const month = "2026-11";
    const rosterDays: RosterDayRow[] = [
      {
        date: "2026-11-18",
        status: "working",
        brandProcessId: "bp-brand_06-cs",
        brandName: "Urban Botanics",
        brandCode: "UB",
        processCode: "CS",
        notes: "Manual assignment",
        pinned: true,
      },
      {
        date: "2026-11-20",
        status: "working",
        brandProcessId: "bp-brand_01-cs",
        brandName: "Lumora Skincare",
        brandCode: "LS",
        processCode: "CS",
        notes: "Old shift",
        pinned: true,
      },
      {
        date: "2026-11-21",
        status: "working",
        brandProcessId: "bp-brand_01-cs",
        brandName: "Lumora Skincare",
        brandCode: "LS",
        processCode: "CS",
        notes: "Old shift",
        pinned: true,
      },
    ];

    const leaves: LeaveRow[] = [
      {
        startDate: "2026-11-20",
        endDate: "2026-11-21",
        type: "planned",
        status: "approved",
      },
    ];

    const { days, summary } = buildEmployeeSchedule({
      month,
      rosterDays,
      leaves,
      weeklyOffWeekdays: [0], // Sunday
      holidays: [],
    });

    // Check Nov 18: reflect Urban Botanics CS
    const nov18 = days.find((d) => d.date === "2026-11-18");
    expect(nov18).toBeDefined();
    expect(nov18?.status).toBe("working");
    expect(nov18?.brandName).toBe("Urban Botanics");
    expect(nov18?.brand_name).toBe("Urban Botanics");
    expect(nov18?.processCode).toBe("CS");
    expect(nov18?.process_code).toBe("CS");

    // Check Nov 20: reflect Approved Leave (clearing brand/process)
    const nov20 = days.find((d) => d.date === "2026-11-20");
    expect(nov20).toBeDefined();
    expect(nov20?.status).toBe("leave");
    expect(nov20?.notes).toBe("Approved Leave");
    expect(nov20?.brandName).toBeNull();
    expect(nov20?.processCode).toBeNull();

    // Check Nov 21: reflect Approved Leave (clearing brand/process)
    const nov21 = days.find((d) => d.date === "2026-11-21");
    expect(nov21).toBeDefined();
    expect(nov21?.status).toBe("leave");
    expect(nov21?.notes).toBe("Approved Leave");
    expect(nov21?.brandName).toBeNull();

    // Summary checks
    expect(summary.working).toBe(1);
    expect(summary.leave).toBe(2);
  });

  it("buildEmployeeSchedule marks pending leaves without clearing assignment before approval", () => {
    const month = "2026-11";
    const rosterDays: RosterDayRow[] = [
      {
        date: "2026-11-20",
        status: "working",
        brandProcessId: "bp-brand_01-cs",
        brandName: "Lumora Skincare",
        brandCode: "LS",
        processCode: "CS",
        notes: "Regular shift",
        pinned: true,
      },
    ];

    const leaves: LeaveRow[] = [
      {
        startDate: "2026-11-20",
        endDate: "2026-11-21",
        type: "planned",
        status: "pending",
      },
    ];

    const { days, summary } = buildEmployeeSchedule({
      month,
      rosterDays,
      leaves,
      weeklyOffWeekdays: [0],
      holidays: [],
    });

    const nov20 = days.find((d) => d.date === "2026-11-20");
    expect(nov20?.status).toBe("working");
    expect(nov20?.pendingLeave).toBe(true);
    expect(nov20?.notes).toBe("Leave request pending approval");
    expect(summary.pendingLeave).toBe(2);
  });
});

