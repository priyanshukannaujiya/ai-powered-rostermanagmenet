import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { requireAuth } from "@/lib/auth-helpers";
import { neon } from "@neondatabase/serverless";
import "@/lib/db/dns-patch";
import { z } from "zod";
import { formatDateOnly } from "@/lib/date-utils";
import { createEmployeeNotification } from "@/lib/notifications/create";

export const dynamic = "force-dynamic";

function isValidDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

const createLeaveSchema = z.object({
  employeeId: z.string().optional(),
  startDate: z.string().refine(isValidDate, "Start date must be a valid YYYY-MM-DD date."),
  endDate: z.string().refine(isValidDate, "End date must be a valid YYYY-MM-DD date."),
  type: z.enum(["planned", "sick", "other"]),
  reason: z.string().optional(),
}).refine((value) => value.startDate <= value.endDate, {
  message: "End date cannot be before start date.",
  path: ["endDate"],
});

const LEAVE_STATUSES = ["pending", "approved", "rejected"] as const;

// GET /api/leaves - List leaves with role scoping
export async function GET(req: NextRequest) {
  const { user, errorResponse } = await requireAuth();
  if (errorResponse) return errorResponse;

  const sql = neon(process.env.DATABASE_URL!);
  const { searchParams } = new URL(req.url);
  const statusFilter = searchParams.get("status");

  if (statusFilter && !LEAVE_STATUSES.includes(statusFilter as (typeof LEAVE_STATUSES)[number])) {
    return NextResponse.json({ error: "Invalid status filter." }, { status: 400 });
  }

  try {
    let leavesList: any[] = [];

    if (user!.role === "employee") {
      leavesList = await sql`
        SELECT l.*, e.name as employee_name, e.email as employee_email
        FROM leaves l
        JOIN employees e ON l.employee_id = e.id
        WHERE l.employee_id = ${user!.employeeId}
          AND (${statusFilter}::text IS NULL OR l.status = ${statusFilter})
        ORDER BY l.start_date DESC;
      `;
    } else if (user!.role === "pod_lead") {
      leavesList = await sql`
        SELECT l.*, e.name as employee_name, e.email as employee_email, p.name as pod_name
        FROM leaves l
        JOIN employees e ON l.employee_id = e.id
        LEFT JOIN pods p ON e.pod_id = p.id
        WHERE (p.lead_employee_id = ${user!.employeeId} OR e.id = ${user!.employeeId})
          AND (${statusFilter}::text IS NULL OR l.status = ${statusFilter})
        ORDER BY l.status = 'pending' DESC, l.start_date DESC;
      `;
    } else {
      leavesList = await sql`
        SELECT l.*, e.name as employee_name, e.email as employee_email, p.name as pod_name
        FROM leaves l
        JOIN employees e ON l.employee_id = e.id
        LEFT JOIN pods p ON e.pod_id = p.id
        WHERE (${statusFilter}::text IS NULL OR l.status = ${statusFilter})
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
    return NextResponse.json({ error: "Failed to load leaves" }, { status: 500 });
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

    let targetEmployeeId = user!.employeeId;
    if (user!.role === "manager" && parsed.data.employeeId) {
      targetEmployeeId = parsed.data.employeeId;
    }

    if (!targetEmployeeId && user!.email) {
      const normalizedEmail = user!.email.trim().toLowerCase();
      const matched = await sql`
        SELECT e.id
        FROM employees e
        WHERE LOWER(TRIM(e.email)) = ${normalizedEmail}
          AND e.active = true
          AND NOT EXISTS (
            SELECT 1 FROM users u2 WHERE u2.employee_id = e.id AND u2.id != ${user!.id}
          )
        LIMIT 2;
      `;
      if (matched.length === 1) {
        targetEmployeeId = matched[0].id;
        await sql`
          UPDATE users SET employee_id = ${targetEmployeeId}, updated_at = now() WHERE id = ${user!.id};
        `;
      }
    }

    if (!targetEmployeeId) {
      return NextResponse.json({ error: "No associated employee account found" }, { status: 400 });
    }
    const employeeRows = await sql`
      SELECT id, name FROM employees WHERE id = ${targetEmployeeId} AND active = true LIMIT 1;
    `;
    if (!employeeRows.length) {
      return NextResponse.json({ error: "The selected employee is not active or does not exist." }, { status: 404 });
    }

    // Prevent overlapping pending or approved requests for the same employee.
    // A database exclusion constraint/transactional lock is still needed to close
    // the race between this check and a simultaneous request.
    const overlappingLeaves = await sql`
      SELECT id, start_date, end_date, status
      FROM leaves
      WHERE employee_id = ${targetEmployeeId}
        AND status IN ('pending', 'approved')
        AND start_date <= ${endDate}
        AND end_date >= ${startDate}
      LIMIT 1;
    `;
    if (overlappingLeaves.length) {
      return NextResponse.json({
        error: "LEAVE_DATE_OVERLAP",
        message: "This employee already has a pending or approved leave request that overlaps the selected dates.",
        conflictingLeave: {
          id: overlappingLeaves[0].id,
          startDate: formatDateOnly(overlappingLeaves[0].start_date),
          endDate: formatDateOnly(overlappingLeaves[0].end_date),
          status: overlappingLeaves[0].status,
        },
      }, { status: 409 });
    }

    const leaveId = `leave-${randomUUID()}`;
    await sql`
      INSERT INTO leaves (id, employee_id, start_date, end_date, type, reason, status, created_at, updated_at)
      VALUES (${leaveId}, ${targetEmployeeId}, ${startDate}, ${endDate}, ${type}, ${reason || null}, 'pending', now(), now());
    `;

    let notificationWarning: string | undefined;
    try {
      await createEmployeeNotification(sql, {
        employeeId: targetEmployeeId,
        title: "Leave request submitted",
        message: `Your ${type} leave request for ${startDate} to ${endDate} is awaiting review.`,
        type: "leave_request_submitted",
        date: startDate,
        metadata: { leaveId, status: "pending" },
        eventId: `leave-submitted:${leaveId}`,
        notifyPodLead: true,
      });
    } catch (notificationError) {
      console.error("Leave request saved but notification delivery failed:", notificationError);
      notificationWarning = "The leave request was saved, but its notification could not be delivered.";
    }

    return NextResponse.json({
      success: true,
      leaveId,
      message: "Leave request submitted successfully. Pending review.",
      notificationWarning,
    });
  } catch (error: any) {
    console.error("Create leave error:", error);
    return NextResponse.json({ error: "Failed to submit leave" }, { status: 500 });
  }
}
