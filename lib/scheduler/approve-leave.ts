import { neon } from "@neondatabase/serverless";
import "@/lib/db/dns-patch";
import { replanRoster } from "./replan";
import { syncRosterConflicts } from "./sync-conflicts";
import {
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
import { formatDateOnly } from "@/lib/date-utils";
import { createEmployeeNotification } from "@/lib/notifications/create";
import {
  APPROVED_LEAVE_NOTE,
  enumerateDateRange,
  groupDatesByMonth,
  isDateOnApprovedLeave,
} from "./leave-days";

export interface ApproveLeaveParams {
  leaveId: string;
  reviewerUserId: string;
  reviewerRole: string;
  reviewerEmployeeId?: string | null;
  previewOnly?: boolean;
}

export interface ApproveLeaveResult {
  success: boolean;
  message?: string;
  preview?: boolean;
  leave?: any;
  diff?: any;
  metrics?: any;
  notificationWarning?: string;
  error?: string;
  status?: number;
}

export async function approveLeaveAndReplan({
  leaveId,
  reviewerUserId,
  reviewerRole,
  reviewerEmployeeId,
  previewOnly = false,
}: ApproveLeaveParams): Promise<ApproveLeaveResult> {
  const sql = neon(process.env.DATABASE_URL!);

  // 1. Fetch leave record
  const leaveRows = await sql`
    SELECT l.*, e.name as employee_name, e.pod_id, p.name as pod_name
    FROM leaves l
    JOIN employees e ON l.employee_id = e.id
    LEFT JOIN pods p ON e.pod_id = p.id
    WHERE l.id = ${leaveId}
    LIMIT 1;
  `;

  if (!leaveRows || leaveRows.length === 0) {
    return {
      success: false,
      error: "Leave request not found",
      status: 404,
    };
  }

  const leave = leaveRows[0];
  const startDate = formatDateOnly(leave.start_date);
  const endDate = formatDateOnly(leave.end_date);
  const month = startDate.slice(0, 7); // e.g. '2026-11'
  const monthId = `roster-${month}`;

  if (leave.status !== "pending") {
    if (leave.status === "approved") {
      // Ensure the approved leave is pinned into roster_days if it was previously missed
      for (const leaveDate of enumerateDateRange(startDate, endDate)) {
        const dMonth = leaveDate.slice(0, 7);
        const dMonthId = `roster-${dMonth}`;
        const leaveDayId = `rd-${dMonthId}-${leave.employee_id}-${leaveDate}-leave`;
        await sql`
          DELETE FROM roster_days
          WHERE roster_month_id = ${dMonthId}
            AND employee_id = ${leave.employee_id}
            AND date = ${leaveDate};
        `;
        await sql`
          INSERT INTO roster_days (id, roster_month_id, employee_id, date, status, brand_process_id, pinned, notes, created_at, updated_at)
          VALUES (${leaveDayId}, ${dMonthId}, ${leave.employee_id}, ${leaveDate}, 'leave', NULL, true, ${APPROVED_LEAVE_NOTE}, now(), now())
          ON CONFLICT (id) DO UPDATE SET status = 'leave', brand_process_id = NULL, pinned = true, notes = ${APPROVED_LEAVE_NOTE}, updated_at = now();
        `;
      }
      return {
        success: true,
        message: `This leave request is already approved for ${leave.employee_name}.`,
        leave,
      };
    }
    return {
      success: false,
      error: `This leave request is already ${leave.status}.`,
      status: 409,
    };
  }

  // 2. Pod lead scope check
  if (reviewerRole === "pod_lead") {
    const podRows = await sql`SELECT lead_employee_id FROM pods WHERE id = ${leave.pod_id} LIMIT 1;`;
    if (podRows.length === 0 || podRows[0].lead_employee_id !== reviewerEmployeeId) {
      return {
        success: false,
        error: `Pod lead can only approve leaves within their assigned pod (${leave.pod_name || "Pod"}).`,
        status: 403,
      };
    }
  }

  // 3. Calculate safe month boundaries (e.g. 2026-11-30, not 2026-11-31)
  const [yearStr, monthStr] = month.split("-");
  const lastDay = new Date(parseInt(yearStr), parseInt(monthStr), 0).getDate();
  const monthStart = `${month}-01`;
  const monthEnd = `${month}-${String(lastDay).padStart(2, "0")}`;

  // 4. Fetch existing roster month & days
  const monthRows = await sql`SELECT * FROM roster_months WHERE id = ${monthId} LIMIT 1;`;
  if (monthRows.length === 0) {
    // If roster not yet generated, simply approve
    let notificationWarning: string | undefined;
    if (!previewOnly) {
      await sql`
        UPDATE leaves
        SET status = 'approved', reviewed_by = ${reviewerUserId}, reviewed_at = now(), updated_at = now()
        WHERE id = ${leaveId};
      `;
      try {
        await createEmployeeNotification(sql, {
          employeeId: leave.employee_id,
          title: "Leave request approved",
          message: `Your leave request for ${startDate} to ${endDate} has been approved. No roster had been generated for ${month}.`,
          type: "leave_approved",
          date: startDate,
          metadata: { leaveId, status: "approved" },
          notifyPodLead: true,
        });
      } catch (notificationError) {
        console.error("Leave approved but notification delivery failed:", notificationError);
        notificationWarning = "The leave was approved, but its notification could not be delivered.";
      }
    }
    return {
      success: true,
      message: `Leave approved for ${leave.employee_name}. No active roster month (${month}) found to replan.`,
      preview: previewOnly,
      leave,
      notificationWarning,
    };
  }

  // Fetch existing days and conflicts
  const daysRaw = await sql`SELECT * FROM roster_days WHERE roster_month_id = ${monthId};`;
  const conflictsRaw = await sql`SELECT * FROM conflicts WHERE roster_month_id = ${monthId};`;

  const currentDays: RosterDayAssignment[] = daysRaw.map((d: any) => ({
    employeeId: d.employee_id,
    date: formatDateOnly(d.date),
    status: d.status,
    brandProcessId: d.brand_process_id,
    pinned: d.pinned,
    notes: d.notes,
  }));

  const currentConflicts: ConflictItem[] = conflictsRaw.map((c: any) => ({
    id: c.id,
    type: c.type,
    severity: c.severity,
    brandProcessId: c.brand_process_id,
    employeeId: c.employee_id,
    date: c.date ? formatDateOnly(c.date) : null,
    message: c.message,
    suggestedFix: c.suggested_fix,
    resolved: c.resolved,
  }));

  // Fetch master data for scheduler using safe month bounds
  const employeesRaw = await sql`SELECT id, name, email, pod_id, active FROM employees WHERE active = true;`;
  const bpRaw = await sql`
    SELECT bp.*, b.name as brand_name, p.code as process_code
    FROM brand_processes bp
    JOIN brands b ON bp.brand_id = b.id
    JOIN processes p ON bp.process_id = p.id;
  `;
  const asgnRaw = await sql`SELECT * FROM assignments;`;
  const woRaw = await sql`SELECT * FROM weekly_offs;`;
  const holRaw = await sql`SELECT * FROM holidays WHERE date >= ${monthStart} AND date <= ${monthEnd};`;
  const leavesRaw = await sql`SELECT * FROM leaves WHERE (status = 'approved' OR id = ${leaveId}) AND end_date >= ${monthStart} AND start_date <= ${monthEnd};`;
  const compOffsRaw = await sql`SELECT * FROM comp_offs WHERE date >= ${monthStart} AND date <= ${monthEnd};`;

  const employees: EmployeeInfo[] = employeesRaw.map((e: any) => ({
    id: e.id,
    name: e.name,
    email: e.email,
    podId: e.pod_id,
    active: e.active,
  }));

  const brandProcesses: BrandProcessRule[] = bpRaw.map((b: any) => ({
    id: b.id,
    brandId: b.brand_id,
    brandName: b.brand_name,
    processId: b.process_id,
    processCode: b.process_code,
    operatingCalendar: b.operating_calendar,
    minHeadcountWeekday: b.min_headcount_weekday,
    minHeadcountSunday: b.min_headcount_sunday,
    minHeadcountHoliday: b.min_headcount_holiday,
  }));

  const assignments: AssignmentRule[] = asgnRaw.map((a: any) => ({
    id: a.id,
    employeeId: a.employee_id,
    brandProcessId: a.brand_process_id,
    startDate: formatDateOnly(a.start_date),
    endDate: a.end_date ? formatDateOnly(a.end_date) : null,
    priority: a.priority,
  }));

  const weeklyOffs: WeeklyOffRule[] = woRaw.map((w: any) => ({
    id: w.id,
    employeeId: w.employee_id,
    weekday: w.weekday,
    effectiveFrom: formatDateOnly(w.effective_from),
    effectiveTo: w.effective_to ? formatDateOnly(w.effective_to) : null,
  }));

  const holidays: HolidayItem[] = holRaw.map((h: any) => ({
    id: h.id,
    date: formatDateOnly(h.date),
    name: h.name,
  }));

  const leaves: LeaveItem[] = leavesRaw.map((l: any) => ({
    id: l.id,
    employeeId: l.employee_id,
    startDate: formatDateOnly(l.start_date),
    endDate: formatDateOnly(l.end_date),
    type: l.type,
    status: "approved", // treat as approved for the simulation
  }));

  const compOffs: CompOffItem[] = compOffsRaw.map((c: any) => ({
    id: c.id,
    employeeId: c.employee_id,
    date: formatDateOnly(c.date),
    status: c.status,
  }));

  // Run pure replanRoster
  const replanResult = replanRoster({
    input: {
      month,
      employees,
      brandProcesses,
      assignments,
      weeklyOffs,
      holidays,
      leaves,
      compOffs,
    },
    currentDays,
    currentConflicts,
    cutoffDate: startDate,
    change: {
      type: "LEAVE_APPROVED",
      employeeId: leave.employee_id,
      startDate,
      endDate,
      description: `Approved leave for ${leave.employee_name}`,
    },
  });

  // If preview only, return the simulation diff
  if (previewOnly) {
    return {
      success: true,
      message: `Simulated leave replan for ${leave.employee_name}`,
      preview: true,
      leave,
      diff: replanResult.diff,
      metrics: replanResult.metrics,
    };
  }

  // 5. Commit to database
  const leaveDates = enumerateDateRange(startDate, endDate);
  const leaveDatesByMonth = groupDatesByMonth(leaveDates);
  const affectedMonthIds = Array.from(leaveDatesByMonth.keys()).map((m) => `roster-${m}`);

  const generatedMonths = affectedMonthIds.length
    ? await sql`
        SELECT id, month FROM roster_months WHERE id = ANY(${affectedMonthIds});
      `
    : [];

  // Brands the absent employee was covering, used verbatim in the notification.
  const assignedBrandRows = await sql`
    SELECT DISTINCT b.name as brand_name, p.code as process_code
    FROM assignments a
    JOIN brand_processes bp ON a.brand_process_id = bp.id
    JOIN brands b ON bp.brand_id = b.id
    JOIN processes p ON bp.process_id = p.id
    WHERE a.employee_id = ${leave.employee_id} AND a.active = true
    ORDER BY b.name ASC
    LIMIT 5;
  `;
  const affectedBrands = assignedBrandRows.map((row: any) => ({
    brandName: row.brand_name as string,
    processCode: row.process_code as string,
  }));

  await sql`
    UPDATE leaves
    SET status = 'approved', reviewed_by = ${reviewerUserId}, reviewed_at = now(), updated_at = now()
    WHERE id = ${leaveId};
  `;

  // Drop every re-plannable future day in the starting month, then rebuild from the solver output.
  await sql`DELETE FROM roster_days WHERE roster_month_id = ${monthId} AND date >= ${startDate} AND pinned = false;`;
  await sql`DELETE FROM conflicts WHERE roster_month_id = ${monthId};`;

  // Explicitly remove any prior working shifts (pinned or unpinned) for the absent employee during the leave period across all affected months
  for (const affMonthId of affectedMonthIds) {
    await sql`
      DELETE FROM roster_days
      WHERE roster_month_id = ${affMonthId}
        AND employee_id = ${leave.employee_id}
        AND date >= ${startDate}
        AND date <= ${endDate};
    `;
  }

  // Insert updated days for other colleagues from the replan solver in concurrent chunks
  const daysToInsert = replanResult.updatedDays.filter((d) => {
    if (d.date < startDate) return false;
    if (isDateOnApprovedLeave(d.date, d.employeeId, leave.employee_id, startDate, endDate)) return false;
    return true;
  });

  const chunkSize = 25;
  for (let i = 0; i < daysToInsert.length; i += chunkSize) {
    const chunk = daysToInsert.slice(i, i + chunkSize);
    await Promise.all(
      chunk.map(async (d) => {
        const rdId = `rd-${monthId}-${d.employeeId}-${d.date}-${d.brandProcessId || "none"}`;
        await sql`
          INSERT INTO roster_days (id, roster_month_id, employee_id, date, status, brand_process_id, pinned, notes, created_at, updated_at)
          VALUES (${rdId}, ${monthId}, ${d.employeeId}, ${d.date}, ${d.status as any}, ${d.brandProcessId || null}, ${d.pinned || false}, ${d.notes || null}, now(), now())
          ON CONFLICT (id)
          DO UPDATE SET status = EXCLUDED.status, brand_process_id = EXCLUDED.brand_process_id, pinned = EXCLUDED.pinned, notes = EXCLUDED.notes, updated_at = now();
        `;
      })
    );
  }

  // Pin the approved leave itself as a dedicated 'leave' record for all leave dates.
  for (const leaveDate of leaveDates) {
    const dMonth = leaveDate.slice(0, 7);
    const dMonthId = `roster-${dMonth}`;
    const leaveDayId = `rd-${dMonthId}-${leave.employee_id}-${leaveDate}-leave`;
    await sql`
      DELETE FROM roster_days
      WHERE roster_month_id = ${dMonthId}
        AND employee_id = ${leave.employee_id}
        AND date = ${leaveDate};
    `;
    await sql`
      INSERT INTO roster_days (id, roster_month_id, employee_id, date, status, brand_process_id, pinned, notes, created_at, updated_at)
      VALUES (${leaveDayId}, ${dMonthId}, ${leave.employee_id}, ${leaveDate}, 'leave', NULL, true, ${APPROVED_LEAVE_NOTE}, now(), now())
      ON CONFLICT (id) DO UPDATE SET status = 'leave', brand_process_id = NULL, pinned = true, notes = ${APPROVED_LEAVE_NOTE}, updated_at = now();
    `;
  }

  // Insert updated conflicts in concurrent chunks
  for (let i = 0; i < replanResult.updatedConflicts.length; i += chunkSize) {
    const chunk = replanResult.updatedConflicts.slice(i, i + chunkSize);
    await Promise.all(
      chunk.map(async (c) => {
        const cId = `cf-${monthId}-${c.id}`;
        await sql`
          INSERT INTO conflicts (id, roster_month_id, type, severity, brand_process_id, employee_id, date, message, suggested_fix, resolved, created_at, updated_at)
          VALUES (${cId}, ${monthId}, ${c.type}, ${c.severity as any}, ${c.brandProcessId || null}, ${c.employeeId || null}, ${c.date || null}, ${c.message}, ${c.suggestedFix || null}, false, now(), now())
          ON CONFLICT (id) DO UPDATE SET message = EXCLUDED.message, suggested_fix = EXCLUDED.suggested_fix, severity = EXCLUDED.severity, resolved = EXCLUDED.resolved, updated_at = now();
        `;
      })
    );
  }

  // Cross-month synchronization: if leave dates span into subsequent months, sync conflicts there too
  for (const otherMonth of Array.from(leaveDatesByMonth.keys())) {
    if (otherMonth !== month) {
      try {
        await syncRosterConflicts(sql, otherMonth);
      } catch (syncErr) {
        console.warn(`Failed to sync conflicts for secondary month ${otherMonth}:`, syncErr);
      }
    }
  }

  // Audit log
  await sql`
    INSERT INTO audit_log (id, actor_user_id, action, entity, entity_id, after, created_at, updated_at)
    VALUES (
      ${`audit-${Date.now()}`},
      ${reviewerUserId},
      'LEAVE_APPROVED_REPLAN',
      'leaves',
      ${leaveId},
      ${JSON.stringify({
    diffSummary: replanResult.diff.changedDays.length,
    newConflicts: replanResult.diff.newConflicts.length,
    employeeName: leave.employee_name,
    startDate,
    endDate,
  })},
      now(),
      now()
    );
  `;

  const brandSummary = affectedBrands
    .map((brand) => `${brand.brandName} (${brand.processCode})`)
    .join(", ");
  const approvalMessage = brandSummary
    ? `Your leave request for ${startDate} to ${endDate} has been approved (status: approved). Your ${brandSummary} shifts on those dates are now recorded as approved leave.`
    : `Your leave request for ${startDate} to ${endDate} has been approved (status: approved). Those dates are now recorded as approved leave in your roster.`;

  let notificationWarning: string | undefined;
  try {
    await createEmployeeNotification(sql, {
      employeeId: leave.employee_id,
      title: "Leave request approved",
      message: approvalMessage,
      type: "leave_approved",
      date: startDate,
      metadata: {
        leaveId,
        status: "approved",
        startDate,
        endDate,
        leaveType: leave.type,
        brands: affectedBrands,
      },
      notifyPodLead: true,
    });
  } catch (notificationError) {
    console.error("Leave approved but notification delivery failed:", notificationError);
    notificationWarning = "The leave was approved, but its notification could not be delivered.";
  }

  return {
    success: true,
    message: `Leave for ${leave.employee_name} (${startDate} to ${endDate}) approved and future roster days replanned successfully.`,
    leave,
    diff: replanResult.diff,
    metrics: replanResult.metrics,
    notificationWarning,
  };
}
