import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth-helpers";
import { neon } from "@neondatabase/serverless";
import "@/lib/db/dns-patch";
import { randomUUID } from "crypto";
import bcrypt from "bcryptjs";
import { beginTransaction } from "@/lib/db/transaction";

export const dynamic = "force-dynamic";



async function createEmployeeTransaction(connectionString: string, id: string, body: any) {
  const tx = await beginTransaction(connectionString);
  try {
    const email = String(body.email).trim().toLowerCase();
    if ((await tx`SELECT id FROM employees WHERE LOWER(email) = ${email} LIMIT 1;`).length) { await tx.rollback(); return { status: 409, error: "An employee with this email already exists." }; }
    if (body.podId && !(await tx`SELECT id FROM pods WHERE id = ${body.podId} LIMIT 1;`).length) { await tx.rollback(); return { status: 400, error: "Selected pod does not exist." }; }
    if (body.initialPassword && (await tx`SELECT id FROM users WHERE LOWER(email) = ${email} LIMIT 1;`).length) { await tx.rollback(); return { status: 409, error: "This email already belongs to a login account." }; }
    await tx`INSERT INTO employees (id, name, email, pod_id, active, created_at, updated_at) VALUES (${id}, ${String(body.name).trim()}, ${email}, ${body.podId || null}, ${body.active}, now(), now());`;
    if (body.initialPassword) {
      const passwordHash = await bcrypt.hash(String(body.initialPassword), 12);
      await tx`INSERT INTO users (id, email, password_hash, role, employee_id, created_at, updated_at) VALUES (${`user-${id}`}, ${email}, ${passwordHash}, 'employee', ${id}, now(), now());`;
    }
    await tx.commit(); return null;
  } catch (error) { await tx.rollback(); throw error; }
  finally { await tx.close(); }
}

async function updateEmployeeTransaction(connectionString: string, id: string, body: any) {
  const tx = await beginTransaction(connectionString);
  try {
    const email = String(body.email).trim().toLowerCase();
    if (!(await tx`SELECT id FROM employees WHERE id = ${id} LIMIT 1 FOR UPDATE;`).length) { await tx.rollback(); return { status: 404, error: "Employee not found." }; }
    if ((await tx`SELECT id FROM employees WHERE LOWER(email) = ${email} AND id != ${id} LIMIT 1;`).length) { await tx.rollback(); return { status: 409, error: "An employee with this email already exists." }; }
    if (body.podId && !(await tx`SELECT id FROM pods WHERE id = ${body.podId} LIMIT 1;`).length) { await tx.rollback(); return { status: 400, error: "Selected pod does not exist." }; }
    const accounts = await tx`SELECT id, role, employee_id FROM users WHERE employee_id = ${id} OR LOWER(email) = ${email};`;
    if (accounts.some((account) => account.role === "manager" || (account.employee_id && account.employee_id !== id))) { await tx.rollback(); return { status: 409, error: "This email belongs to another or manager account." }; }
    await tx`UPDATE employees SET name = ${String(body.name).trim()}, email = ${email}, pod_id = ${body.podId || null}, active = ${body.active}, updated_at = now() WHERE id = ${id};`;
    if (!body.active) {
      await tx`UPDATE pods SET lead_employee_id = NULL, updated_at = now() WHERE lead_employee_id = ${id};`;
      await tx`UPDATE users SET role = 'employee', updated_at = now() WHERE employee_id = ${id} AND role = 'pod_lead';`;
    }
    if (body.initialPassword) {
      const passwordHash = await bcrypt.hash(String(body.initialPassword), 12);
      if (accounts.length) await tx`UPDATE users SET email = ${email}, password_hash = ${passwordHash}, updated_at = now() WHERE id = ${accounts[0].id};`;
      else await tx`INSERT INTO users (id, email, password_hash, role, employee_id, created_at, updated_at) VALUES (${`user-${id}`}, ${email}, ${passwordHash}, 'employee', ${id}, now(), now());`;
    } else {
      await tx`UPDATE users SET email = ${email}, updated_at = now() WHERE employee_id = ${id} AND role != 'manager';`;
    }
    await tx.commit(); return null;
  } catch (error) { await tx.rollback(); throw error; }
  finally { await tx.close(); }
}

