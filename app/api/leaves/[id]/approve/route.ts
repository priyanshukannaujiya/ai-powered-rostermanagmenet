import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth-helpers";
import { approveLeaveAndReplan } from "@/lib/scheduler/approve-leave";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const { user, errorResponse } = await requireAuth(["manager", "pod_lead"]);
  if (errorResponse) return errorResponse;

  const leaveId = params.id;

  try {
    const body = await req.json().catch(() => ({}));
    const previewOnly = body.previewOnly === true;

    const result = await approveLeaveAndReplan({
      leaveId,
      reviewerUserId: user!.id,
      reviewerRole: user!.role,
      reviewerEmployeeId: user!.employeeId,
      previewOnly,
    });

    if (!result.success) {
      return NextResponse.json({ error: result.error || "Failed to approve leave" }, { status: result.status || 400 });
    }

    return NextResponse.json(result);
  } catch (error: any) {
    console.error("Approve leave error:", error);
    return NextResponse.json({ error: error.message || "Failed to approve leave" }, { status: 500 });
  }
}
