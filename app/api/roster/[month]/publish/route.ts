import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth-helpers";
import { neon } from "@neondatabase/serverless";
import "@/lib/db/dns-patch";

export const dynamic = "force-dynamic";

export async function POST(
  req: NextRequest,
  { params }: { params: { month: string } }
) {
  const { user, errorResponse } = await requireAuth(["manager"]);
  if (errorResponse) return errorResponse;

  const month = params.month;
  const sql = neon(process.env.DATABASE_URL!);

  try {
    const monthId = `roster-${month}`;
    const monthRecord = await sql`SELECT * FROM roster_months WHERE id = ${monthId} LIMIT 1;`;
    if (!monthRecord || monthRecord.length === 0) {
      return NextResponse.json({ error: "Roster month not found" }, { status: 404 });
    }

    // Check for unresolved blocking conflicts
    const blockingConflicts = await sql`
      SELECT * FROM conflicts
      WHERE roster_month_id = ${monthId} AND severity = 'blocking' AND resolved = false;
    `;

    if (blockingConflicts.length > 0) {
      return NextResponse.json(
        {
          error: "PUBLISH_BLOCKED",
          message: `Cannot publish roster: there are ${blockingConflicts.length} unresolved blocking conflict(s). Resolve all blocking conflicts or provide overrides first.`,
          conflicts: blockingConflicts,
        },
        { status: 422 }
      );
    }

    // Publish and pin all days
    await sql`
      UPDATE roster_months
      SET status = 'published', published_at = now(), updated_at = now()
      WHERE id = ${monthId};
    `;

    await sql`
      UPDATE roster_days
      SET pinned = true, updated_at = now()
      WHERE roster_month_id = ${monthId};
    `;

    // Audit log
    await sql`
      INSERT INTO audit_log (id, actor_user_id, action, entity, entity_id, before, after, created_at, updated_at)
      VALUES (
        ${`audit-${Date.now()}`},
        ${user?.id || null},
        'ROSTER_PUBLISHED',
        'roster_months',
        ${monthId},
        ${JSON.stringify({ status: monthRecord[0].status })},
        ${JSON.stringify({ status: "published", publishedAt: new Date().toISOString() })},
        now(),
        now()
      );
    `;

    return NextResponse.json({
      success: true,
      message: `Roster for ${month} published successfully and all shifts pinned.`,
      status: "published",
    });
  } catch (error: any) {
    console.error("Publish error:", error);
    return NextResponse.json({ error: error.message || "Failed to publish roster" }, { status: 500 });
  }
}