async function deactivateEmployeeAndClearLeadership(connectionString: string, id: string) {
  const tx = await beginTransaction(connectionString);
  try {
    await tx`UPDATE employees SET active = false, updated_at = now() WHERE id = ${id};`;
    await tx`UPDATE pods SET lead_employee_id = NULL, updated_at = now() WHERE lead_employee_id = ${id};`;
    await tx`UPDATE users SET role = 'employee', updated_at = now() WHERE employee_id = ${id} AND role = 'pod_lead';`;
    await tx.commit();
  } catch (error) { await tx.rollback(); throw error; }
  finally { await tx.close(); }
}

async function createPodWithLeadership(connectionString: string, id: string, name: string, leadEmployeeId: string | null) {
  const tx = await beginTransaction(connectionString);
  try {
    if (leadEmployeeId) {
      const employee = await tx`SELECT id FROM employees WHERE id = ${leadEmployeeId} AND active = true LIMIT 1;`;
      if (!employee.length) throw new Error("Selected pod lead does not exist.");
    }
    await tx`INSERT INTO pods (id, name, lead_employee_id, created_at, updated_at) VALUES (${id}, ${name}, ${leadEmployeeId}, now(), now());`;
    if (leadEmployeeId) await tx`UPDATE users SET role = 'pod_lead', updated_at = now() WHERE employee_id = ${leadEmployeeId} AND role != 'manager';`;
    await tx.commit();
  } catch (error) { await tx.rollback(); throw error; }
  finally { await tx.close(); }
}

async function updatePodWithLeadership(connectionString: string, id: string, name: string, leadEmployeeId: string | null) {
  const tx = await beginTransaction(connectionString);
  try {
    if (leadEmployeeId) {
      const employee = await tx`SELECT id FROM employees WHERE id = ${leadEmployeeId} AND active = true LIMIT 1;`;
      if (!employee.length) throw new Error("Selected pod lead does not exist.");
    }
    const prior = await tx`SELECT lead_employee_id FROM pods WHERE id = ${id} LIMIT 1 FOR UPDATE;`;
    if (!prior.length) throw new Error("Pod not found.");
    const previousLeadId = prior[0].lead_employee_id as string | null;
    await tx`UPDATE pods SET name = ${name}, lead_employee_id = ${leadEmployeeId}, updated_at = now() WHERE id = ${id};`;
    if (previousLeadId && previousLeadId !== leadEmployeeId) {
      const other = await tx`SELECT id FROM pods WHERE lead_employee_id = ${previousLeadId} AND id != ${id} LIMIT 1;`;
      if (!other.length) await tx`UPDATE users SET role = 'employee', updated_at = now() WHERE employee_id = ${previousLeadId} AND role = 'pod_lead';`;
    }
    if (leadEmployeeId) await tx`UPDATE users SET role = 'pod_lead', updated_at = now() WHERE employee_id = ${leadEmployeeId} AND role != 'manager';`;
    await tx.commit();
  } catch (error) { await tx.rollback(); throw error; }
  finally { await tx.close(); }
}


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

