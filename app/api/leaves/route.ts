import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth-helpers";
import { neon } from "@neondatabase/serverless";
import "@/lib/db/dns-patch";
import { z } from "zod";
import { formatDateOnly } from "@/lib/date-utils";

export const dynamic = "force-dynamic";

const createLeaveSchema = z.object({
  employeeId: z.string().optional(),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  type: z.enum(["planned", "sick", "other"]),
  reason: z.string().optional(),
});

// GET /api/leaves - List leaves with role scoping
export async function GET(req: NextRequest) {
  const { user, errorResponse } = await requireAuth();
  if (errorResponse) return errorResponse;

  const sql = neon(process.env.DATABASE_URL!);
  const { searchParams } = new URL(req.url);
  const statusFilter = searchParams.get("status");

  try {
    let leavesList: any[] = [];

    if (user!.role === "employee") {
      // Employees only see their own leaves
      leavesList = await sql`
        SELECT l.*, e.name as employee_name, e.email as employee_email
        FROM leaves l
        JOIN employees e ON l.employee_id = e.id
        WHERE l.employee_id = ${user!.employeeId}
        ORDER BY l.start_date DESC;
      `;
    } else if (user!.role === "pod_lead") {
      // Pod leads see leaves for their pod
      leavesList = await sql`
        SELECT l.*, e.name as employee_name, e.email as employee_email, p.name as pod_name
        FROM leaves l
        JOIN employees e ON l.employee_id = e.id
        LEFT JOIN pods p ON e.pod_id = p.id
        WHERE p.lead_employee_id = ${user!.employeeId} OR e.id = ${user!.employeeId}
        ORDER BY l.status = 'pending' DESC, l.start_date DESC;
      `;
    } else {
      // Managers see all leaves
      leavesList = await sql`
        SELECT l.*, e.name as employee_name, e.email as employee_email, p.name as pod_name
        FROM leaves l
        JOIN employees e ON l.employee_id = e.id
        LEFT JOIN pods p ON e.pod_id = p.id
        ORDER BY l.status = 'pending' DESC, l.start_date DESC;
      `;
    }

    const formattedLeaves = leavesList.map((l: any) => ({
      ...l,
      start_date: formatDateOnly(l.start_date),
      end_date: formatDateOnly(l.end_date),
    }));

    return NextResponse.json({ leaves: formattedLeaves });
  } catch (error: any) {
    console.error("Fetch leaves error:", error);
    return NextResponse.json({ error: error.message || "Failed to load leaves" }, { status: 500 });
  }
}

// POST /api/leaves - Submit a new leave request (creates pending leave)
export async function POST(req: NextRequest) {
  const { user, errorResponse } = await requireAuth();
  if (errorResponse) return errorResponse;

  const sql = neon(process.env.DATABASE_URL!);

  try {
    const body = await req.json();
    const parsed = createLeaveSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Validation failed", details: parsed.error.format() }, { status: 400 });
    }

    const { startDate, endDate, type, reason } = parsed.data;

    // Role-based target employee determination
    let targetEmployeeId = user!.employeeId;
    if (user!.role === "manager" && parsed.data.employeeId) {
      targetEmployeeId = parsed.data.employeeId;
    }

    if (!targetEmployeeId) {
      return NextResponse.json({ error: "No associated employee account found" }, { status: 400 });
    }

    const leaveId = `leave-${Date.now()}`;
    await sql`
      INSERT INTO leaves (id, employee_id, start_date, end_date, type, reason, status, created_at, updated_at)
      VALUES (${leaveId}, ${targetEmployeeId}, ${startDate}, ${endDate}, ${type}, ${reason || null}, 'pending', now(), now());
    `;

    return NextResponse.json({
      success: true,
      leaveId,
      message: "Leave request submitted successfully. Pending review.",
    });
  } catch (error: any) {
    console.error("Create leave error:", error);
    return NextResponse.json({ error: error.message || "Failed to submit leave" }, { status: 500 });
  }
}

