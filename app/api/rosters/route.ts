import { NextResponse } from "next/server";
import { neon } from "@neondatabase/serverless";
import { requireAuth } from "@/lib/auth-helpers";
import "@/lib/db/dns-patch";

export const dynamic = "force-dynamic";

export async function GET() {
  const { errorResponse } = await requireAuth(["manager"]);
  if (errorResponse) return errorResponse;

  try {
    const sql = neon(process.env.DATABASE_URL!);
    const months = await sql`
      SELECT
        rm.month,
        rm.status,
        rm.generated_at,
        rm.published_at,
        COUNT(DISTINCT rd.id)::int AS shift_count,
        COUNT(DISTINCT c.id)::int AS conflict_count,
        COUNT(DISTINCT c.id) FILTER (WHERE c.severity = 'blocking')::int AS blocking_conflict_count
      FROM roster_months rm
      LEFT JOIN roster_days rd ON rd.roster_month_id = rm.id
      LEFT JOIN conflicts c ON c.roster_month_id = rm.id
      GROUP BY rm.id
      ORDER BY rm.month DESC;
    `;
    return NextResponse.json({ months });
  } catch (error) {
    console.error("Fetch monthly rosters error:", error);
    return NextResponse.json({ error: "Failed to fetch monthly rosters" }, { status: 500 });
  }
}
