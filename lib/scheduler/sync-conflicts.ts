import { expandDemandForMonth } from "./calendar";
import { checkCapacity } from "./capacity";
import { validateRosterAndGenerateConflicts } from "./conflicts";
import { formatDateOnly } from "@/lib/date-utils";
import type {
  SchedulerInput,
  EmployeeInfo,
  BrandProcessRule,
  AssignmentRule,
  WeeklyOffRule,
  HolidayItem,
  LeaveItem,
  CompOffItem,
  RosterDayAssignment,
  ConflictItem,
} from "./types";

/**
 * Deterministically computes and synchronizes conflicts for a roster month into the conflicts table.
 */
export async function syncRosterConflicts(sql: any, month: string): Promise<ConflictItem[]> {
  const monthId = `roster-${month}`;

  const daysRaw = await sql`
    SELECT * FROM roster_days WHERE roster_month_id = ${monthId};
  `;
  if (!daysRaw || daysRaw.length === 0) {
    await sql`DELETE FROM conflicts WHERE roster_month_id = ${monthId};`;
    return [];
  }

  const days: RosterDayAssignment[] = daysRaw.map((d: any) => ({
    employeeId: d.employee_id,
    date: formatDateOnly(d.date),
    status: d.status,
    brandProcessId: d.brand_process_id,
    pinned: d.pinned,
    notes: d.notes,
  }));

  const employeesRaw = await sql`SELECT * FROM employees WHERE active = true;`;
  const bpRaw = await sql`
    SELECT bp.*, b.name as brand_name, p.code as process_code,
      COALESCE(mr.operating_calendar, bp.operating_calendar) as month_operating_calendar,
      COALESCE(mr.min_headcount_weekday, bp.min_headcount_weekday) as month_min_headcount_weekday,
      COALESCE(mr.min_headcount_sunday, bp.min_headcount_sunday) as month_min_headcount_sunday,
      COALESCE(mr.min_headcount_holiday, bp.min_headcount_holiday) as month_min_headcount_holiday
    FROM brand_processes bp
    JOIN brands b ON bp.brand_id = b.id
    JOIN processes p ON bp.process_id = p.id
    LEFT JOIN roster_month_rules mr ON mr.brand_process_id = bp.id AND mr.month = ${month}
    WHERE bp.active = true AND b.active = true;
  `;

  const [yearStr, monthStr] = month.split("-");
  const lastDay = new Date(parseInt(yearStr, 10), parseInt(monthStr, 10), 0).getDate();
  const startDate = `${month}-01`;
  const endDate = `${month}-${String(lastDay).padStart(2, "0")}`;

  const [asgnRaw, woRaw, holRaw, leavesRaw, compOffsRaw] = await Promise.all([
    sql`SELECT * FROM assignments WHERE active = true;`,
    sql`SELECT * FROM weekly_offs;`,
    sql`SELECT * FROM holidays WHERE date >= ${startDate} AND date <= ${endDate};`,
    sql`SELECT * FROM leaves WHERE status = 'approved' AND start_date <= ${endDate} AND end_date >= ${startDate};`,
    sql`SELECT * FROM comp_offs WHERE date >= ${startDate} AND date <= ${endDate};`,
  ]);

  const input: SchedulerInput = {
    month,
    employees: employeesRaw.map((e: any): EmployeeInfo => ({
      id: e.id,
      name: e.name,
      email: e.email,
      podId: e.pod_id,
      active: e.active,
    })),
    brandProcesses: bpRaw.map((b: any): BrandProcessRule => ({
      id: b.id,
      brandId: b.brand_id,
      brandName: b.brand_name,
      processId: b.process_id,
      processCode: b.process_code,
      operatingCalendar: b.month_operating_calendar,
      minHeadcountWeekday: b.month_min_headcount_weekday,
      minHeadcountSunday: b.month_min_headcount_sunday,
      minHeadcountHoliday: b.month_min_headcount_holiday,
    })),
    assignments: asgnRaw.map((a: any): AssignmentRule => ({
      id: a.id,
      employeeId: a.employee_id,
      brandProcessId: a.brand_process_id,
      startDate: formatDateOnly(a.start_date),
      endDate: a.end_date ? formatDateOnly(a.end_date) : null,
      priority: a.priority,
      isExclusive: a.is_exclusive,
    })),
    weeklyOffs: woRaw.map((w: any): WeeklyOffRule => ({
      id: w.id,
      employeeId: w.employee_id,
      weekday: w.weekday,
      effectiveFrom: formatDateOnly(w.effective_from),
      effectiveTo: w.effective_to ? formatDateOnly(w.effective_to) : null,
    })),
    holidays: holRaw.map((h: any): HolidayItem => ({
      id: h.id,
      date: formatDateOnly(h.date),
      name: h.name,
    })),
    leaves: leavesRaw.map((l: any): LeaveItem => ({
      id: l.id,
      employeeId: l.employee_id,
      startDate: formatDateOnly(l.start_date),
      endDate: formatDateOnly(l.end_date),
      type: l.type,
      status: l.status,
    })),
    compOffs: compOffsRaw.map((c: any): CompOffItem => ({
      id: c.id,
      employeeId: c.employee_id,
      date: formatDateOnly(c.date),
      status: c.status,
    })),
  };

  const allDemands: any[] = [];
  for (const bp of input.brandProcesses) {
    const bpDemands = expandDemandForMonth(input.month, bp, input.holidays);
    allDemands.push(...bpDemands);
  }

  const { blockingConflicts: preSolveConflicts } = checkCapacity(input, allDemands);
  const postSolveConflicts = validateRosterAndGenerateConflicts(input, allDemands, days);

  // Capacity checks use static assignment eligibility. A manager can manually
  // place a qualified backup directly on the roster without changing that
  // employee's long-term assignment. Do not keep a capacity warning when the
  // actual roster already satisfies the required headcount for that date.
  const coveredDemandKeys = new Set<string>();
  for (const demand of allDemands) {
    const staffed = new Set(
      days
        .filter((day) =>
          day.status === "working" &&
          day.brandProcessId === demand.brandProcessId &&
          day.date === demand.date
        )
        .map((day) => day.employeeId)
    );
    if (staffed.size >= demand.requiredHeadcount) {
      coveredDemandKeys.add(`${demand.brandProcessId}_${demand.date}`);
    }
  }

  const remainingCapacityConflicts = preSolveConflicts.filter((conflict) =>
    !conflict.brandProcessId ||
    !conflict.date ||
    !coveredDemandKeys.has(`${conflict.brandProcessId}_${conflict.date}`)
  );
  const allConflicts = [...remainingCapacityConflicts, ...postSolveConflicts];

  // Replace the conflict snapshot atomically so dashboards never read a
  // partially refreshed set if an insert fails.
  await sql.transaction((tx) => {
    const statements = [
      tx`DELETE FROM conflicts WHERE roster_month_id = ${monthId};`,
      ...allConflicts.map((c) => {
        const cId = `cf-${monthId}-${c.id}`;
        return tx`
          INSERT INTO conflicts (id, roster_month_id, type, severity, brand_process_id, employee_id, date, message, suggested_fix, resolved, created_at, updated_at)
          VALUES (${cId}, ${monthId}, ${c.type}, ${c.severity}, ${c.brandProcessId || null}, ${c.employeeId || null}, ${c.date || null}, ${c.message}, ${c.suggestedFix || null}, false, now(), now());
        `;
      }),
    ];
    return statements;
  });

  return allConflicts;
}
