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
  getMonthBounds,
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

  // Pre-validate date range
  const leaveDates = enumerateDateRange(startDate, endDate);
  const leaveDatesByMonth = groupDatesByMonth(leaveDates);
  const affectedMonthIds = Array.from(leaveDatesByMonth.keys()).map((m) => `roster-${m}`);

  if (leave.status !== "pending") {
    return {
      success: false,
      error: leave.status === "approved"
        ? "This leave request is already approved or is currently being processed."
        : `This leave request is already ${leave.status}.`,
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

  // Check which affected months already have generated rosters
  const generatedMonths = affectedMonthIds.length
    ? await sql`SELECT id, month, updated_at FROM roster_months WHERE id = ANY(${affectedMonthIds});`
    : [];
  const generatedMonthSet = new Set(generatedMonths.map((r: any) => r.month));

  if (generatedMonthSet.size === 0) {
    let notificationWarning: string | undefined;
    if (!previewOnly) {
      const updateResult = await sql`
        UPDATE leaves
        SET status = 'approved', reviewed_by = ${reviewerUserId}, reviewed_at = now(), updated_at = now()
        WHERE id = ${leaveId}
          AND status = 'pending'
          AND (
            ${reviewerRole} <> 'pod_lead'
            OR EXISTS (
              SELECT 1 FROM pods p
              WHERE p.id = ${leave.pod_id}
                AND p.lead_employee_id = ${reviewerEmployeeId || null}
            )
          )
        RETURNING id;
      `;
      if (!updateResult || updateResult.length === 0) {
        return {
          success: false,
          error: "This leave request was already approved or reviewed concurrently by another manager.",
          status: 409,
          leave,
        };
      }
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
      message: `Leave approved for ${leave.employee_name}. No active roster months found to replan.`,
      preview: previewOnly,
      leave,
      notificationWarning,
    };
  }

  // Fetch shared master data
  const [employeesRaw, bpRaw, asgnRaw, woRaw, assignedBrandRows] = await Promise.all([
    sql`SELECT id, name, email, pod_id, active FROM employees WHERE active = true;`,
    sql`
      SELECT bp.*, b.name as brand_name, p.code as process_code
      FROM brand_processes bp
      JOIN brands b ON bp.brand_id = b.id
      JOIN processes p ON bp.process_id = p.id;
    `,
    sql`SELECT * FROM assignments;`,
    sql`SELECT * FROM weekly_offs;`,
    sql`
      SELECT DISTINCT b.name as brand_name, p.code as process_code
      FROM assignments a
      JOIN brand_processes bp ON a.brand_process_id = bp.id
      JOIN brands b ON bp.brand_id = b.id
      JOIN processes p ON bp.process_id = p.id
      WHERE a.employee_id = ${leave.employee_id} AND a.active = true
      ORDER BY b.name ASC
      LIMIT 5;
    `,
  ]);

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

  const affectedBrands = assignedBrandRows.map((row: any) => ({
    brandName: row.brand_name as string,
    processCode: row.process_code as string,
  }));

  // Replan every generated month affected by this leave
  const plansByMonth: Array<{
    m: string;
    mId: string;
    cutoffDate: string;
    replanResult: any;
  }> = [];

  for (const m of Array.from(leaveDatesByMonth.keys())) {
    if (!generatedMonthSet.has(m)) continue;
    const mId = `roster-${m}`;
    const mBounds = getMonthBounds(m);
    const cutoffDate = startDate > mBounds.start ? startDate : mBounds.start;

    const [daysRaw, conflictsRaw, holRaw, compOffsRaw, leavesRaw] = await Promise.all([
      sql`SELECT * FROM roster_days WHERE roster_month_id = ${mId};`,
      sql`SELECT * FROM conflicts WHERE roster_month_id = ${mId};`,
      sql`SELECT * FROM holidays WHERE date >= ${mBounds.start} AND date <= ${mBounds.end};`,
      sql`SELECT * FROM comp_offs WHERE date >= ${mBounds.start} AND date <= ${mBounds.end};`,
      sql`
        SELECT * FROM leaves
        WHERE (status = 'approved' OR id = ${leaveId})
          AND end_date >= ${mBounds.start} AND start_date <= ${mBounds.end};
      `,
    ]);

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

    const holidays: HolidayItem[] = holRaw.map((h: any) => ({
      id: h.id,
      date: formatDateOnly(h.date),
      name: h.name,
    }));

    const compOffs: CompOffItem[] = compOffsRaw.map((c: any) => ({
      id: c.id,
      employeeId: c.employee_id,
      date: formatDateOnly(c.date),
      status: c.status,
    }));

    const leaves: LeaveItem[] = leavesRaw.map((l: any) => ({
      id: l.id,
      employeeId: l.employee_id,
      startDate: formatDateOnly(l.start_date),
      endDate: formatDateOnly(l.end_date),
      type: l.type,
      status: "approved",
    }));

    const mReplanResult = replanRoster({
      input: {
        month: m,
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
      cutoffDate,
      change: {
        type: "LEAVE_APPROVED",
        employeeId: leave.employee_id,
        startDate,
        endDate,
        description: `Approved leave for ${leave.employee_name}`,
      },
    });

    plansByMonth.push({
      m,
      mId,
      cutoffDate,
      replanResult: mReplanResult,
    });
  }

  const primaryPlan = plansByMonth.find((p) => p.m === month) || plansByMonth[0];

  if (previewOnly) {
    return {
      success: true,
      message: `Simulated leave replan for ${leave.employee_name}`,
      preview: true,
      leave,
      diff: primaryPlan.replanResult.diff,
      metrics: primaryPlan.replanResult.metrics,
    };
  }

  // Optimistic month-level concurrency guard: every affected roster month must
  // still have the version read while building this replan. Concurrent approvals
  // that planned from the same version cannot both commit stale roster changes.
  const rosterVersionToken = new Date().toISOString();
  const expectedRosterVersions = generatedMonths.map((row: any) => ({
    id: row.id,
    updated_at: row.updated_at instanceof Date ? row.updated_at.toISOString() : row.updated_at,
  }));

  // 5. Claim and roster writes run in the same database transaction.
  // Every subsequent write is guarded by this unique review timestamp so a
  // competing approval cannot modify the roster if its claim affects zero rows.
  // 6. Atomic, Transactional Roster Execution
  let txResults: any[];
  try {
    txResults = await sql.transaction((tx) => {
      const txStmts: any[] = [];
      txStmts.push(tx`
        WITH expected AS (
          SELECT * FROM jsonb_to_recordset(${JSON.stringify(expectedRosterVersions)}::jsonb)
            AS x(id text, updated_at timestamptz)
        ),
        locked AS MATERIALIZED (
          SELECT rm.id
          FROM roster_months rm
          JOIN expected e ON e.id = rm.id AND e.updated_at = rm.updated_at
          ORDER BY rm.id
          FOR UPDATE
        ),
        guard AS (
          SELECT COUNT(*) = ${expectedRosterVersions.length} AS ok FROM locked
        )
        UPDATE roster_months rm
        SET updated_at = ${rosterVersionToken}::timestamptz
        FROM locked
        WHERE rm.id = locked.id AND (SELECT ok FROM guard)
        RETURNING rm.id;
      `);
      txStmts.push(tx`
        UPDATE leaves
        SET status = 'approved', reviewed_by = ${reviewerUserId}, reviewed_at = transaction_timestamp(), updated_at = now()
        WHERE id = ${leaveId}
          AND status = 'pending'
          AND (
            ${reviewerRole} <> 'pod_lead'
            OR EXISTS (
              SELECT 1 FROM pods p
              WHERE p.id = ${leave.pod_id}
                AND p.lead_employee_id = ${reviewerEmployeeId || null}
            )
          )
          AND (
            SELECT COUNT(*) = ${expectedRosterVersions.length}
            FROM roster_months
            WHERE id = ANY(${affectedMonthIds})
              AND updated_at = ${rosterVersionToken}::timestamptz
          )
        RETURNING id;
      `);

      // 6a. Drop replannable future days and conflicts across all affected months
      for (const plan of plansByMonth) {
        txStmts.push(tx`
          DELETE FROM roster_days
          WHERE roster_month_id = ${plan.mId}
            AND date >= ${plan.cutoffDate}
            AND pinned = false
            AND EXISTS (SELECT 1 FROM leaves WHERE id = ${leaveId} AND status = 'approved' AND reviewed_by = ${reviewerUserId} AND reviewed_at = transaction_timestamp());
        `);
        txStmts.push(tx`
          DELETE FROM conflicts
          WHERE roster_month_id = ${plan.mId}
            AND EXISTS (SELECT 1 FROM leaves WHERE id = ${leaveId} AND status = 'approved' AND reviewed_by = ${reviewerUserId} AND reviewed_at = transaction_timestamp());
        `);
      }

      // 6b. Remove prior working shifts for absent employee across existing affected months
      for (const affMonthId of affectedMonthIds) {
        if (!generatedMonthSet.has(affMonthId.replace("roster-", ""))) continue;
        txStmts.push(tx`
          DELETE FROM roster_days
          WHERE roster_month_id = ${affMonthId}
            AND employee_id = ${leave.employee_id}
            AND date >= ${startDate}
            AND date <= ${endDate}
            AND EXISTS (SELECT 1 FROM leaves WHERE id = ${leaveId} AND status = 'approved' AND reviewed_by = ${reviewerUserId} AND reviewed_at = transaction_timestamp());
        `);
      }

      // 6c. Insert updated days and conflicts for each month
      for (const plan of plansByMonth) {
        const daysToInsert = plan.replanResult.updatedDays.filter((d: any) => {
          if (d.date < plan.cutoffDate) return false;
          if (isDateOnApprovedLeave(d.date, d.employeeId, leave.employee_id, startDate, endDate)) return false;
          return true;
        });

        for (const d of daysToInsert) {
          const rdId = `rd-${plan.mId}-${d.employeeId}-${d.date}-${d.brandProcessId || "none"}`;
          txStmts.push(tx`
            INSERT INTO roster_days (id, roster_month_id, employee_id, date, status, brand_process_id, pinned, notes, created_at, updated_at)
            SELECT ${rdId}, ${plan.mId}, ${d.employeeId}, ${d.date}, ${d.status as any}, ${d.brandProcessId || null}, ${d.pinned || false}, ${d.notes || null}, now(), now()
            WHERE EXISTS (SELECT 1 FROM leaves WHERE id = ${leaveId} AND status = 'approved' AND reviewed_by = ${reviewerUserId} AND reviewed_at = transaction_timestamp())
            ON CONFLICT (id)
            DO UPDATE SET status = EXCLUDED.status, brand_process_id = EXCLUDED.brand_process_id, pinned = EXCLUDED.pinned, notes = EXCLUDED.notes, updated_at = now();
          `);
        }

        for (const c of plan.replanResult.updatedConflicts) {
          const cId = `cf-${plan.mId}-${c.id}`;
          txStmts.push(tx`
            INSERT INTO conflicts (id, roster_month_id, type, severity, brand_process_id, employee_id, date, message, suggested_fix, resolved, created_at, updated_at)
            SELECT ${cId}, ${plan.mId}, ${c.type}, ${c.severity as any}, ${c.brandProcessId || null}, ${c.employeeId || null}, ${c.date || null}, ${c.message}, ${c.suggestedFix || null}, false, now(), now()
            WHERE EXISTS (SELECT 1 FROM leaves WHERE id = ${leaveId} AND status = 'approved' AND reviewed_by = ${reviewerUserId} AND reviewed_at = transaction_timestamp())
            ON CONFLICT (id) DO UPDATE SET message = EXCLUDED.message, suggested_fix = EXCLUDED.suggested_fix, severity = EXCLUDED.severity, resolved = EXCLUDED.resolved, updated_at = now();
          `);
        }
      }

      // 6d. Pin the approved leave itself as a dedicated 'leave' record for all leave dates
      // ONLY for months that have an active roster_months record (avoids FK violation on ungenerated months)
      for (const leaveDate of leaveDates) {
        const dMonth = leaveDate.slice(0, 7);
        if (!generatedMonthSet.has(dMonth)) continue;
        const dMonthId = `roster-${dMonth}`;
        const leaveDayId = `rd-${dMonthId}-${leave.employee_id}-${leaveDate}-leave`;
        txStmts.push(tx`
          DELETE FROM roster_days
          WHERE roster_month_id = ${dMonthId}
            AND employee_id = ${leave.employee_id}
            AND date = ${leaveDate}
            AND EXISTS (SELECT 1 FROM leaves WHERE id = ${leaveId} AND status = 'approved' AND reviewed_by = ${reviewerUserId} AND reviewed_at = transaction_timestamp());
        `);
        txStmts.push(tx`
          INSERT INTO roster_days (id, roster_month_id, employee_id, date, status, brand_process_id, pinned, notes, created_at, updated_at)
          SELECT ${leaveDayId}, ${dMonthId}, ${leave.employee_id}, ${leaveDate}, 'leave', NULL, true, ${APPROVED_LEAVE_NOTE}, now(), now()
          WHERE EXISTS (SELECT 1 FROM leaves WHERE id = ${leaveId} AND status = 'approved' AND reviewed_by = ${reviewerUserId} AND reviewed_at = transaction_timestamp())
          ON CONFLICT (id) DO UPDATE SET status = 'leave', brand_process_id = NULL, pinned = true, notes = ${APPROVED_LEAVE_NOTE}, updated_at = now();
        `);
      }

      // 6e. Audit log
      txStmts.push(tx`
        INSERT INTO audit_log (id, actor_user_id, action, entity, entity_id, after, created_at, updated_at)
        SELECT
          ${`audit-${Date.now()}`},
          ${reviewerUserId},
          'LEAVE_APPROVED_REPLAN',
          'leaves',
          ${leaveId},
          ${JSON.stringify({
            monthsReplanned: plansByMonth.map((p) => p.m),
            diffSummary: primaryPlan.replanResult.diff.changedDays.length,
            newConflicts: primaryPlan.replanResult.diff.newConflicts.length,
            employeeName: leave.employee_name,
            startDate,
            endDate,
          })}::jsonb,
          now(),
          now()
        WHERE EXISTS (SELECT 1 FROM leaves WHERE id = ${leaveId} AND status = 'approved' AND reviewed_by = ${reviewerUserId} AND reviewed_at = transaction_timestamp());
      `);

      return txStmts;
    });
  } catch (txError) {
    // The leave claim and roster changes roll back together.
    throw txError;
  }

  if (!txResults[1] || txResults[1].length === 0) {
    return {
      success: false,
      error: "This leave request was already approved or reviewed concurrently by another manager.",
      status: 409,
    };
  }

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
    diff: primaryPlan?.replanResult?.diff,
    metrics: primaryPlan?.replanResult?.metrics,
    notificationWarning,
  };
}