function validateInput(entity: EntityType, input: unknown): string | null {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return "A JSON object is required.";
  }
  const body = input as Record<string, unknown>;
  const text = (key: string) => typeof body[key] === "string" && body[key].trim().length > 0;
  const optionalText = (key: string) => body[key] == null || body[key] === "" || text(key);
  const integer = (key: string, minimum = 0) =>
    Number.isInteger(body[key]) && Number(body[key]) >= minimum;
  const date = (key: string) => {
    if (typeof body[key] !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(body[key] as string)) return false;
    const parsedDate = new Date(`${body[key]}T00:00:00.000Z`);
    return !Number.isNaN(parsedDate.getTime()) && parsedDate.toISOString().slice(0, 10) === body[key];
  };

  switch (entity) {
    case "employees":
      if (!text("name") || !text("email") || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(body.email))) {
        return "Employee name and a valid email address are required.";
      }
      if (!optionalText("podId")) return "Select a valid pod or leave it unassigned.";
      if (typeof body.active !== "boolean") return "Employee active status is required.";
      if (body.initialPassword && (typeof body.initialPassword !== "string" || body.initialPassword.length < 12)) {
        return "Initial passwords must be at least 12 characters.";
      }
      return null;
    case "pods":
      if (!text("name") || !optionalText("leadEmployeeId")) return "Pod name and a valid optional pod lead are required.";
      return null;
    case "brands":
      if (!text("name") || !text("code") || !optionalText("category")) return "Brand name and unique code are required.";
      if (typeof body.active !== "boolean") return "Brand active status is required.";
      return null;
    case "processes":
      return text("name") && text("code") ? null : "Process name and unique code are required.";
    case "brand_processes":
      if (!text("brandId") || !text("processId")) return "Select both a brand and process.";
      if (!["all_365", "daily_no_holidays", "mon_sat_no_holidays", "custom"].includes(String(body.operatingCalendar))) {
        return "Select a valid operating calendar.";
      }
      if (body.active !== undefined && typeof body.active !== "boolean") return "Rule active status must be a boolean.";
      if (!integer("minHeadcountWeekday") || !integer("minHeadcountSunday") || !integer("minHeadcountHoliday")) {
        return "Coverage requirements must be non-negative whole numbers.";
      }
      return null;
    case "assignments":
      if (!text("employeeId") || !text("brandProcessId") || !date("startDate")) return "Select an employee and brand/process, and provide a valid start date.";
      if (!optionalText("endDate") || (body.endDate && !date("endDate"))) return "Provide a valid optional end date.";
      if (body.endDate && String(body.endDate) < String(body.startDate)) return "End date cannot be before start date.";
      if (!integer("priority", 1) || typeof body.isExclusive !== "boolean") return "Priority must be a positive whole number and exclusivity must be selected.";
      if (body.active !== undefined && typeof body.active !== "boolean") return "Assignment active status must be a boolean.";
      return null;
    case "weekly_offs":
      if (!text("employeeId") || !integer("weekday") || Number(body.weekday) > 6 || !date("effectiveFrom")) return "Select an employee, weekday (0-6), and valid effective start date.";
      if (!optionalText("effectiveTo") || (body.effectiveTo && !date("effectiveTo"))) return "Provide a valid optional effective end date.";
      if (body.effectiveTo && String(body.effectiveTo) < String(body.effectiveFrom)) return "Effective end date cannot be before the start date.";
      return null;
    case "holidays":
      return date("date") && text("name") ? null : "Holiday name and a valid date are required.";
  }
}

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

  if (user?.role === "pod_lead" && !user.employeeId) {
    return NextResponse.json({ error: "Pod lead account is not linked to an employee." }, { status: 403 });
  }

  const sql = neon(process.env.DATABASE_URL!);
  const isManager = user?.role === "manager";

  try {
    let rows: any[] = [];
    switch (entity) {
      case "employees":
        rows = await sql`
          SELECT e.*, p.name as pod_name,
            EXISTS (SELECT 1 FROM users u WHERE u.employee_id = e.id) AS has_login
          FROM employees e
          LEFT JOIN pods p ON e.pod_id = p.id
          WHERE (
            ${isManager}
            OR EXISTS (
              SELECT 1 FROM pods scoped_pod
              WHERE scoped_pod.id = e.pod_id
                AND scoped_pod.lead_employee_id = ${user?.employeeId || null}
            )
          )
          ORDER BY e.name ASC;
        `;
        break;
      case "pods":
        rows = await sql`
          SELECT p.*, e.name as lead_name
          FROM pods p
          LEFT JOIN employees e ON p.lead_employee_id = e.id
          WHERE (${isManager} OR p.lead_employee_id = ${user?.employeeId || null})
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
          WHERE (
            ${isManager}
            OR EXISTS (
              SELECT 1
              FROM assignments scoped_assignment
              JOIN employees scoped_employee ON scoped_employee.id = scoped_assignment.employee_id
              JOIN pods scoped_pod ON scoped_pod.id = scoped_employee.pod_id
              WHERE scoped_assignment.brand_process_id = bp.id
                AND scoped_pod.lead_employee_id = ${user?.employeeId || null}
            )
          )
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
          WHERE (
            ${isManager}
            OR EXISTS (
              SELECT 1 FROM pods scoped_pod
              WHERE scoped_pod.id = e.pod_id
                AND scoped_pod.lead_employee_id = ${user?.employeeId || null}
            )
          )
          ORDER BY e.name ASC;
        `;
        break;
      case "weekly_offs":
        rows = await sql`
          SELECT w.*, e.name as employee_name
          FROM weekly_offs w
          JOIN employees e ON w.employee_id = e.id
          WHERE (
            ${isManager}
            OR EXISTS (
              SELECT 1 FROM pods scoped_pod
              WHERE scoped_pod.id = e.pod_id
                AND scoped_pod.lead_employee_id = ${user?.employeeId || null}
            )
          )
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
    return NextResponse.json({ error: "Failed to fetch master data." }, { status: 500 });
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

  try {
    const body = await req.json();
    const validationError = validateInput(entity, body);
    if (validationError) return NextResponse.json({ error: validationError }, { status: 400 });
    const sql = neon(process.env.DATABASE_URL!);
    const id = `${entity.slice(0, 3)}-${randomUUID()}`;

    switch (entity) {
      case "employees": {
        const result = await createEmployeeTransaction(process.env.DATABASE_URL!, id, body);
        if (result) return NextResponse.json({ error: result.error }, { status: result.status });
        break;
      }
      case "pods": {
        await createPodWithLeadership(process.env.DATABASE_URL!, id, String(body.name), body.leadEmployeeId || null);
        break;
      }
      case "brands":
        await sql`
          INSERT INTO brands (id, name, code, category, active, created_at, updated_at)
          VALUES (${id}, ${String(body.name).trim()}, ${String(body.code).trim().toUpperCase()}, ${body.category || null}, ${body.active}, now(), now());
        `;
        break;
      case "processes":
        await sql`
          INSERT INTO processes (id, name, code, created_at, updated_at)
          VALUES (${id}, ${String(body.name).trim()}, ${String(body.code).trim().toUpperCase()}, now(), now());
        `;
        break;
      case "brand_processes":
        {
          const [brand, process] = await Promise.all([
            sql`SELECT id FROM brands WHERE id = ${body.brandId} AND active = true LIMIT 1;`,
            sql`SELECT id FROM processes WHERE id = ${body.processId} LIMIT 1;`,
          ]);
          if (!brand.length || !process.length) return NextResponse.json({ error: "Selected brand or process does not exist." }, { status: 400 });
        }
        await sql`
          INSERT INTO brand_processes (
            id, brand_id, process_id, operating_calendar, min_headcount_weekday, min_headcount_sunday, min_headcount_holiday, active, created_at, updated_at
          )
          VALUES (
            ${id}, ${body.brandId}, ${body.processId}, ${body.operatingCalendar},
            ${body.minHeadcountWeekday}, ${body.minHeadcountSunday}, ${body.minHeadcountHoliday}, ${body.active ?? true}, now(), now()
          );
        `;
        break;
      case "assignments":
        {
          const [employee, brandProcess] = await Promise.all([
            sql`SELECT id FROM employees WHERE id = ${body.employeeId} AND active = true LIMIT 1;`,
            sql`SELECT id FROM brand_processes WHERE id = ${body.brandProcessId} AND active = true LIMIT 1;`,
          ]);
          if (!employee.length || !brandProcess.length) return NextResponse.json({ error: "Selected employee or brand/process rule does not exist." }, { status: 400 });
        }
        await sql`
          INSERT INTO assignments (
            id, employee_id, brand_process_id, start_date, end_date, priority, is_exclusive, active, created_at, updated_at
          )
          VALUES (
            ${id}, ${body.employeeId}, ${body.brandProcessId}, ${body.startDate}, ${body.endDate || null},
            ${body.priority}, ${body.isExclusive}, ${body.active ?? true}, now(), now()
          );
        `;
        break;
      case "weekly_offs":
        {
          const employee = await sql`SELECT id FROM employees WHERE id = ${body.employeeId} AND active = true LIMIT 1;`;
          if (!employee.length) return NextResponse.json({ error: "Selected employee does not exist." }, { status: 400 });
        }
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
    const status = error?.code === "23505" ? 409 : 500;
    return NextResponse.json({ error: error.message || "Failed to create record" }, { status });
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
        await deactivateEmployeeAndClearLeadership(process.env.DATABASE_URL!, id);
        break;
      case "brand_processes":
        await sql`UPDATE brand_processes SET active = false, updated_at = now() WHERE id = ${id};`;
        break;
      case "assignments":
        await sql`UPDATE assignments SET active = false, updated_at = now() WHERE id = ${id};`;
        break;
      case "pods": {
        const linked = await sql`SELECT id FROM employees WHERE pod_id = ${id} LIMIT 1;`;
        if (linked.length) {
          return NextResponse.json({ error: "This pod still has employees. Reassign them before deleting the pod." }, { status: 409 });
        }
        await sql`DELETE FROM pods WHERE id = ${id};`;
        break;
      }
      case "processes": {
        const linked = await sql`SELECT id FROM brand_processes WHERE process_id = ${id} LIMIT 1;`;
        if (linked.length) {
          return NextResponse.json({ error: "This process is used by brand rules. Deactivate or reassign those rules before deleting it." }, { status: 409 });
        }
        await sql`DELETE FROM processes WHERE id = ${id};`;
        break;
      }
      case "brands":
        await sql`UPDATE brands SET active = false, updated_at = now() WHERE id = ${id};`;
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

export async function PUT(
  req: NextRequest,
  { params }: { params: { entity: string } }
) {
  const { user, errorResponse } = await requireAuth(["manager"]);
  if (errorResponse) return errorResponse;

  const entity = params.entity as EntityType;
  if (!ALLOWED_ENTITIES.includes(entity)) {
    return NextResponse.json({ error: "Invalid master data entity" }, { status: 400 });
  }
  const id = new URL(req.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "Record ID is required" }, { status: 400 });

  try {
    const body = await req.json();
    const validationError = validateInput(entity, body);
    if (validationError) return NextResponse.json({ error: validationError }, { status: 400 });
    const sql = neon(process.env.DATABASE_URL!);
    switch (entity) {
      case "employees": {
        const result = await updateEmployeeTransaction(process.env.DATABASE_URL!, id, body);
        if (result) return NextResponse.json({ error: result.error }, { status: result.status });
        break;
      }
      case "pods": {
        await updatePodWithLeadership(process.env.DATABASE_URL!, id, String(body.name), body.leadEmployeeId || null);
        break;
      }
      case "brands":
        await sql`UPDATE brands SET name = ${String(body.name).trim()}, code = ${String(body.code).trim().toUpperCase()}, category = ${body.category || null}, active = ${body.active}, updated_at = now() WHERE id = ${id};`;
        break;
      case "processes":
        await sql`UPDATE processes SET name = ${String(body.name).trim()}, code = ${String(body.code).trim().toUpperCase()}, updated_at = now() WHERE id = ${id};`;
        break;
      case "brand_processes":
        {
          const [brand, process] = await Promise.all([
            sql`SELECT id FROM brands WHERE id = ${body.brandId} AND active = true LIMIT 1;`,
            sql`SELECT id FROM processes WHERE id = ${body.processId} LIMIT 1;`,
          ]);
          if (!brand.length || !process.length) return NextResponse.json({ error: "Selected brand or process does not exist." }, { status: 400 });
        await sql`UPDATE brand_processes SET brand_id = ${body.brandId}, process_id = ${body.processId}, operating_calendar = ${body.operatingCalendar}, min_headcount_weekday = ${body.minHeadcountWeekday}, min_headcount_sunday = ${body.minHeadcountSunday}, min_headcount_holiday = ${body.minHeadcountHoliday}, active = ${body.active ?? true}, updated_at = now() WHERE id = ${id};`;
        }
        break;
      case "assignments":
        {
          const [employee, brandProcess] = await Promise.all([
            sql`SELECT id FROM employees WHERE id = ${body.employeeId} AND active = true LIMIT 1;`,
            sql`SELECT id FROM brand_processes WHERE id = ${body.brandProcessId} AND active = true LIMIT 1;`,
          ]);
          if (!employee.length || !brandProcess.length) return NextResponse.json({ error: "Selected employee or brand/process rule does not exist." }, { status: 400 });
        await sql`UPDATE assignments SET employee_id = ${body.employeeId}, brand_process_id = ${body.brandProcessId}, start_date = ${body.startDate}, end_date = ${body.endDate || null}, priority = ${body.priority}, is_exclusive = ${body.isExclusive}, active = ${body.active ?? true}, updated_at = now() WHERE id = ${id};`;
        }
        break;
      case "weekly_offs":
        {
          const employee = await sql`SELECT id FROM employees WHERE id = ${body.employeeId} AND active = true LIMIT 1;`;
          if (!employee.length) return NextResponse.json({ error: "Selected employee does not exist." }, { status: 400 });
        await sql`UPDATE weekly_offs SET employee_id = ${body.employeeId}, weekday = ${body.weekday}, effective_from = ${body.effectiveFrom}, effective_to = ${body.effectiveTo || null}, updated_at = now() WHERE id = ${id};`;
        }
        break;
      case "holidays":
        await sql`UPDATE holidays SET date = ${body.date}, name = ${body.name}, updated_at = now() WHERE id = ${id};`;
        break;
    }

    return NextResponse.json({ success: true, id, message: `${entity} record updated` });
  } catch (error: any) {
    console.error(`Update ${entity} error:`, error);
    const status = error?.code === "23505" ? 409 : 500;
    return NextResponse.json({ error: error.message || "Failed to update record" }, { status });
  }
}
