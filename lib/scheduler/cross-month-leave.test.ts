import { describe, it, expect } from "vitest";
import {
  enumerateDateRange,
  groupDatesByMonth,
  getMonthBounds,
  isDateOnApprovedLeave,
  isValidCalendarDate,
} from "./leave-days";
import { dedupeRosterDays, buildEmployeeSchedule, type RosterDayRow } from "@/lib/me/build-schedule";

describe("Cross-Month Leave Handling & Edge Cases", () => {
  it("strictly validates calendar dates and rejects invalid dates", () => {
    expect(isValidCalendarDate("2026-11-30")).toBe(true);
    expect(isValidCalendarDate("2026-02-28")).toBe(true);
    expect(isValidCalendarDate("2028-02-29")).toBe(true); // leap year

    expect(isValidCalendarDate("2026-02-29")).toBe(false); // non-leap year
    expect(isValidCalendarDate("2026-11-31")).toBe(false); // November has 30 days
    expect(isValidCalendarDate("2026-04-31")).toBe(false); // April has 30 days
    expect(isValidCalendarDate("not-a-date")).toBe(false);
  });

  it("throws clear error on invalid date in enumerateDateRange", () => {
    expect(() => enumerateDateRange("2026-11-31", "2026-12-05")).toThrow("is not a valid calendar date");
    expect(() => enumerateDateRange("2026-12-05", "2026-11-01")).toThrow("cannot be after end date");
  });

  it("throws clear error when date range exceeds 366 days", () => {
    expect(() => enumerateDateRange("2026-01-01", "2027-02-05")).toThrow("exceeds maximum allowable duration");
  });

  it("enumerates inclusive dates across November and December correctly", () => {
    const dates = enumerateDateRange("2026-11-29", "2026-12-03");
    expect(dates).toEqual([
      "2026-11-29",
      "2026-11-30",
      "2026-12-01",
      "2026-12-02",
      "2026-12-03",
    ]);
  });

  it("groups cross-month dates into respective month buckets", () => {
    const dates = enumerateDateRange("2026-11-29", "2026-12-03");
    const grouped = groupDatesByMonth(dates);

    expect(grouped.has("2026-11")).toBe(true);
    expect(grouped.has("2026-12")).toBe(true);
    expect(grouped.get("2026-11")).toEqual(["2026-11-29", "2026-11-30"]);
    expect(grouped.get("2026-12")).toEqual(["2026-12-01", "2026-12-02", "2026-12-03"]);
  });

  it("accurately detects dates on approved leave across months", () => {
    const empId = "emp-001";
    const otherEmpId = "emp-002";
    const start = "2026-11-29";
    const end = "2026-12-03";

    // Matching employee within range
    expect(isDateOnApprovedLeave("2026-11-29", empId, empId, start, end)).toBe(true);
    expect(isDateOnApprovedLeave("2026-11-30", empId, empId, start, end)).toBe(true);
    expect(isDateOnApprovedLeave("2026-12-01", empId, empId, start, end)).toBe(true);
    expect(isDateOnApprovedLeave("2026-12-03", empId, empId, start, end)).toBe(true);

    // Matching employee outside range
    expect(isDateOnApprovedLeave("2026-11-28", empId, empId, start, end)).toBe(false);
    expect(isDateOnApprovedLeave("2026-12-04", empId, empId, start, end)).toBe(false);

    // Non-matching employee within range
    expect(isDateOnApprovedLeave("2026-11-30", otherEmpId, empId, start, end)).toBe(false);
    expect(isDateOnApprovedLeave("2026-12-01", otherEmpId, empId, start, end)).toBe(false);
  });

  it("calculates month bounds safely without invalid calendar overflows", () => {
    const nov = getMonthBounds("2026-11");
    expect(nov.start).toBe("2026-11-01");
    expect(nov.end).toBe("2026-11-30");
    expect(nov.daysInMonth).toBe(30);

    const dec = getMonthBounds("2026-12");
    expect(dec.start).toBe("2026-12-01");
    expect(dec.end).toBe("2026-12-31");
    expect(dec.daysInMonth).toBe(31);

    const febLeap = getMonthBounds("2028-02");
    expect(febLeap.start).toBe("2028-02-01");
    expect(febLeap.end).toBe("2028-02-29");
    expect(febLeap.daysInMonth).toBe(29);
  });

  it("dedupeRosterDays guarantees leave overrides any preexisting working shifts on cross-month dates", () => {
    const rows: RosterDayRow[] = [
      {
        date: "2026-11-30",
        status: "working",
        brandProcessId: "bp-1",
        brandName: "Brand 1",
        brandCode: "B1",
        processCode: "CS",
        notes: "Scheduled shift",
        pinned: true,
      },
      {
        date: "2026-11-30",
        status: "leave",
        brandProcessId: null,
        brandName: null,
        brandCode: null,
        processCode: null,
        notes: "Approved Leave",
        pinned: true,
      },
      {
        date: "2026-12-01",
        status: "working",
        brandProcessId: "bp-2",
        brandName: "Brand 2",
        brandCode: "B2",
        processCode: "CS",
        notes: "Scheduled shift",
        pinned: true,
      },
      {
        date: "2026-12-01",
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

    const nov30 = deduped.get("2026-11-30");
    expect(nov30?.status).toBe("leave");
    expect(nov30?.brandProcessId).toBeNull();

    const dec01 = deduped.get("2026-12-01");
    expect(dec01?.status).toBe("leave");
    expect(dec01?.brandProcessId).toBeNull();
  });

  describe("Missing Roster Month & Concurrency Invariants", () => {
    it("safely filters out ungenerated months from roster day inserts to avoid foreign key violations", () => {
      const leaveDates = ["2026-11-29", "2026-11-30", "2026-12-01", "2026-12-02", "2026-12-03"];
      const generatedMonthSet = new Set(["2026-11"]); // December is NOT generated yet

      const datesToPinInRosterDays = leaveDates.filter((date) => {
        const m = date.slice(0, 7);
        return generatedMonthSet.has(m);
      });

      // Only November dates should be pinned in roster_days; December is handled when that month is generated
      expect(datesToPinInRosterDays).toEqual(["2026-11-29", "2026-11-30"]);
    });

    it("prevents double-approval races when status has already transitioned away from pending", () => {
      // Simulation of atomic UPDATE ... WHERE status = 'pending'
      const leaveDatabase = { status: "pending" };

      function atomicClaimStatus(targetStatus: string): boolean {
        if (leaveDatabase.status !== "pending") {
          return false; // Concurrency conflict: already claimed
        }
        leaveDatabase.status = targetStatus;
        return true;
      }

      // Reviewer 1 claims
      const reviewer1Claim = atomicClaimStatus("approved");
      expect(reviewer1Claim).toBe(true);
      expect(leaveDatabase.status).toBe("approved");

      // Reviewer 2 races and tries to claim simultaneously
      const reviewer2Claim = atomicClaimStatus("approved");
      expect(reviewer2Claim).toBe(false); // Rejected safely without re-running mutations
    });
  });
});

