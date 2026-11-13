import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth-helpers";
import { beginTransaction, TransactionalSql } from "@/lib/db/transaction";
import "@/lib/db/dns-patch";

export const dynamic = "force-dynamic";

export async function POST(
  req: NextRequest,
  { params }: { params: { month: string } }
) {
  const { user, errorResponse } = await requireAuth(["manager"]);
  if (errorResponse) return errorResponse;

  const month = params.month;
  let transaction: TransactionalSql | undefined;

  try {
    transaction = await beginTransaction(process.env.DATABASE_URL!);
    const monthId = `roster-${month}`;
    const monthRecord = await transaction`SELECT * FROM roster_months WHERE id = ${monthId} FOR UPDATE;`;
    if (!monthRecord || monthRecord.length === 0) {
      await transaction.rollback();
      return NextResponse.json({ error: "Roster month not found" }, { status: 404 });
    }

    // Check for unresolved blocking conflicts
    const blockingConflicts = await transaction`
      SELECT * FROM conflicts
      WHERE roster_month_id = ${monthId} AND severity = 'blocking' AND resolved = false;
    `;

    if (blockingConflicts.length > 0) {
      await transaction.rollback();
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
    await transaction`
      UPDATE roster_months
      SET status = 'published', published_at = now(), updated_at = now()
      WHERE id = ${monthId};
    `;

    await transaction`
      UPDATE roster_days
      SET pinned = true, updated_at = now()
      WHERE roster_month_id = ${monthId};
    `;

    // Audit log
    await transaction`
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

    await transaction.commit();

    return NextResponse.json({
      success: true,
      message: `Roster for ${month} published successfully and all shifts pinned.`,
      status: "published",
    });
  } catch (error: any) {
    if (transaction) {
      try {
        await transaction.rollback();
      } catch (rollbackError) {
        console.error("Roster publish rollback failed:", rollbackError);
      }
    }
    console.error("Publish error:", error);
    return NextResponse.json({ error: "Failed to publish roster." }, { status: 500 });
  } finally {
    if (transaction) await transaction.close();
  }
}

