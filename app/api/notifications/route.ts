import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth-helpers";
import { neon } from "@neondatabase/serverless";
import "@/lib/db/dns-patch";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const { user, errorResponse } = await requireAuth();
  if (errorResponse) return errorResponse;

  const sql = neon(process.env.DATABASE_URL!);
  const { searchParams } = new URL(req.url);
  const targetEmployeeId = searchParams.get("employeeId") || user!.employeeId;

  try {
    let rows: any[] = [];
    if (user!.role === "employee" || targetEmployeeId) {
      rows = await sql`
        SELECT n.*, e.name as employee_name
        FROM notifications n
        JOIN employees e ON n.employee_id = e.id
        WHERE n.employee_id = ${targetEmployeeId || user!.employeeId}
        ORDER BY n.created_at DESC
        LIMIT 20;
      `;
    } else {
      rows = await sql`
        SELECT n.*, e.name as employee_name
        FROM notifications n
        JOIN employees e ON n.employee_id = e.id
        ORDER BY n.created_at DESC
        LIMIT 30;
      `;
    }

    return NextResponse.json({ success: true, notifications: rows });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const { user, errorResponse } = await requireAuth();
  if (errorResponse) return errorResponse;

  const sql = neon(process.env.DATABASE_URL!);

  try {
    const body = await req.json();
    if (body.action === "mark_read" && body.notificationId) {
      await sql`
        UPDATE notifications
        SET read = true, updated_at = now()
        WHERE id = ${body.notificationId};
      `;
      return NextResponse.json({ success: true });
    }

    if (body.action === "mark_all_read" && user!.employeeId) {
      await sql`
        UPDATE notifications
        SET read = true, updated_at = now()
        WHERE employee_id = ${user!.employeeId};
      `;
      return NextResponse.json({ success: true });
    }

    return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

