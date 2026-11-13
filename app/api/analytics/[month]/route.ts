import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth-helpers";
import { neon } from "@neondatabase/serverless";
import "@/lib/db/dns-patch";
import { formatDateOnly } from "@/lib/date-utils";
import { isValidRosterMonth } from "@/lib/import/month";

export const dynamic = "force-dynamic";

export async function GET(
  req: NextRequest,
  { params }: { params: { month: string } }
) {
  const { user, errorResponse } = await requireAuth(["manager", "pod_lead"]);
  if (errorResponse) return errorResponse;

  const sql = neon(process.env.DATABASE_URL!);
  const month = params.month || new Date().toISOString().slice(0, 7);
  if (!isValidRosterMonth(month)) {
    return NextResponse.json({ error: "Invalid month format. Expected YYYY-MM." }, { status: 400 });
  }
  const monthId = `roster-${month}`;
  const isManager = user?.role === "manager";
  if (!isManager && !user?.employeeId) {
    return NextResponse.json({ error: "Pod lead account is not linked to an employee." }, { status: 403 });
  }

  const [yearStr, monthStr] = month.split("-");
  const lastDay = new Date(parseInt(yearStr), parseInt(monthStr), 0).getDate();
  const monthStart = `${month}-01`;
  const monthEnd = `${month}-${String(lastDay).padStart(2, "0")}`;

  try {
    // 1. Coverage Heatmap: brand × date matrix
    const coverageRaw = await sql`
      SELECT 
        b.name as brand_name,
        p.code as process_code,
        bp.id as bp_id,
        COALESCE(mr.min_headcount_weekday, bp.min_headcount_weekday) as min_headcount_weekday,
        COALESCE(mr.min_headcount_sunday, bp.min_headcount_sunday) as min_headcount_sunday,
        COALESCE(mr.min_headcount_holiday, bp.min_headcount_holiday) as min_headcount_holiday,
        bp.operating_calendar,
        h.date as holiday_date,
        rd.date,
        COUNT(DISTINCT rd.employee_id) FILTER (WHERE rd.status = 'working') as staffed_count
      FROM brand_processes bp
      JOIN brands b ON bp.brand_id = b.id
      JOIN processes p ON bp.process_id = p.id
      LEFT JOIN roster_month_rules mr ON mr.brand_process_id = bp.id AND mr.month = ${month}
      LEFT JOIN roster_days rd ON rd.brand_process_id = bp.id 
        AND rd.roster_month_id = ${monthId}
        AND rd.status = 'working'
        AND (
          ${isManager}
          OR EXISTS (
            SELECT 1 FROM employees scoped_employee
            JOIN pods scoped_pod ON scoped_pod.id = scoped_employee.pod_id
            WHERE scoped_employee.id = rd.employee_id
              AND scoped_pod.lead_employee_id = ${user?.employeeId || null}
          )
        )
      LEFT JOIN holidays h ON h.date = rd.date
      GROUP BY b.name, p.code, bp.id,
        COALESCE(mr.min_headcount_weekday, bp.min_headcount_weekday),
        COALESCE(mr.min_headcount_sunday, bp.min_headcount_sunday),
        COALESCE(mr.min_headcount_holiday, bp.min_headcount_holiday),
        bp.operating_calendar, h.date, rd.date
      ORDER BY b.name, p.code, rd.date;
    `;

    // Build heatmap structure
    const heatmapByBrand = new Map<string, any>();
    for (const row of coverageRaw) {
      const key = `${row.brand_name} (${row.process_code})`;
      if (!heatmapByBrand.has(key)) {
        heatmapByBrand.set(key, {
          brand: row.brand_name,
          process: row.process_code,
          calendar: row.operating_calendar,
          required: row.min_headcount_weekday,
          requiredByDate: {},
          days: {},
        });
      }
      if (row.date) {
        const d = formatDateOnly(row.date);
        const entry = heatmapByBrand.get(key);
        entry.days[d] = parseInt(row.staffed_count) || 0;
        const weekday = new Date(`${d}T00:00:00.000Z`).getUTCDay();
        entry.requiredByDate[d] = row.holiday_date
          ? parseInt(row.min_headcount_holiday) || 0
          : weekday === 0
            ? parseInt(row.min_headcount_sunday) || 0
            : parseInt(row.min_headcount_weekday) || 0;
      }
    }
    const coverageHeatmap = Array.from(heatmapByBrand.values());

    // 2. Pod workload: shift count per employee per pod
    const podWorkloadRaw = await sql`
      SELECT 
        p.name as pod_name,
        e.name as employee_name,
        e.id as employee_id,
        COUNT(*) FILTER (WHERE rd.status = 'working') as working_shifts,
        COUNT(*) FILTER (WHERE rd.status = 'weekly_off') as weekly_offs,
        COUNT(*) FILTER (WHERE rd.status = 'leave') as leave_days
      FROM employees e
      JOIN pods p ON e.pod_id = p.id
      LEFT JOIN roster_days rd ON rd.employee_id = e.id AND rd.roster_month_id = ${monthId}
      WHERE e.active = true
        AND (
          ${isManager}
          OR EXISTS (
            SELECT 1 FROM pods scoped_pod
            WHERE scoped_pod.id = e.pod_id
              AND scoped_pod.lead_employee_id = ${user?.employeeId || null}
          )
        )
      GROUP BY p.name, e.name, e.id
      ORDER BY p.name, working_shifts DESC;
    `;

    // 3. SPOF Risk distribution
    const spofRaw = await sql`
      SELECT 
        b.name as brand_name,
        p.code as process_code,
        COUNT(DISTINCT a.employee_id) as assigned_count
      FROM brand_processes bp
      JOIN brands b ON bp.brand_id = b.id
      JOIN processes p ON bp.process_id = p.id
      LEFT JOIN assignments a ON a.brand_process_id = bp.id AND a.active = true
        AND a.start_date <= ${monthEnd}
        AND (a.end_date IS NULL OR a.end_date >= ${monthStart})
        AND EXISTS (SELECT 1 FROM employees active_employee WHERE active_employee.id = a.employee_id AND active_employee.active = true)
        AND (
          ${isManager}
          OR EXISTS (
            SELECT 1 FROM employees scoped_employee
            JOIN pods scoped_pod ON scoped_pod.id = scoped_employee.pod_id
            WHERE scoped_employee.id = a.employee_id
              AND scoped_pod.lead_employee_id = ${user?.employeeId || null}
          )
        )
      GROUP BY b.name, p.code
      ORDER BY assigned_count ASC;
    `;

    const leaveEmployees = await sql`
      SELECT DISTINCT employee_id FROM leaves 
      WHERE status IN ('approved', 'pending')
        AND start_date <= ${monthEnd} AND end_date >= ${monthStart}
        AND (
          ${isManager}
          OR EXISTS (
            SELECT 1 FROM employees scoped_employee
            JOIN pods scoped_pod ON scoped_pod.id = scoped_employee.pod_id
            WHERE scoped_employee.id = leaves.employee_id
              AND scoped_pod.lead_employee_id = ${user?.employeeId || null}
          )
        );
    `;
    const leaveEmpIds = new Set(leaveEmployees.map((l: any) => l.employee_id));

    // Get assignments for spof brands to check if they have leave
    const spofAssignments = await sql`
      SELECT bp.id as bp_id, a.employee_id, b.name as brand_name, p.code as process_code
      FROM brand_processes bp
      JOIN brands b ON bp.brand_id = b.id
      JOIN processes p ON bp.process_id = p.id
      LEFT JOIN assignments a ON a.brand_process_id = bp.id AND a.active = true
        AND a.start_date <= ${monthEnd}
        AND (a.end_date IS NULL OR a.end_date >= ${monthStart})
        AND EXISTS (SELECT 1 FROM employees active_employee WHERE active_employee.id = a.employee_id AND active_employee.active = true)
        AND (
          ${isManager}
          OR EXISTS (
            SELECT 1 FROM employees scoped_employee
            JOIN pods scoped_pod ON scoped_pod.id = scoped_employee.pod_id
            WHERE scoped_employee.id = a.employee_id
              AND scoped_pod.lead_employee_id = ${user?.employeeId || null}
          )
        );
    `;

    const spofByBp = new Map<string, { brand: string; process: string; employees: string[] }>();
    for (const row of spofAssignments) {
      const key = row.bp_id;
      if (!spofByBp.has(key)) {
        spofByBp.set(key, { brand: row.brand_name, process: row.process_code, employees: [] });
      }
      if (row.employee_id) spofByBp.get(key)!.employees.push(row.employee_id);
    }

    let criticalCount = 0, highCount = 0, safeCount = 0;
    for (const [, val] of spofByBp) {
      if (val.employees.length <= 1) {
        const hasLeave = val.employees.some(id => leaveEmpIds.has(id));
        if (hasLeave) criticalCount++;
        else highCount++;
      } else {
        safeCount++;
      }
    }

    const spofDistribution = [
      { name: "Critical", value: criticalCount, fill: "#ef4444" },
      { name: "High", value: highCount, fill: "#f59e0b" },
      { name: "Safe", value: safeCount, fill: "#22c55e" },
    ];

    // 4. Leave Pipeline/Funnel
    const leaveCounts = await sql`
      SELECT 
        status,
        COUNT(*) as count
      FROM leaves
      WHERE start_date <= ${monthEnd} AND end_date >= ${monthStart}
        AND (
          ${isManager}
          OR EXISTS (
            SELECT 1 FROM employees scoped_employee
            JOIN pods scoped_pod ON scoped_pod.id = scoped_employee.pod_id
            WHERE scoped_employee.id = leaves.employee_id
              AND scoped_pod.lead_employee_id = ${user?.employeeId || null}
          )
        )
      GROUP BY status;
    `;
    const notifCount = await sql`
      SELECT COUNT(*) as count
      FROM notifications
      WHERE created_at >= ${monthStart}::date
        AND created_at < (${monthEnd}::date + INTERVAL '1 day')
        AND type LIKE 'leave_%'
        AND (
        ${isManager}
        OR EXISTS (
          SELECT 1 FROM employees scoped_employee
          JOIN pods scoped_pod ON scoped_pod.id = scoped_employee.pod_id
          WHERE scoped_employee.id = notifications.employee_id
            AND scoped_pod.lead_employee_id = ${user?.employeeId || null}
        )
      );
    `;

    const leaveFunnel = [
      { stage: "Submitted", count: 0 },
      { stage: "Pending", count: 0 },
      { stage: "Approved", count: 0 },
      { stage: "Notified", count: parseInt(notifCount[0]?.count) || 0 },
    ];
    let totalSubmitted = 0;
    for (const row of leaveCounts) {
      totalSubmitted += parseInt(row.count);
      if (row.status === "pending") leaveFunnel[1].count = parseInt(row.count);
      else if (row.status === "approved") leaveFunnel[2].count = parseInt(row.count);
    }
    leaveFunnel[0].count = totalSubmitted;

    // 5. Conflict trend by date
    const conflictTrend = await sql`
      SELECT 
        date,
        severity,
        COUNT(*) as count
      FROM conflicts
      WHERE roster_month_id = ${monthId} AND resolved = false AND date IS NOT NULL
        AND (
          ${isManager}
          OR employee_id IN (
            SELECT scoped_employee.id
            FROM employees scoped_employee
            JOIN pods scoped_pod ON scoped_pod.id = scoped_employee.pod_id
            WHERE scoped_pod.lead_employee_id = ${user?.employeeId || null}
          )
          OR brand_process_id IN (
            SELECT scoped_assignment.brand_process_id
            FROM assignments scoped_assignment
            JOIN employees scoped_employee ON scoped_employee.id = scoped_assignment.employee_id
            JOIN pods scoped_pod ON scoped_pod.id = scoped_employee.pod_id
            WHERE scoped_pod.lead_employee_id = ${user?.employeeId || null}
          )
        )
      GROUP BY date, severity
      ORDER BY date ASC;
    `;

    const conflictsByDate = new Map<string, { date: string; blocking: number; warning: number }>();
    for (const row of conflictTrend) {
      const d = formatDateOnly(row.date);
      if (!conflictsByDate.has(d)) {
        conflictsByDate.set(d, { date: d, blocking: 0, warning: 0 });
      }
      const entry = conflictsByDate.get(d)!;
      if (row.severity === "blocking") entry.blocking = parseInt(row.count);
      else entry.warning = parseInt(row.count);
    }
    const conflictTrendData = Array.from(conflictsByDate.values());

    // 6. Weekly-off distribution by weekday
    const weeklyOffDist = await sql`
      SELECT 
        weekday,
        COUNT(*) as count
      FROM weekly_offs
      JOIN employees scoped_employee ON scoped_employee.id = weekly_offs.employee_id
      WHERE scoped_employee.active = true
        AND weekly_offs.effective_from <= ${monthEnd}
        AND (weekly_offs.effective_to IS NULL OR weekly_offs.effective_to >= ${monthStart})
        AND (
        ${isManager}
        OR EXISTS (
          SELECT 1 FROM pods scoped_pod
          WHERE scoped_pod.id = scoped_employee.pod_id
            AND scoped_pod.lead_employee_id = ${user?.employeeId || null}
        )
      )
      GROUP BY weekday
      ORDER BY weekday ASC;
    `;
    const dayNames = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
    const weeklyOffDistribution = weeklyOffDist.map((w: any) => ({
      day: dayNames[w.weekday] || `Day ${w.weekday}`,
      weekday: parseInt(w.weekday),
      count: parseInt(w.count),
    }));

    // 7. Summary KPIs
    const summaryRaw = await sql`
      SELECT 
        COUNT(*) FILTER (WHERE rd.status = 'working') as total_working,
        COUNT(*) FILTER (WHERE rd.status = 'weekly_off') as total_offs,
        COUNT(*) FILTER (WHERE rd.status = 'leave') as total_leaves,
        COUNT(DISTINCT rd.employee_id) as active_employees
      FROM roster_days rd
      WHERE rd.roster_month_id = ${monthId}
        AND (
          ${isManager}
          OR rd.employee_id IN (
            SELECT scoped_employee.id
            FROM employees scoped_employee
            JOIN pods scoped_pod ON scoped_pod.id = scoped_employee.pod_id
            WHERE scoped_pod.lead_employee_id = ${user?.employeeId || null}
          )
        );
    `;

    const conflictSummary = await sql`
      SELECT 
        COUNT(*) FILTER (WHERE severity = 'blocking') as blocking,
        COUNT(*) FILTER (WHERE severity = 'warning') as warnings
      FROM conflicts
      WHERE roster_month_id = ${monthId} AND resolved = false
        AND (
          ${isManager}
          OR employee_id IN (
            SELECT scoped_employee.id
            FROM employees scoped_employee
            JOIN pods scoped_pod ON scoped_pod.id = scoped_employee.pod_id
            WHERE scoped_pod.lead_employee_id = ${user?.employeeId || null}
          )
          OR brand_process_id IN (
            SELECT scoped_assignment.brand_process_id
            FROM assignments scoped_assignment
            JOIN employees scoped_employee ON scoped_employee.id = scoped_assignment.employee_id
            JOIN pods scoped_pod ON scoped_pod.id = scoped_employee.pod_id
            WHERE scoped_pod.lead_employee_id = ${user?.employeeId || null}
          )
        );
    `;

    return NextResponse.json({
      success: true,
      month,
      summary: {
        totalWorkingShifts: parseInt(summaryRaw[0]?.total_working) || 0,
        totalWeeklyOffs: parseInt(summaryRaw[0]?.total_offs) || 0,
        totalLeaves: parseInt(summaryRaw[0]?.total_leaves) || 0,
        activeEmployees: parseInt(summaryRaw[0]?.active_employees) || 0,
        blockingConflicts: parseInt(conflictSummary[0]?.blocking) || 0,
        warnings: parseInt(conflictSummary[0]?.warnings) || 0,
      },
      coverageHeatmap,
      podWorkload: podWorkloadRaw,
      spofDistribution,
      leaveFunnel,
      conflictTrend: conflictTrendData,
      weeklyOffDistribution,
    });
  } catch (error: any) {
    console.error("Analytics API error:", error);
    return NextResponse.json({ error: "Failed to load analytics." }, { status: 500 });
  }
}
