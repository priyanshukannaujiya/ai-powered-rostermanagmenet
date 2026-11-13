// Vitest comprehensive test scenarios for Pure TypeScript Scheduler Engine

import { describe, it, expect } from "vitest";
import { generateRoster } from "./assign";
import { replanRoster } from "./replan";
import { expandDemandForMonth } from "./calendar";
import {
  SchedulerInput,
  EmployeeInfo,
  BrandProcessRule,
  AssignmentRule,
  WeeklyOffRule,
  HolidayItem,
  LeaveItem,
} from "./types";

const mockMonth = "2026-11"; // November 2026 has 30 days. Nov 1 is Sunday.

// Public holidays in Nov 2026
const mockHolidays: HolidayItem[] = [
  { id: "h1", date: "2026-11-08", name: "Diwali" },
  { id: "h2", date: "2026-11-24", name: "Guru Nanak Jayanti" },
];

describe("Scheduler Engine Pure Scenarios", () => {
  // Scenario 1: Single employee on a 365-day process, with a weekly off, covers all days except the weekly off.
  it("Scenario 1: Single employee on a 365-day process covers all operating days except their weekly off", () => {
    const employee: EmployeeInfo = {
      id: "emp-1",
      name: "Aarav Sharma",
      email: "aarav@example.com",
      active: true,
    };

    const bp: BrandProcessRule = {
      id: "bp-1",
      brandId: "b-1",
      brandName: "Lumora Skincare",
      processId: "p-cs",
      processCode: "CS",
      operatingCalendar: "all_365",
      minHeadcountWeekday: 1,
      minHeadcountSunday: 1,
      minHeadcountHoliday: 1,
    };

    const assignment: AssignmentRule = {
      id: "as-1",
      employeeId: "emp-1",
      brandProcessId: "bp-1",
      startDate: "2026-11-01",
      priority: 1,
    };

    const weeklyOff: WeeklyOffRule = {
      id: "wo-1",
      employeeId: "emp-1",
      weekday: 0, // Sunday
      effectiveFrom: "2026-11-01",
    };

    const input: SchedulerInput = {
      month: mockMonth,
      employees: [employee],
      brandProcesses: [bp],
      assignments: [assignment],
      weeklyOffs: [weeklyOff],
      holidays: mockHolidays,
      leaves: [],
      compOffs: [],
    };

    const result = generateRoster(input);

    // Verify employee has working days and weekly offs placed
    const workingDays = result.days.filter(
      (d) => d.employeeId === "emp-1" && d.status === "working"
    );
    const offDays = result.days.filter(
      (d) => d.employeeId === "emp-1" && d.status === "weekly_off"
    );

    expect(workingDays.length).toBeGreaterThan(20);
    expect(offDays.length).toBeGreaterThanOrEqual(4); // approx 4-5 weeks in a month

    // Because bp-1 is 365 and needs 1 person every day, on the employee's weekly off day there should be an unfilled slot conflict
    const blockingConflicts = result.conflicts.filter((c) => c.severity === "blocking");
    expect(blockingConflicts.length).toBeGreaterThan(0);
    expect(blockingConflicts[0].message).toContain("Lumora Skincare (CS)");
  });

  // Scenario 2: A process needing 2 people with 3 assigned employees: coverage is met and load is balanced.
  it("Scenario 2: A process needing 2 people with 3 assigned employees: coverage is met and load is balanced", () => {
    const employees: EmployeeInfo[] = [
      { id: "emp-1", name: "Alice", email: "alice@example.com", active: true },
      { id: "emp-2", name: "Bob", email: "bob@example.com", active: true },
      { id: "emp-3", name: "Charlie", email: "charlie@example.com", active: true },
    ];

    const bp: BrandProcessRule = {
      id: "bp-acc",
      brandId: "b-1",
      brandName: "Brewhaus Coffee",
      processId: "p-acc",
      processCode: "ACC",
      operatingCalendar: "mon_sat_no_holidays",
      minHeadcountWeekday: 2,
      minHeadcountSunday: 0,
      minHeadcountHoliday: 0,
    };

    const assignments: AssignmentRule[] = employees.map((e, idx) => ({
      id: `as-${idx}`,
      employeeId: e.id,
      brandProcessId: "bp-acc",
      startDate: "2026-11-01",
      priority: 1,
    }));

    const weeklyOffs: WeeklyOffRule[] = employees.map((e, idx) => ({
      id: `wo-${idx}`,
      employeeId: e.id,
      weekday: 0, // Sunday
      effectiveFrom: "2026-11-01",
    }));

    const input: SchedulerInput = {
      month: mockMonth,
      employees,
      brandProcesses: [bp],
      assignments,
      weeklyOffs,
      holidays: mockHolidays,
      leaves: [],
      compOffs: [],
    };

    const result = generateRoster(input);

    // 100% coverage met with no blocking conflicts
    const blockingConflicts = result.conflicts.filter((c) => c.severity === "blocking");
    expect(blockingConflicts.length).toBe(0);
    expect(result.metrics.coveragePercentage).toBe(100);

    // Load is balanced: verify standard deviation across employees is low
    const emp1Load = result.days.filter((d) => d.employeeId === "emp-1" && d.status === "working").length;
    const emp2Load = result.days.filter((d) => d.employeeId === "emp-2" && d.status === "working").length;
    const emp3Load = result.days.filter((d) => d.employeeId === "emp-3" && d.status === "working").length;

    const loads = [emp1Load, emp2Load, emp3Load];
    const maxLoad = Math.max(...loads);
    const minLoad = Math.min(...loads);
    // Difference between highest and lowest loaded employee should be at most 2 days
    expect(maxLoad - minLoad).toBeLessThanOrEqual(2);
  });

  // Scenario 3: A single employee on approved leave over a required day produces a blocking conflict with a backup suggestion.
  it("Scenario 3: Single employee on approved leave over required day produces a blocking conflict with backup suggestion", () => {
    const empSole: EmployeeInfo = { id: "emp-sole", name: "Priya Patel", email: "priya@example.com", active: true };
    const empCross: EmployeeInfo = { id: "emp-cross", name: "Rahul Verma", email: "rahul@example.com", active: true };

    const bpNDR: BrandProcessRule = {
      id: "bp-ndr",
      brandId: "b-1",
      brandName: "Nestwell Home",
      processId: "p-ndr",
      processCode: "NDR",
      operatingCalendar: "all_365",
      minHeadcountWeekday: 1,
      minHeadcountSunday: 1,
      minHeadcountHoliday: 1,
    };

    const bpOther: BrandProcessRule = {
      id: "bp-other",
      brandId: "b-2",
      brandName: "Trekkr Outdoor",
      processId: "p-ndr", // Same process NDR cross-trained!
      processCode: "NDR",
      operatingCalendar: "mon_sat_no_holidays",
      minHeadcountWeekday: 1,
      minHeadcountSunday: 0,
      minHeadcountHoliday: 0,
    };

    const assignments: AssignmentRule[] = [
      { id: "as-sole", employeeId: "emp-sole", brandProcessId: "bp-ndr", startDate: "2026-11-01", priority: 1 },
      { id: "as-cross", employeeId: "emp-cross", brandProcessId: "bp-other", startDate: "2026-11-01", priority: 1 },
    ];

    const weeklyOffs: WeeklyOffRule[] = [
      { id: "wo-1", employeeId: "emp-sole", weekday: 1, effectiveFrom: "2026-11-01" },
      { id: "wo-2", employeeId: "emp-cross", weekday: 1, effectiveFrom: "2026-11-01" },
    ];

    // Priya is on approved leave on Sunday 15 Nov 2026
    const leaves: LeaveItem[] = [
      {
        id: "leave-1",
        employeeId: "emp-sole",
        startDate: "2026-11-15",
        endDate: "2026-11-15",
        type: "planned",
        status: "approved",
      },
    ];

    const input: SchedulerInput = {
      month: mockMonth,
      employees: [empSole, empCross],
      brandProcesses: [bpNDR, bpOther],
      assignments,
      weeklyOffs,
      holidays: mockHolidays,
      leaves,
      compOffs: [],
    };

    const result = generateRoster(input);

    const conflict15Nov = result.conflicts.find(
      (c) => c.date === "2026-11-15" && c.brandProcessId === "bp-ndr" && c.severity === "blocking"
    );

    expect(conflict15Nov).toBeDefined();
    expect(conflict15Nov?.message).toContain("Priya Patel");
    expect(conflict15Nov?.suggestedFix).toContain("Rahul Verma");
  });

  // Scenario 4: Mon–Sat process: Sundays and public holidays are not required and produce no conflict.
  it("Scenario 4: Mon-Sat process: Sundays and public holidays are not required and produce no conflict", () => {
    const emp: EmployeeInfo = { id: "emp-1", name: "David", email: "david@example.com", active: true };

    const bp: BrandProcessRule = {
      id: "bp-cs",
      brandId: "b-1",
      brandName: "Aura Glow",
      processId: "p-cs",
      processCode: "CS",
      operatingCalendar: "mon_sat_no_holidays",
      minHeadcountWeekday: 1,
      minHeadcountSunday: 0,
      minHeadcountHoliday: 0,
    };

    const assignment: AssignmentRule = {
      id: "as-1",
      employeeId: "emp-1",
      brandProcessId: "bp-cs",
      startDate: "2026-11-01",
      priority: 1,
    };

    const weeklyOff: WeeklyOffRule = {
      id: "wo-1",
      employeeId: "emp-1",
      weekday: 0, // Sunday
      effectiveFrom: "2026-11-01",
    };

    const input: SchedulerInput = {
      month: mockMonth,
      employees: [emp],
      brandProcesses: [bp],
      assignments: [assignment],
      weeklyOffs: [weeklyOff],
      holidays: mockHolidays, // Nov 8 Diwali (Sunday), Nov 24 Guru Nanak Jayanti (Tuesday)
      leaves: [],
      compOffs: [],
    };

    const result = generateRoster(input);

    // Verify Nov 24 (Tuesday public holiday) has status 'holiday' or is skipped from requirements
    const nov24Demand = expandDemandForMonth(mockMonth, bp, mockHolidays).find(
      (d) => d.date === "2026-11-24"
    );
    expect(nov24Demand).toBeUndefined();

    // Verify no blocking conflicts for this process
    const blocking = result.conflicts.filter((c) => c.brandProcessId === "bp-cs" && c.severity === "blocking");
    expect(blocking.length).toBe(0);
  });

  // Scenario 5: A 365-day process on a public holiday requires coverage.
  it("Scenario 5: A 365-day process on a public holiday requires coverage", () => {
    const bp: BrandProcessRule = {
      id: "bp-365",
      brandId: "b-1",
      brandName: "Urban Botanics",
      processId: "p-ret",
      processCode: "RET",
      operatingCalendar: "all_365",
      minHeadcountWeekday: 1,
      minHeadcountSunday: 1,
      minHeadcountHoliday: 1,
    };

    const demands = expandDemandForMonth(mockMonth, bp, mockHolidays);
    // Nov 8 is Diwali holiday
    const diwaliDemand = demands.find((d) => d.date === "2026-11-08");
    expect(diwaliDemand).toBeDefined();
    expect(diwaliDemand?.requiredHeadcount).toBe(1);
    expect(diwaliDemand?.isHoliday).toBe(true);

    // Nov 24 is Guru Nanak Jayanti holiday
    const guruDemand = demands.find((d) => d.date === "2026-11-24");
    expect(guruDemand).toBeDefined();
    expect(guruDemand?.requiredHeadcount).toBe(1);
    expect(guruDemand?.isHoliday).toBe(true);
  });

  // Scenario 6: Two employees on a brand with one on leave: the remaining one covers, and the output says so.
  it("Scenario 6: Two employees on a brand with one on leave: the remaining one covers", () => {
    const emp1: EmployeeInfo = { id: "emp-1", name: "Neha", email: "neha@example.com", active: true };
    const emp2: EmployeeInfo = { id: "emp-2", name: "Suresh", email: "suresh@example.com", active: true };

    const bp: BrandProcessRule = {
      id: "bp-cs",
      brandId: "b-1",
      brandName: "Daily Greens",
      processId: "p-cs",
      processCode: "CS",
      operatingCalendar: "mon_sat_no_holidays",
      minHeadcountWeekday: 1,
      minHeadcountSunday: 0,
      minHeadcountHoliday: 0,
    };

    const assignments: AssignmentRule[] = [
      { id: "as-1", employeeId: "emp-1", brandProcessId: "bp-cs", startDate: "2026-11-01", priority: 1 },
      { id: "as-2", employeeId: "emp-2", brandProcessId: "bp-cs", startDate: "2026-11-01", priority: 1 },
    ];

    const weeklyOffs: WeeklyOffRule[] = [
      { id: "wo-1", employeeId: "emp-1", weekday: 0, effectiveFrom: "2026-11-01" },
      { id: "wo-2", employeeId: "emp-2", weekday: 0, effectiveFrom: "2026-11-01" },
    ];

    // Neha is on leave from Nov 10 to Nov 12
    const leaves: LeaveItem[] = [
      {
        id: "l-1",
        employeeId: "emp-1",
        startDate: "2026-11-10",
        endDate: "2026-11-12",
        type: "planned",
        status: "approved",
      },
    ];

    const input: SchedulerInput = {
      month: mockMonth,
      employees: [emp1, emp2],
      brandProcesses: [bp],
      assignments,
      weeklyOffs,
      holidays: mockHolidays,
      leaves,
      compOffs: [],
    };

    const result = generateRoster(input);

    // Suresh covers all working days when Neha is on leave
    for (const testDate of ["2026-11-10", "2026-11-11", "2026-11-12"]) {
      const sureshAsgn = result.days.find(
        (d) => d.employeeId === "emp-2" && d.date === testDate && d.status === "working"
      );
      expect(sureshAsgn).toBeDefined();
      expect(sureshAsgn?.brandProcessId).toBe("bp-cs");

      const nehaAsgn = result.days.find(
        (d) => d.employeeId === "emp-1" && d.date === testDate && d.status === "leave"
      );
      expect(nehaAsgn).toBeDefined();
    }

    // No blocking conflict for Daily Greens during those dates
    const blockingOnLeaveDates = result.conflicts.filter(
      (c) =>
        c.brandProcessId === "bp-cs" &&
        c.severity === "blocking" &&
        ["2026-11-10", "2026-11-11", "2026-11-12"].includes(c.date || "")
    );
    expect(blockingOnLeaveDates.length).toBe(0);
  });

  // Scenario 7: A required day with no eligible employees produces a blocking conflict.
  it("Scenario 7: A required day with no eligible employees produces a blocking conflict", () => {
    const bpEmpty: BrandProcessRule = {
      id: "bp-unassigned",
      brandId: "b-unstaffed",
      brandName: "Orphan Brand",
      processId: "p-cs",
      processCode: "CS",
      operatingCalendar: "mon_sat_no_holidays",
      minHeadcountWeekday: 1,
      minHeadcountSunday: 0,
      minHeadcountHoliday: 0,
    };

    const input: SchedulerInput = {
      month: mockMonth,
      employees: [], // No employees at all
      brandProcesses: [bpEmpty],
      assignments: [],
      weeklyOffs: [],
      holidays: mockHolidays,
      leaves: [],
      compOffs: [],
    };

    const result = generateRoster(input);

    const blocking = result.conflicts.filter(
      (c) => c.brandProcessId === "bp-unassigned" && c.severity === "blocking"
    );

    expect(blocking.length).toBeGreaterThan(0);
    expect(blocking[0].message).toContain("0 assigned employees");
    expect(blocking[0].suggestedFix).toBeDefined();
  });

  // Scenario 8: Re-plan after a leave approval keeps pinned days unchanged and only changes future days.
  it("Scenario 8: Re-plan after a leave approval keeps pinned days unchanged and only changes future days", () => {
    const emp1: EmployeeInfo = { id: "emp-1", name: "Kavita", email: "kavita@example.com", active: true };
    const emp2: EmployeeInfo = { id: "emp-2", name: "Manoj", email: "manoj@example.com", active: true };

    const bp: BrandProcessRule = {
      id: "bp-cs",
      brandId: "b-1",
      brandName: "Zen Lifestyle",
      processId: "p-cs",
      processCode: "CS",
      operatingCalendar: "all_365",
      minHeadcountWeekday: 1,
      minHeadcountSunday: 1,
      minHeadcountHoliday: 1,
    };

    const assignments: AssignmentRule[] = [
      { id: "as-1", employeeId: "emp-1", brandProcessId: "bp-cs", startDate: "2026-11-01", priority: 1 },
      { id: "as-2", employeeId: "emp-2", brandProcessId: "bp-cs", startDate: "2026-11-01", priority: 1 },
    ];

    const weeklyOffs: WeeklyOffRule[] = [
      { id: "wo-1", employeeId: "emp-1", weekday: 0, effectiveFrom: "2026-11-01" },
      { id: "wo-2", employeeId: "emp-2", weekday: 0, effectiveFrom: "2026-11-01" },
    ];

    const initialInput: SchedulerInput = {
      month: mockMonth,
      employees: [emp1, emp2],
      brandProcesses: [bp],
      assignments,
      weeklyOffs,
      holidays: mockHolidays,
      leaves: [],
      compOffs: [],
    };

    const initialRoster = generateRoster(initialInput);

    // Pin a past day (e.g. 2026-11-05 where emp1 worked)
    const pastDay = initialRoster.days.find((d) => d.date === "2026-11-05" && d.employeeId === "emp-1");
    expect(pastDay).toBeDefined();

    const currentDaysWithPinned = initialRoster.days.map((d) => {
      if (d.date === "2026-11-05" && d.employeeId === "emp-1") {
        return { ...d, pinned: true };
      }
      return d;
    });

    // Now, Kavita applies for leave on 2026-11-20 (future day)
    const newLeave: LeaveItem = {
      id: "leave-future",
      employeeId: "emp-1",
      startDate: "2026-11-20",
      endDate: "2026-11-20",
      type: "planned",
      status: "approved",
    };

    const updatedInput: SchedulerInput = {
      ...initialInput,
      leaves: [newLeave],
    };

    const replanResult = replanRoster({
      input: updatedInput,
      currentDays: currentDaysWithPinned,
      currentConflicts: initialRoster.conflicts,
      cutoffDate: "2026-11-10", // Past is before Nov 10
      change: {
        type: "LEAVE_APPROVED",
        employeeId: "emp-1",
        startDate: "2026-11-20",
        endDate: "2026-11-20",
      },
    });

    // 1. Pinned past day 2026-11-05 for emp-1 remains completely unchanged
    const pastDayAfter = replanResult.updatedDays.find(
      (d) => d.date === "2026-11-05" && d.employeeId === "emp-1"
    );
    expect(pastDayAfter?.status).toBe(pastDay?.status);
    expect(pastDayAfter?.brandProcessId).toBe(pastDay?.brandProcessId);

    // 2. Future day 2026-11-20 reflects the approved leave
    const leaveDayAfter = replanResult.updatedDays.find(
      (d) => d.date === "2026-11-20" && d.employeeId === "emp-1"
    );
    expect(leaveDayAfter?.status).toBe("leave");

    // 3. Diff correctly registers changed day
    expect(replanResult.diff.changedDays.some((d) => d.date === "2026-11-20")).toBe(true);
  });

  it("keeps the sixth pinned working day in the weekly limit when generating the seventh day", () => {
    const employee: EmployeeInfo = {
      id: "emp-pinned",
      name: "Pinned Employee",
      email: "pinned@example.com",
      active: true,
    };
    const bp: BrandProcessRule = {
      id: "bp-pinned",
      brandId: "brand-pinned",
      brandName: "Pinned Brand",
      processId: "process-cs",
      processCode: "CS",
      operatingCalendar: "all_365",
      minHeadcountWeekday: 1,
      minHeadcountSunday: 1,
      minHeadcountHoliday: 1,
    };
    const existingDays = Array.from({ length: 6 }, (_, index) => ({
      employeeId: employee.id,
      date: `2026-11-${String(index + 2).padStart(2, "0")}`,
      status: "working" as const,
      brandProcessId: bp.id,
      pinned: true,
    }));

    const result = generateRoster({
      month: mockMonth,
      employees: [employee],
      brandProcesses: [bp],
      assignments: [{
        id: "assignment-pinned",
        employeeId: employee.id,
        brandProcessId: bp.id,
        startDate: "2026-11-01",
        priority: 1,
      }],
      weeklyOffs: [{
        id: "weekly-off-pinned",
        employeeId: employee.id,
        weekday: 0,
        effectiveFrom: "2026-11-01",
      }],
      holidays: [],
      leaves: [],
      compOffs: [],
      existingDays,
    });

    const sunday = result.days.find((day) => day.employeeId === employee.id && day.date === "2026-11-08");
    expect(sunday?.status).toBe("weekly_off");
  });

  it("does not allocate an employee to a second process while an exclusive assignment is active", () => {
    const employee: EmployeeInfo = {
      id: "emp-exclusive",
      name: "Exclusive Employee",
      email: "exclusive@example.com",
      active: true,
    };
    const brandProcesses: BrandProcessRule[] = [
      {
        id: "bp-a",
        brandId: "brand-a",
        brandName: "Brand A",
        processId: "process-cs",
        processCode: "CS",
        operatingCalendar: "mon_sat_no_holidays",
        minHeadcountWeekday: 1,
        minHeadcountSunday: 0,
        minHeadcountHoliday: 0,
      },
      {
        id: "bp-b",
        brandId: "brand-b",
        brandName: "Brand B",
        processId: "process-ret",
        processCode: "RET",
        operatingCalendar: "mon_sat_no_holidays",
        minHeadcountWeekday: 1,
        minHeadcountSunday: 0,
        minHeadcountHoliday: 0,
      },
    ];

    const result = generateRoster({
      month: mockMonth,
      employees: [employee],
      brandProcesses,
      assignments: [
        {
          id: "assignment-exclusive",
          employeeId: employee.id,
          brandProcessId: "bp-a",
          startDate: "2026-11-01",
          priority: 1,
          isExclusive: true,
        },
        {
          id: "assignment-second",
          employeeId: employee.id,
          brandProcessId: "bp-b",
          startDate: "2026-11-01",
          priority: 1,
        },
      ],
      weeklyOffs: [],
      holidays: [],
      leaves: [],
      compOffs: [],
    });

    expect(result.days.some(
      (day) => day.employeeId === employee.id && day.date === "2026-11-02" &&
        day.status === "working" && day.brandProcessId === "bp-b"
    )).toBe(false);
  });
});

