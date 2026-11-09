import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth-helpers";
import { neon } from "@neondatabase/serverless";
import "@/lib/db/dns-patch";

export const dynamic = "force-dynamic";

const ALLOWED_ENTITIES = [
  "employees",
  "pods",
  "brands",
  "processes",
  "brand_processes",
  "assignments",
  "weekly_offs",
  "holidays",
] as const;

type EntityType = (typeof ALLOWED_ENTITIES)[number];

export async function GET(
  req: NextRequest,
  { params }: { params: { entity: string } }
) {
  const { user, errorResponse } = await requireAuth(["manager", "pod_lead"]);
  if (errorResponse) return errorResponse;

  const entity = params.entity as EntityType;
  if (!ALLOWED_ENTITIES.includes(entity)) {
    return NextResponse.json({ error: "Invalid master data entity" }, { status: 400 });
  }

  const sql = neon(process.env.DATABASE_URL!);

  try {
    let rows: any[] = [];
    switch (entity) {
      case "employees":
        rows = await sql`
          SELECT e.*, p.name as pod_name
          FROM employees e
          LEFT JOIN pods p ON e.pod_id = p.id
          ORDER BY e.name ASC;
        `;
        break;
      case "pods":
        rows = await sql`
          SELECT p.*, e.name as lead_name
          FROM pods p
          LEFT JOIN employees e ON p.lead_employee_id = e.id
          ORDER BY p.name ASC;
        `;
        break;
      case "brands":
        rows = await sql`SELECT * FROM brands ORDER BY name ASC;`;
        break;
      case "processes":
        rows = await sql`SELECT * FROM processes ORDER BY code ASC;`;
        break;
      case "brand_processes":
        rows = await sql`
          SELECT bp.*, b.name as brand_name, p.name as process_name, p.code as process_code
          FROM brand_processes bp
          JOIN brands b ON bp.brand_id = b.id
          JOIN processes p ON bp.process_id = p.id
          ORDER BY b.name ASC, p.code ASC;
        `;
        break;
      case "assignments":
        rows = await sql`
          SELECT a.*, e.name as employee_name, b.name as brand_name, p.code as process_code
          FROM assignments a
          JOIN employees e ON a.employee_id = e.id
          JOIN brand_processes bp ON a.brand_process_id = bp.id
          JOIN brands b ON bp.brand_id = b.id
          JOIN processes p ON bp.process_id = p.id
          ORDER BY e.name ASC;
        `;
        break;
      case "weekly_offs":
        rows = await sql`
          SELECT w.*, e.name as employee_name
          FROM weekly_offs w
          JOIN employees e ON w.employee_id = e.id
          ORDER BY e.name ASC;
        `;
        break;
      case "holidays":
        rows = await sql`SELECT * FROM holidays ORDER BY date ASC;`;
        break;
    }

    return NextResponse.json({ data: rows });
  } catch (error: any) {
    console.error(`Fetch ${entity} error:`, error);
    return NextResponse.json({ error: error.message || "Failed to fetch data" }, { status: 500 });
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: { entity: string } }
) {
  const { user, errorResponse } = await requireAuth(["manager"]);
  if (errorResponse) return errorResponse;

  const entity = params.entity as EntityType;
  if (!ALLOWED_ENTITIES.includes(entity)) {
    return NextResponse.json({ error: "Invalid master data entity" }, { status: 400 });
  }

  const sql = neon(process.env.DATABASE_URL!);
  const body = await req.json();

  try {
    const id = body.id || `${entity.slice(0, 3)}-${Date.now()}`;

    switch (entity) {
      case "employees":
        await sql`
          INSERT INTO employees (id, name, email, pod_id, active, created_at, updated_at)
          VALUES (${id}, ${body.name}, ${body.email}, ${body.podId || null}, ${body.active ?? true}, now(), now());
        `;
        break;
      case "pods":
        await sql`
          INSERT INTO pods (id, name, lead_employee_id, created_at, updated_at)
          VALUES (${id}, ${body.name}, ${body.leadEmployeeId || null}, now(), now());
        `;
        break;
      case "brands":
        await sql`
          INSERT INTO brands (id, name, active, created_at, updated_at)
          VALUES (${id}, ${body.name}, ${body.active ?? true}, now(), now());
        `;
        break;
      case "processes":
        await sql`
          INSERT INTO processes (id, name, code, created_at, updated_at)
          VALUES (${id}, ${body.name}, ${body.code}, now(), now());
        `;
        break;
      case "brand_processes":
        await sql`
          INSERT INTO brand_processes (
            id, brand_id, process_id, operating_calendar, min_headcount_weekday, min_headcount_sunday, min_headcount_holiday, created_at, updated_at
          )
          VALUES (
            ${id}, ${body.brandId}, ${body.processId}, ${body.operatingCalendar || "mon_sat_no_holidays"},
            ${body.minHeadcountWeekday || 1}, ${body.minHeadcountSunday || 0}, ${body.minHeadcountHoliday || 0}, now(), now()
          );
        `;
        break;
      case "assignments":
        await sql`
          INSERT INTO assignments (
            id, employee_id, brand_process_id, start_date, end_date, priority, is_exclusive, created_at, updated_at
          )
          VALUES (
            ${id}, ${body.employeeId}, ${body.brandProcessId}, ${body.startDate}, ${body.endDate || null},
            ${body.priority || 1}, ${body.isExclusive || false}, now(), now()
          );
        `;
        break;
      case "weekly_offs":
        await sql`
          INSERT INTO weekly_offs (id, employee_id, weekday, effective_from, effective_to, created_at, updated_at)
          VALUES (${id}, ${body.employeeId}, ${body.weekday}, ${body.effectiveFrom}, ${body.effectiveTo || null}, now(), now());
        `;
        break;
      case "holidays":
        await sql`
          INSERT INTO holidays (id, date, name, created_at, updated_at)
          VALUES (${id}, ${body.date}, ${body.name}, now(), now());
        `;
        break;
    }

    return NextResponse.json({ success: true, id, message: `${entity} record created` });
  } catch (error: any) {
    console.error(`Create ${entity} error:`, error);
    return NextResponse.json({ error: error.message || "Failed to create record" }, { status: 500 });
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: { entity: string } }
) {
  const { user, errorResponse } = await requireAuth(["manager"]);
  if (errorResponse) return errorResponse;

  const entity = params.entity as EntityType;
  if (!ALLOWED_ENTITIES.includes(entity)) {
    return NextResponse.json({ error: "Invalid master data entity" }, { status: 400 });
  }

  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");
  if (!id) {
    return NextResponse.json({ error: "Record ID is required" }, { status: 400 });
  }

  const sql = neon(process.env.DATABASE_URL!);

  try {
    switch (entity) {
      case "employees":
        await sql`DELETE FROM employees WHERE id = ${id};`;
        break;
      case "pods":
        await sql`DELETE FROM pods WHERE id = ${id};`;
        break;
      case "brands":
        await sql`DELETE FROM brands WHERE id = ${id};`;
        break;
      case "processes":
        await sql`DELETE FROM processes WHERE id = ${id};`;
        break;
      case "brand_processes":
        await sql`DELETE FROM brand_processes WHERE id = ${id};`;
        break;
      case "assignments":
        await sql`DELETE FROM assignments WHERE id = ${id};`;
        break;
      case "weekly_offs":
        await sql`DELETE FROM weekly_offs WHERE id = ${id};`;
        break;
      case "holidays":
        await sql`DELETE FROM holidays WHERE id = ${id};`;
        break;
    }

    return NextResponse.json({ success: true, message: `Record deleted from ${entity}` });
  } catch (error: any) {
    console.error(`Delete ${entity} error:`, error);
    return NextResponse.json({ error: error.message || "Failed to delete record" }, { status: 500 });
  }
}
