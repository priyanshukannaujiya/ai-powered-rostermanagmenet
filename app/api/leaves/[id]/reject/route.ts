import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth-helpers";
import { neon } from "@neondatabase/serverless";
import "@/lib/db/dns-patch";
import { formatDateOnly } from "@/lib/date-utils";
import { randomUUID } from "crypto";

export const dynamic = "force-dynamic";

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const { user, errorResponse } = await requireAuth(["manager", "pod_lead"]);
  if (errorResponse) return errorResponse;

  const leaveId = params.id;
  const sql = neon(process.env.DATABASE_URL!);

  try {
    const leave = await sql`
      SELECT l.*, e.name as employee_name, e.pod_id
      FROM leaves l
      JOIN employees e ON e.id = l.employee_id
      WHERE l.id = ${leaveId}
      LIMIT 1;
    `;
    if (!leave || leave.length === 0) {
      return NextResponse.json({ error: "Leave request not found" }, { status: 404 });
    }
    if (leave[0].status !== "pending") {
      return NextResponse.json({ error: `This leave request is already ${leave[0].status}.` }, { status: 409 });
    }
    if (user!.role === "pod_lead") {
      const podRows = await sql`SELECT lead_employee_id FROM pods WHERE id = ${leave[0].pod_id} LIMIT 1;`;
      if (!podRows.length || podRows[0].lead_employee_id !== user!.employeeId) {
        return NextResponse.json({ error: "Pod leads can only reject leave requests for employees in their assigned pod." }, { status: 403 });
      }
    }

    const auditId = `audit-${randomUUID()}`;
    const notifId = `notif-${randomUUID()}`;
    const startDate = formatDateOnly(leave[0].start_date);
    const endDate = formatDateOnly(leave[0].end_date);
    const notifMessage = `Your leave request for ${startDate} to ${endDate} was not approved.`;
    const notifMeta = JSON.stringify({ leaveId, status: "rejected" });

    // Status, audit, and notification share one transaction. Dependent writes
    // only occur if this request successfully claims the pending leave.
    const txResults = await sql.transaction((tx) => [
      tx`
        UPDATE leaves
        SET status = 'rejected', reviewed_by = ${user!.id}, reviewed_at = transaction_timestamp(), updated_at = now()
        WHERE id = ${leaveId}
          AND status = 'pending'
          AND (
            ${user!.role} = 'manager'
            OR EXISTS (
              SELECT 1 FROM pods p
              WHERE p.id = ${leave[0].pod_id} AND p.lead_employee_id = ${user!.employeeId}
            )
          )
        RETURNING id;
      `,
      tx`
        INSERT INTO audit_log (id, actor_user_id, action, entity, entity_id, after, created_at, updated_at)
        SELECT ${auditId}, ${user!.id}, 'LEAVE_REJECTED', 'leaves', ${leaveId}, ${notifMeta}::jsonb, now(), now()
        WHERE EXISTS (SELECT 1 FROM leaves WHERE id = ${leaveId} AND status = 'rejected' AND reviewed_by = ${user!.id} AND reviewed_at = transaction_timestamp());
      `,
      tx`
        INSERT INTO notifications (id, employee_id, title, message, type, date, metadata, read, created_at, updated_at)
        SELECT ${notifId}, ${leave[0].employee_id}, 'Leave request rejected', ${notifMessage}, 'leave_rejected', ${startDate}, ${notifMeta}::jsonb, false, now(), now()
        WHERE EXISTS (SELECT 1 FROM leaves WHERE id = ${leaveId} AND status = 'rejected' AND reviewed_by = ${user!.id} AND reviewed_at = ${reviewedAt}::timestamptz);
      `,
    ]);

    if (!txResults[0] || txResults[0].length === 0) {
      return NextResponse.json(
        { error: "This leave request was already reviewed or is no longer within your assigned pod." },
        { status: 409 }
      );
    }
    return NextResponse.json({ success: true, message: "Leave rejected successfully" });
  } catch (error: any) {
    console.error("Reject leave error:", error);
    return NextResponse.json({ error: error.message || "Failed to reject leave" }, { status: 500 });
  }
}
