import { NextResponse } from "next/server";
import { neon } from "@neondatabase/serverless";

export const dynamic = "force-dynamic";

export async function GET() {
  const startTime = Date.now();
  try {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) {
      return NextResponse.json(
        { status: "error", message: "DATABASE_URL is not configured" },
        { status: 500 }
      );
    }

    const sql = neon(connectionString);
    const result = await sql`SELECT 1 as healthy;`;

    const latency = Date.now() - startTime;
    return NextResponse.json({
      status: "healthy",
      database: "connected",
      latencyMs: latency,
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    return NextResponse.json(
      {
        status: "unhealthy",
        database: "disconnected",
        error: error.message || "Failed to query database",
      },
      { status: 500 }
    );
  }
}

