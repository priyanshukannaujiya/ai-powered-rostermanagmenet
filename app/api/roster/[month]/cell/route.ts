import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth-helpers";
import { neon } from "@neondatabase/serverless";
import "@/lib/db/dns-patch";
import { z } from "zod";
import { createEmployeeNotification } from "@/lib/notifications/create";
import { syncRosterConflicts } from "@/lib/scheduler/sync-conflicts";

export const dynamic = "force-dynamic";

async function ensureRosterMonth(sql: any, month: string) {
  const monthId = `roster-${month}`;
  const existing = await sql`SELECT id FROM roster_months WHERE month = ${month} LIMIT 1;`;
  if (existing.length === 0) {
    await sql`
      INSERT INTO roster_months (id, month, status, generated_at, updated_at)
      VALUES (${monthId}, ${month}, 'draft', now(), now())
      ON CONFLICT (month) DO NOTHING;
    `;
  }
  return monthId;
}

const editCellSchema = z.object({
  employeeId: z.string().min(1),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  status: z.enum(["working", "weekly_off", "leave", "holiday", "comp_off", "unassigned"]),
  brandProcessId: z.string().nullable().optional(),
  overrideReason: z.string().optional(),
  isOverride: z.boolean().optional(),
});

export async function PUT(
  req: NextRequest,
  { params }: { params: { month: string } }
) {
  const { user, errorResponse } = await requireAuth(["manager", "pod_lead"]);
  if (errorResponse) return errorResponse;

  const month = params.month;
  const sql = neon(process.env.DATABASE_URL!);

  try {
    const body = await req.json();
    const parsed = editCellSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Validation failed", details: parsed.error.format() }, { status: 400 });
    }

    const { employeeId, date, status, brandProcessId, overrideReason, isOverride } = parsed.data;

    if (date.slice(0, 7) !== month) {
      return NextResponse.json(
        { error: `Date ${date} is outside the selected roster month (${month}).` },
        { status: 400 }
      );
    }

    if (isOverride && user?.role !== "manager") {
      return NextResponse.json({ error: "Only managers can override approved leave." }, { status: 403 });
    }
    if (isOverride && !overrideReason?.trim()) {
      return NextResponse.json({ error: "A reason is required for a manager override." }, { status: 400 });
    }

    const employeeAccess = await sql`
      SELECT e.id
      FROM employees e
      WHERE e.id = ${employeeId}
        AND e.active = true
        AND (
          ${user?.role === "manager"}
          OR EXISTS (
            SELECT 1 FROM pods p
            WHERE p.id = e.pod_id AND p.lead_employee_id = ${user?.employeeId || null}
          )
        )
      LIMIT 1;
    `;
    if (employeeAccess.length === 0) {
      return NextResponse.json(
        { error: "Employee not found or you do not have access to this employee." },
        { status: 403 }
      );
    }

    const monthId = await ensureRosterMonth(sql, month);

    const resolvedBrandProcessId = status === "working" ? brandProcessId || null : null;
    if (status === "working" && !resolvedBrandProcessId) {
      return NextResponse.json({ error: "A brand/process must be selected for a working assignment." }, { status: 400 });
    }

    if (resolvedBrandProcessId) {
      const eligibleAssignment = await sql`
        SELECT a.id
        FROM assignments a
        JOIN brand_processes bp ON bp.id = a.brand_process_id
        JOIN brands b ON b.id = bp.brand_id
        WHERE a.employee_id = ${employeeId}
          AND a.brand_process_id = ${resolvedBrandProcessId}
          AND a.active = true
          AND bp.active = true
          AND b.active = true
          AND a.start_date <= ${date}
          AND (a.end_date IS NULL OR a.end_date >= ${date})
        LIMIT 1;
      `;
      if (!eligibleAssignment.length) {
        return NextResponse.json({
          error: "The employee is not actively assigned to this brand/process on the selected date.",
        }, { status: 422 });
      }
    }

    // A working shift cannot be forced onto an employee who has approved leave
    // on that date without an explicit manager override.
    if (status === "working") {
      const leaves = await sql`
        SELECT * FROM leaves
        WHERE employee_id = ${employeeId} AND status = 'approved' AND start_date <= ${date} AND end_date >= ${date};
      `;
      if (leaves.length > 0 && !isOverride) {
        return NextResponse.json(
          {
            error: "BLOCKING_CONFLICT",
            message: `Employee is on approved leave (${leaves[0].type}) on ${date}. Cannot assign working status without explicit manager override.`,
            requiresOverride: true,
          },
          { status: 422 }
        );
      }
    }

    // Snapshot the previous state for the audit trail and notification dedupe.
    const existing = await sql`
      SELECT * FROM roster_days
      WHERE roster_month_id = ${monthId} AND employee_id = ${employeeId} AND date = ${date}
      ORDER BY created_at ASC;
    `;
    const beforeState = existing;

    // Preserve other working process rows for the same employee/date. A
    // non-working status intentionally replaces the whole day's assignments.
    if (status === "working") {
      await sql`
        DELETE FROM roster_days
        WHERE roster_month_id = ${monthId}
          AND employee_id = ${employeeId}
          AND date = ${date}
          AND (status <> 'working' OR brand_process_id = ${resolvedBrandProcessId});
      `;
    } else {
      await sql`
        DELETE FROM roster_days
        WHERE roster_month_id = ${monthId} AND employee_id = ${employeeId} AND date = ${date};
      `;
    }
    const rdId = `rd-${monthId}-${employeeId}-${date}-${resolvedBrandProcessId || status}`;
    await sql`
      INSERT INTO roster_days (
        id, roster_month_id, employee_id, date, status, brand_process_id, pinned, leave_override, notes, created_at, updated_at
      )
      VALUES (
        ${rdId}, ${monthId}, ${employeeId}, ${date}, ${status as any}, ${resolvedBrandProcessId},
        true, ${Boolean(isOverride)}, ${overrideReason || "Manual edit"}, now(), now()
      );
    `;

    // Advance the roster version so an in-flight generation based on an older
    // snapshot fails its compare-and-swap instead of overwriting this manual edit.
    await sql`
      UPDATE roster_months SET updated_at = now() WHERE id = ${monthId};
    `;

    // Re-synchronize conflict records so the roster and dashboard immediately reflect live staffing status
    try {
      await syncRosterConflicts(sql, month);
    } catch (syncErr) {
      console.error("Sync conflicts after cell edit warning:", syncErr);
    }

    let brandName: string | null = null;
    let brandCode: string | null = null;
    let processCode: string | null = null;
    if (resolvedBrandProcessId) {
      const bpRows = await sql`
        SELECT b.name as brand_name, b.code as brand_code, p.code as process_code
        FROM brand_processes bp
        JOIN brands b ON bp.brand_id = b.id
        JOIN processes p ON bp.process_id = p.id
        WHERE bp.id = ${resolvedBrandProcessId}
        LIMIT 1;
      `;
      if (bpRows.length > 0) {
        brandName = bpRows[0].brand_name || null;
        brandCode = bpRows[0].brand_code || null;
        processCode = bpRows[0].process_code || null;
      }
    }

    await sql`
      INSERT INTO audit_log (id, actor_user_id, action, entity, entity_id, before, after, created_at, updated_at)
      VALUES (
        ${`audit-${Date.now()}`},
        ${user?.id || null},
        'MANUAL_ROSTER_EDIT',
        'roster_days',
        ${rdId},
        ${JSON.stringify(beforeState)},
         ${JSON.stringify({ employeeId, date, status, brandProcessId: resolvedBrandProcessId, leaveOverride: Boolean(isOverride), overrideReason })},
        now(),
        now()
      );
    `;

    // Notify ONLY the employee whose own cell changed, and only when the
    // assignment genuinely changed (repeated saves of the same shift stay quiet).
    const isWorkingAssignment = status === "working" && Boolean(resolvedBrandProcessId);
    const wasSameAssignment = existing.some(
      (row: any) =>
        row.status === "working" &&
        row.brand_process_id === resolvedBrandProcessId
    );
    let notificationWarning: string | undefined;

    if (isWorkingAssignment && !wasSameAssignment) {
      try {
        await createEmployeeNotification(sql, {
          employeeId,
          title: "Shift assigned",
          message: `You have been assigned to ${brandName || "a brand"}${processCode ? ` (${processCode})` : ""} on ${date}. Shift status: working.`,
          type: "shift_assignment",
          date,
          metadata: {
            employeeId,
            date,
            status,
            brandProcessId: resolvedBrandProcessId,
            brandName,
            processCode,
          },
          eventId: `shift-assignment:${employeeId}:${date}:${resolvedBrandProcessId || status}`,
          notifyPodLead: false,
        });
      } catch (notificationError) {
        console.error("Cell updated but notification delivery failed:", notificationError);
        notificationWarning = "The cell was updated, but the employee notification could not be delivered.";
      }
    }

    return NextResponse.json({
      success: true,
      message: "Cell updated successfully and pinned",
      notificationWarning,
      day: {
        employee_id: employeeId,
        date,
        status,
        brand_process_id: resolvedBrandProcessId,
        brand_name: brandName,
        brand_code: brandCode,
        process_code: processCode,
        pinned: true,
        notes: overrideReason || "Manual edit",
      },
    });
  } catch (error: any) {
    console.error("Cell update error:", error);
    return NextResponse.json({ error: "Failed to update roster cell." }, { status: 500 });
  }
}
