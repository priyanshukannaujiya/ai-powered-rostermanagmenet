import { neon } from "@neondatabase/serverless";
import "../lib/db/dns-patch";
import { generateRoster } from "../lib/scheduler/assign";
import * as dotenv from "dotenv";

import { formatDateOnly } from "../lib/date-utils";

dotenv.config();

async function run() {
  console.log("Generating initial November 2026 Roster from Neon master data...");
  const sql = neon(process.env.DATABASE_URL!);

  const empRaw = await sql`SELECT id, name, email, pod_id, active FROM employees WHERE active = true;`;
  const bpRaw = await sql`
    SELECT bp.*, b.name as brand_name, p.code as process_code
    FROM brand_processes bp
    JOIN brands b ON bp.brand_id = b.id
    JOIN processes p ON bp.process_id = p.id;
  `;
  const asgnRaw = await sql`SELECT * FROM assignments;`;
  const woRaw = await sql`SELECT * FROM weekly_offs;`;
  const holRaw = await sql`SELECT * FROM holidays WHERE date >= '2026-11-01' AND date <= '2026-11-30';`;
  const leavesRaw = await sql`SELECT * FROM leaves WHERE status = 'approved' AND end_date >= '2026-11-01' AND start_date <= '2026-11-30';`;
  const compOffsRaw = await sql`SELECT * FROM comp_offs WHERE date >= '2026-11-01' AND date <= '2026-11-30';`;

  const res = generateRoster({
    month: "2026-11",
    employees: empRaw.map((e: any) => ({ id: e.id, name: e.name, email: e.email, podId: e.pod_id, active: e.active })),
    brandProcesses: bpRaw.map((b: any) => ({
      id: b.id,
      brandId: b.brand_id,
      brandName: b.brand_name,
      processId: b.process_id,
      processCode: b.process_code,
      operatingCalendar: b.operating_calendar,
      minHeadcountWeekday: b.min_headcount_weekday,
      minHeadcountSunday: b.min_headcount_sunday,
      minHeadcountHoliday: b.min_headcount_holiday,
    })),
    assignments: asgnRaw.map((a: any) => ({
      id: a.id,
      employeeId: a.employee_id,
      brandProcessId: a.brand_process_id,
      startDate: formatDateOnly(a.start_date),
      endDate: a.end_date ? formatDateOnly(a.end_date) : null,
      priority: a.priority,
    })),
    weeklyOffs: woRaw.map((w: any) => ({
      id: w.id,
      employeeId: w.employee_id,
      weekday: w.weekday,
      effectiveFrom: formatDateOnly(w.effective_from),
      effectiveTo: w.effective_to ? formatDateOnly(w.effective_to) : null,
    })),
    holidays: holRaw.map((h: any) => ({ id: h.id, date: formatDateOnly(h.date), name: h.name })),
    leaves: leavesRaw.map((l: any) => ({
      id: l.id,
      employeeId: l.employee_id,
      startDate: formatDateOnly(l.start_date),
      endDate: formatDateOnly(l.end_date),
      type: l.type,
      status: l.status,
    })),
    compOffs: compOffsRaw.map((c: any) => ({
      id: c.id,
      employeeId: c.employee_id,
      date: formatDateOnly(c.date),
      status: c.status,
    })),
  });

  console.log("Scheduler Metrics:", res.metrics);
  console.log("Total Conflicts:", res.conflicts.length);

  const monthId = "roster-2026-11";
  await sql`
    INSERT INTO roster_months (id, month, status, generated_at, updated_at)
    VALUES (${monthId}, '2026-11', 'draft', now(), now())
    ON CONFLICT (month) DO UPDATE SET updated_at = now();
  `;

  await sql`DELETE FROM roster_days WHERE roster_month_id = ${monthId} AND pinned = false;`;
  await sql`DELETE FROM conflicts WHERE roster_month_id = ${monthId};`;

  for (const day of res.days) {
    const rdId = `rd-${monthId}-${day.employeeId}-${day.date}-${day.brandProcessId || "none"}`;
    await sql`
      INSERT INTO roster_days (id, roster_month_id, employee_id, date, status, brand_process_id, pinned, notes, created_at, updated_at)
      VALUES (${rdId}, ${monthId}, ${day.employeeId}, ${day.date}, ${day.status as any}, ${day.brandProcessId || null}, false, ${day.notes || null}, now(), now())
      ON CONFLICT (roster_month_id, employee_id, date, brand_process_id)
      DO UPDATE SET status = EXCLUDED.status, updated_at = now();
    `;
  }

  for (const c of res.conflicts) {
    const cId = `cf-${monthId}-${c.id}`;
    await sql`
      INSERT INTO conflicts (id, roster_month_id, type, severity, brand_process_id, employee_id, date, message, suggested_fix, resolved, created_at, updated_at)
      VALUES (${cId}, ${monthId}, ${c.type}, ${c.severity as any}, ${c.brandProcessId || null}, ${c.employeeId || null}, ${c.date || null}, ${c.message}, ${c.suggestedFix || null}, false, now(), now());
    `;
  }

  console.log("November 2026 roster generation successfully written to database!");
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
