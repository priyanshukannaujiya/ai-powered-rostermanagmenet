import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth-helpers";
import { neon } from "@neondatabase/serverless";
import "@/lib/db/dns-patch";

export const dynamic = "force-dynamic";

/**
 * Notification visibility is strictly scoped by the authenticated session:
 *  - employee : ONLY rows where employee_id === session.employeeId
 *  - pod_lead : own rows + rows of employees in a pod they lead
 *  - manager  : full visibility (optionally narrowed by ?employeeId=)
 *
 * A client-supplied ?employeeId= can never widen an employee's or pod lead's
 * scope, which removes the IDOR path where employee A reads employee B's alerts.
 */
export async function GET(req: NextRequest) {
  const { user, errorResponse } = await requireAuth();
  if (errorResponse) return errorResponse;

  const sql = neon(process.env.DATABASE_URL!);
  const { searchParams } = new URL(req.url);
  const requestedEmployeeId = searchParams.get("employeeId");
  const role = user!.role;
  const sessionEmployeeId = user!.employeeId || null;

  try {
    let rows: any[] = [];

    if (role === "manager") {
      if (requestedEmployeeId) {
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
    } else if (role === "pod_lead") {
      if (!sessionEmployeeId) {
        return NextResponse.json({ success: true, notifications: [], scope: "pod_lead" });
      }
      rows = await sql`
        SELECT n.*, e.name as employee_name
        FROM notifications n
        JOIN employees e ON n.employee_id = e.id
        WHERE n.employee_id = ${sessionEmployeeId}
          OR e.pod_id IN (SELECT id FROM pods WHERE lead_employee_id = ${sessionEmployeeId})
        ORDER BY n.created_at DESC
        LIMIT 50;
      `;
    } else {
      // Hard isolation for employee (and any unrecognized role):
      // Any client-supplied employeeId is deliberately ignored; queries only own sessionEmployeeId.
      if (!sessionEmployeeId) {
        return NextResponse.json({ success: true, notifications: [], scope: "employee" });
      }
      rows = await sql`
        SELECT n.*, e.name as employee_name
        FROM notifications n
        JOIN employees e ON n.employee_id = e.id
        WHERE n.employee_id = ${sessionEmployeeId}
        ORDER BY n.created_at DESC
        LIMIT 50;
      `;
    }

    return NextResponse.json({ success: true, notifications: rows, scope: role });
  } catch (error: any) {
    console.error("Fetch notifications error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const { user, errorResponse } = await requireAuth();
  if (errorResponse) return errorResponse;

  const sql = neon(process.env.DATABASE_URL!);
  const role = user!.role;
  const sessionEmployeeId = user!.employeeId || null;

  try {
    const body = await req.json();

    if (body.action === "mark_read" && body.notificationId) {
      if (role === "manager") {
        await sql`
          UPDATE notifications SET read = true, updated_at = now()
          WHERE id = ${body.notificationId};
        `;
      } else if (role === "pod_lead") {
        await sql`
          UPDATE notifications n SET read = true, updated_at = now()
          FROM employees e
          WHERE n.id = ${body.notificationId} AND n.employee_id = e.id
            AND (n.employee_id = ${sessionEmployeeId}
              OR e.pod_id IN (SELECT id FROM pods WHERE lead_employee_id = ${sessionEmployeeId}));
        `;
      } else {
        // An employee may only acknowledge their OWN notification; a foreign id
        // simply matches zero rows and changes nothing.
        await sql`
          UPDATE notifications SET read = true, updated_at = now()
          WHERE id = ${body.notificationId} AND employee_id = ${sessionEmployeeId};
        `;
      }
      return NextResponse.json({ success: true });
    }

    if (body.action === "mark_all_read") {
      if (role === "manager") {
        await sql`UPDATE notifications SET read = true, updated_at = now() WHERE read = false;`;
      } else if (role === "pod_lead") {
        await sql`
          UPDATE notifications n SET read = true, updated_at = now()
          FROM employees e
          WHERE n.employee_id = e.id AND n.read = false
            AND (n.employee_id = ${sessionEmployeeId}
              OR e.pod_id IN (SELECT id FROM pods WHERE lead_employee_id = ${sessionEmployeeId}));
        `;
      } else if (sessionEmployeeId) {
        await sql`
          UPDATE notifications SET read = true, updated_at = now()
          WHERE employee_id = ${sessionEmployeeId} AND read = false;
        `;
      }
      return NextResponse.json({ success: true });
    }

    return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
