import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth-helpers";
import { neon } from "@neondatabase/serverless";
import "@/lib/db/dns-patch";
import { z } from "zod";
import { isAvailable } from "@/lib/scheduler/constraints";

export const dynamic = "force-dynamic";

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

    const monthId = `roster-${month}`;
    const monthRecord = await sql`SELECT * FROM roster_months WHERE id = ${monthId} LIMIT 1;`;
    if (!monthRecord || monthRecord.length === 0) {
      return NextResponse.json({ error: "Roster month not found. Please generate the roster first." }, { status: 404 });
    }

    // Server-side constraint validation
    // If setting to 'working', verify employee is available (e.g. not on approved leave or comp-off)
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

    // Fetch existing cell state for audit log
    const existing = await sql`
      SELECT * FROM roster_days
      WHERE roster_month_id = ${monthId} AND employee_id = ${employeeId} AND date = ${date}
      LIMIT 1;
    `;
    const beforeState = existing[0] || null;

    // Perform the update
    const rdId = `rd-${monthId}-${employeeId}-${date}-${brandProcessId || "manual"}`;
    await sql`
      INSERT INTO roster_days (
        id, roster_month_id, employee_id, date, status, brand_process_id, pinned, notes, created_at, updated_at
      )
      VALUES (
        ${rdId}, ${monthId}, ${employeeId}, ${date}, ${status as any}, ${brandProcessId || null}, true, ${overrideReason || "Manual edit"}, now(), now()
      )
      ON CONFLICT (roster_month_id, employee_id, date, brand_process_id)
      DO UPDATE SET status = EXCLUDED.status, pinned = true, notes = EXCLUDED.notes, updated_at = now();
    `;

    // Audit log
    await sql`
      INSERT INTO audit_log (id, actor_user_id, action, entity, entity_id, before, after, created_at, updated_at)
      VALUES (
        ${`audit-${Date.now()}`},
        ${user?.id || null},
        'MANUAL_ROSTER_EDIT',
        'roster_days',
        ${rdId},
        ${JSON.stringify(beforeState)},
        ${JSON.stringify({ employeeId, date, status, brandProcessId, overrideReason })},
        now(),
        now()
      );
    `;

    return NextResponse.json({
      success: true,
      message: "Cell updated successfully and pinned",
      updated: { employeeId, date, status, brandProcessId, pinned: true },
    });
  } catch (error: any) {
    console.error("Cell update error:", error);
    return NextResponse.json({ error: error.message || "Failed to update cell" }, { status: 500 });
  }
}

