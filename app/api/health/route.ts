import { NextResponse } from "next/server";
import { neon } from "@neondatabase/serverless";
import "@/lib/db/dns-patch";

export const dynamic = "force-dynamic";

export async function GET() {
  const startTime = Date.now();
  try {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) {
      console.error("Health check failed: DATABASE_URL is not configured.");
      return NextResponse.json({ status: "unhealthy" }, { status: 503 });
    }
    const sql = neon(connectionString);
    await sql`SELECT 1 as healthy;`;
    return NextResponse.json({
      status: "healthy",
      database: "connected",
      latencyMs: Date.now() - startTime,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Health check database failure:", error);
    return NextResponse.json({ status: "unhealthy" }, { status: 503 });
  }
}
