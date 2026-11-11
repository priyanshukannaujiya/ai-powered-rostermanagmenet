import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth-helpers";
import { neon } from "@neondatabase/serverless";
import "@/lib/db/dns-patch";
import { formatDateOnly } from "@/lib/date-utils";
import { getMonthBounds } from "@/lib/scheduler/leave-days";
import { isValidRosterMonth } from "@/lib/import/month";
import {
  buildEmployeeSchedule,
  type LeaveRow,
  type RosterDayRow,
} from "@/lib/me/build-schedule";

export const dynamic = "force-dynamic";

/**
 * GET /api/me/schedule?month=YYYY-MM
 *
 * Deterministic, session-scoped schedule for the signed-in employee.
 * No LLM call, no natural-language parsing: roster days, approved/pending
 * leaves, weekly offs and holidays are read directly and merged into a
 * gap-free calendar for the requested month.
 */
export async function GET(req: NextRequest) {
  const { user, errorResponse } = await requireAuth(["employee", "pod_lead", "manager"]);
  if (errorResponse) return errorResponse;

  if (!user!.employeeId) {
    return NextResponse.json(
      { error: "No employee record is linked to this account." },
      { status: 400 }
    );
  }

  const { searchParams } = new URL(req.url);
  const month = searchParams.get("month") || new Date().toISOString().slice(0, 7);
  if (!isValidRosterMonth(month)) {
    return NextResponse.json(
      { error: "month must use valid YYYY-MM format." },
      { status: 400 }
    );
  }

  const employeeId = user!.employeeId;
  const sql = neon(process.env.DATABASE_URL!);
  const bounds = getMonthBounds(month);

  try {
    const [employeeRows, monthRows] = await Promise.all([
      sql`
        SELECT e.id, e.name, e.email, p.name as pod_name
        FROM employees e
        LEFT JOIN pods p ON e.pod_id = p.id
        WHERE e.id = ${employeeId}
        LIMIT 1;
      `,
      sql`SELECT id, status FROM roster_months WHERE month = ${month} LIMIT 1;`,
    ]);

    if (!employeeRows.length) {
      return NextResponse.json({ error: "Employee record not found." }, { status: 404 });
    }

    const monthId = monthRows[0]?.id || `roster-${month}`;

    const [rosterRaw, leavesRaw, weeklyOffRaw, holidaysRaw] = await Promise.all([
      sql`
        SELECT
          rd.date,
          rd.status,
          rd.notes,
          rd.pinned,
          rd.brand_process_id,
          b.name AS brand_name,
          b.code AS brand_code,
          p.code AS process_code
        FROM roster_days rd
        LEFT JOIN brand_processes bp ON rd.brand_process_id = bp.id
        LEFT JOIN brands b ON bp.brand_id = b.id
        LEFT JOIN processes p ON bp.process_id = p.id
        WHERE rd.roster_month_id = ${monthId} AND rd.employee_id = ${employeeId}
        ORDER BY rd.date ASC;
      `,
      sql`
        SELECT start_date, end_date, type, status
        FROM leaves
        WHERE employee_id = ${employeeId}
          AND end_date >= ${bounds.start}
          AND start_date <= ${bounds.end};
      `,
      sql`
        SELECT weekday
        FROM weekly_offs
        WHERE employee_id = ${employeeId}
          AND effective_from <= ${bounds.end}
          AND (effective_to IS NULL OR effective_to >= ${bounds.start});
      `,
      sql`
        SELECT date, name FROM holidays
        WHERE date >= ${bounds.start} AND date <= ${bounds.end};
      `,
    ]);

    const rosterDays: RosterDayRow[] = rosterRaw.map((row: any) => ({
      date: formatDateOnly(row.date),
      status: row.status,
      brandProcessId: row.brand_process_id || null,
      brandName: row.brand_name || null,
      brandCode: row.brand_code || null,
      processCode: row.process_code || null,
      notes: row.notes || null,
      pinned: Boolean(row.pinned),
    }));

    const leaves: LeaveRow[] = leavesRaw.map((row: any) => ({
      startDate: formatDateOnly(row.start_date),
      endDate: formatDateOnly(row.end_date),
      type: row.type,
      status: row.status,
    }));

    const { days, summary } = buildEmployeeSchedule({
      month,
      rosterDays,
      leaves,
      weeklyOffWeekdays: weeklyOffRaw.map((row: any) => Number(row.weekday)),
      holidays: holidaysRaw.map((row: any) => ({
        date: formatDateOnly(row.date),
        name: row.name,
      })),
    });

    return NextResponse.json({
      success: true,
      month,
      employee: {
        id: employeeRows[0].id,
        name: employeeRows[0].name,
        email: employeeRows[0].email,
        podName: employeeRows[0].pod_name || null,
      },
      rosterMonthStatus: monthRows[0]?.status || null,
      schedule: days,
      summary,
    });
  } catch (error: any) {
    console.error("Fetch employee schedule error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to load schedule" },
      { status: 500 }
    );
  }
}
