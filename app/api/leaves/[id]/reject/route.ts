import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth-helpers";
import { neon } from "@neondatabase/serverless";
import "@/lib/db/dns-patch";

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
    const leave = await sql`SELECT * FROM leaves WHERE id = ${leaveId} LIMIT 1;`;
    if (!leave || leave.length === 0) {
      return NextResponse.json({ error: "Leave request not found" }, { status: 404 });
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

    return NextResponse.json({ success: true, message: "Leave rejected successfully" });
  } catch (error: any) {
    console.error("Reject leave error:", error);
    return NextResponse.json({ error: error.message || "Failed to reject leave" }, { status: 500 });
  }
}
