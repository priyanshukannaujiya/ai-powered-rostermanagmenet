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
  const requestedEmployeeId = searchParams.get("employeeId");

  try {
    let rows: any[] = [];
    if (user!.role === "employee") {
      rows = await sql`
        SELECT n.*, e.name as employee_name
        FROM notifications n
        JOIN employees e ON n.employee_id = e.id
        WHERE n.employee_id = ${user!.employeeId}
        ORDER BY n.created_at DESC
        LIMIT 20;
      `;
    } else if (user!.role === "pod_lead") {
      rows = await sql`
        SELECT n.*, e.name as employee_name
        FROM notifications n
        JOIN employees e ON n.employee_id = e.id
        WHERE n.employee_id = ${user!.employeeId}
          OR e.pod_id IN (SELECT id FROM pods WHERE lead_employee_id = ${user!.employeeId})
        ORDER BY n.created_at DESC
        LIMIT 50;
      `;
    } else if (requestedEmployeeId) {
      rows = await sql`
        SELECT n.*, e.name as employee_name
        FROM notifications n
        JOIN employees e ON n.employee_id = e.id
        WHERE n.employee_id = ${requestedEmployeeId}
        ORDER BY n.created_at DESC
        LIMIT 50;
      `;
    } else {
      rows = await sql`
        SELECT n.*, e.name as employee_name
        FROM notifications n
        JOIN employees e ON n.employee_id = e.id
        ORDER BY n.created_at DESC
        LIMIT 50;
      `;
    }

    return NextResponse.json({ success: true, notifications: rows });
  } catch (error: any) {
    console.error("Fetch notifications error:", error);
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
      if (user!.role === "manager") {
        await sql`
          UPDATE notifications SET read = true, updated_at = now()
          WHERE id = ${body.notificationId};
        `;
      } else if (user!.role === "pod_lead") {
        await sql`
          UPDATE notifications n SET read = true, updated_at = now()
          FROM employees e
          WHERE n.id = ${body.notificationId} AND n.employee_id = e.id
            AND (n.employee_id = ${user!.employeeId}
              OR e.pod_id IN (SELECT id FROM pods WHERE lead_employee_id = ${user!.employeeId}));
        `;
      } else {
        await sql`
          UPDATE notifications SET read = true, updated_at = now()
          WHERE id = ${body.notificationId} AND employee_id = ${user!.employeeId};
        `;
      }
      return NextResponse.json({ success: true });
    }

    if (body.action === "mark_all_read") {
      if (user!.role === "manager") {
        await sql`UPDATE notifications SET read = true, updated_at = now() WHERE read = false;`;
      } else if (user!.role === "pod_lead") {
        await sql`
          UPDATE notifications n SET read = true, updated_at = now()
          FROM employees e
          WHERE n.employee_id = e.id AND n.read = false
            AND (n.employee_id = ${user!.employeeId}
              OR e.pod_id IN (SELECT id FROM pods WHERE lead_employee_id = ${user!.employeeId}));
        `;
      } else if (user!.employeeId) {
        await sql`
          UPDATE notifications SET read = true, updated_at = now()
          WHERE employee_id = ${user!.employeeId} AND read = false;
        `;
      }
      return NextResponse.json({ success: true });
    }

    return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
