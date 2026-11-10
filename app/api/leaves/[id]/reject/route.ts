import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth-helpers";
import { neon } from "@neondatabase/serverless";
import "@/lib/db/dns-patch";
import { createEmployeeNotification } from "@/lib/notifications/create";
import { formatDateOnly } from "@/lib/date-utils";

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

    await sql`
      UPDATE leaves
      SET status = 'rejected', reviewed_by = ${user!.id}, reviewed_at = now(), updated_at = now()
      WHERE id = ${leaveId};
    `;

    await sql`
      INSERT INTO audit_log (id, actor_user_id, action, entity, entity_id, after, created_at, updated_at)
      VALUES (
        ${`audit-${Date.now()}`},
        ${user!.id},
        'LEAVE_REJECTED',
        'leaves',
        ${leaveId},
        ${JSON.stringify({ status: "rejected" })},
        now(),
        now()
      );
    `;

    let notificationWarning: string | undefined;
    try {
      await createEmployeeNotification(sql, {
        employeeId: leave[0].employee_id,
        title: "Leave request rejected",
        message: `Your leave request for ${formatDateOnly(leave[0].start_date)} to ${formatDateOnly(leave[0].end_date)} was not approved.`,
        type: "leave_rejected",
        date: formatDateOnly(leave[0].start_date),
        metadata: { leaveId, status: "rejected" },
        notifyPodLead: true,
      });
    } catch (notificationError) {
      console.error("Leave rejected but notification delivery failed:", notificationError);
      notificationWarning = "The leave was rejected, but its notification could not be delivered.";
    }

    return NextResponse.json({ success: true, message: "Leave rejected successfully", notificationWarning });
  } catch (error: any) {
    console.error("Reject leave error:", error);
    return NextResponse.json({ error: error.message || "Failed to reject leave" }, { status: 500 });
  }
}
