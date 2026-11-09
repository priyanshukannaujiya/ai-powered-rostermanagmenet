import "./dns-patch";
import { neon } from "@neondatabase/serverless";
import * as dotenv from "dotenv";
import bcrypt from "bcryptjs";

dotenv.config({ path: ".env" });

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.error("DATABASE_URL is not set!");
  process.exit(1);
}

const sql = neon(connectionString);

async function seed() {
  console.log("Starting deterministic database seeding...");

  try {
    // Clean existing records in reverse dependency order
    await sql`TRUNCATE audit_log, conflicts, roster_days, roster_months, comp_offs, leaves, weekly_offs, assignments, brand_processes, processes, brands, users, employees, pods CASCADE;`;

    const salt = await bcrypt.genSalt(10);
    const managerPasswordHash = await bcrypt.hash("Manager@123", salt);
    const leadPasswordHash = await bcrypt.hash("Lead@123", salt);
    const employeePasswordHash = await bcrypt.hash("Employee@123", salt);

    // 1. Create 6 Pods
    const podNames = [
      "Alpha Pod (Beauty & Wellness)",
      "Beta Pod (Food & Beverages)",
      "Gamma Pod (Home & Living)",
      "Delta Pod (Fashion & Apparel)",
      "Epsilon Pod (Fitness & Sports)",
      "Zeta Pod (Baby & Kids)",
    ];

    const podIds: string[] = [];
    for (let i = 0; i < 6; i++) {
      const pId = `pod-${i + 1}`;
      podIds.push(pId);
      await sql`
        INSERT INTO pods (id, name, created_at, updated_at)
        VALUES (${pId}, ${podNames[i]}, now(), now());
      `;
    }

    // 2. Create 32 Employees across the 6 Pods
    // Pod leads will be:
    // Pod 1 lead: emp-1 (Aarav Sharma)
    // Pod 2 lead: emp-6 (Priya Patel)
    // Pod 3 lead: emp-11 (Rahul Verma)
    // Pod 4 lead: emp-16 (Sneha Rao)
    // Pod 5 lead: emp-21 (Vikram Malhotra)
    // Pod 6 lead: emp-26 (Ananya Iyer)

    const employeeData = [
      // Pod 1 (Alpha): 5 employees
      { id: "emp-1", name: "Aarav Sharma", email: "employee.aarav@opscompany.com", podId: podIds[0], isLead: true },
      { id: "emp-2", name: "Neha Joshi", email: "neha.joshi@opscompany.com", podId: podIds[0], isLead: false },
      { id: "emp-3", name: "Kunal Kapoor", email: "kunal.kapoor@opscompany.com", podId: podIds[0], isLead: false },
      { id: "emp-4", name: "Isha Singhal", email: "isha.singhal@opscompany.com", podId: podIds[0], isLead: false },
      { id: "emp-5", name: "Rohan Das", email: "rohan.das@opscompany.com", podId: podIds[0], isLead: false },

      // Pod 2 (Beta): 5 employees
      { id: "emp-6", name: "Priya Patel", email: "employee.priya@opscompany.com", podId: podIds[1], isLead: true },
      { id: "emp-7", name: "Suresh Menon", email: "suresh.menon@opscompany.com", podId: podIds[1], isLead: false },
      { id: "emp-8", name: "Deepa Nair", email: "deepa.nair@opscompany.com", podId: podIds[1], isLead: false },
      { id: "emp-9", name: "Gaurav Mehta", email: "gaurav.mehta@opscompany.com", podId: podIds[1], isLead: false },
      { id: "emp-10", name: "Pooja Hegde", email: "pooja.hegde@opscompany.com", podId: podIds[1], isLead: false },

      // Pod 3 (Gamma): 6 employees
      { id: "emp-11", name: "Rahul Verma", email: "employee.rahul@opscompany.com", podId: podIds[2], isLead: true },
      { id: "emp-12", name: "Aditi Sen", email: "aditi.sen@opscompany.com", podId: podIds[2], isLead: false },
      { id: "emp-13", name: "Varun Dhawan", email: "varun.dhawan@opscompany.com", podId: podIds[2], isLead: false },
      { id: "emp-14", name: "Kavita Sethi", email: "kavita.sethi@opscompany.com", podId: podIds[2], isLead: false },
      { id: "emp-15", name: "Arjun Rampal", email: "arjun.rampal@opscompany.com", podId: podIds[2], isLead: false },
      { id: "emp-16", name: "Meera Rajput", email: "meera.rajput@opscompany.com", podId: podIds[2], isLead: false },

      // Pod 4 (Delta): 5 employees
      { id: "emp-17", name: "Sneha Rao", email: "sneha.rao@opscompany.com", podId: podIds[3], isLead: true },
      { id: "emp-18", name: "Manish Paul", email: "manish.paul@opscompany.com", podId: podIds[3], isLead: false },
      { id: "emp-19", name: "Tanvi Shah", email: "tanvi.shah@opscompany.com", podId: podIds[3], isLead: false },
      { id: "emp-20", name: "Karthik Aryan", email: "karthik.aryan@opscompany.com", podId: podIds[3], isLead: false },
      { id: "emp-21", name: "Shreya Ghoshal", email: "shreya.ghoshal@opscompany.com", podId: podIds[3], isLead: false },

      // Pod 5 (Epsilon): 5 employees
      { id: "emp-22", name: "Vikram Malhotra", email: "vikram.malhotra@opscompany.com", podId: podIds[4], isLead: true },
      { id: "emp-23", name: "Nikhil Chinapa", email: "nikhil.chinapa@opscompany.com", podId: podIds[4], isLead: false },
      { id: "emp-24", name: "Tara Sutaria", email: "tara.sutaria@opscompany.com", podId: podIds[4], isLead: false },
      { id: "emp-25", name: "Harsh Vardhan", email: "harsh.vardhan@opscompany.com", podId: podIds[4], isLead: false },
      { id: "emp-26", name: "Rhea Chakraborty", email: "rhea.chakraborty@opscompany.com", podId: podIds[4], isLead: false },

      // Pod 6 (Zeta): 6 employees
      { id: "emp-27", name: "Ananya Iyer", email: "ananya.iyer@opscompany.com", podId: podIds[5], isLead: true },
      { id: "emp-28", name: "Sameer Kochhar", email: "sameer.kochhar@opscompany.com", podId: podIds[5], isLead: false },
      { id: "emp-29", name: "Divya Dutta", email: "divya.dutta@opscompany.com", podId: podIds[5], isLead: false },
      { id: "emp-30", name: "Prateik Babbar", email: "prateik.babbar@opscompany.com", podId: podIds[5], isLead: false },
      { id: "emp-31", name: "Zoya Akhtar", email: "zoya.akhtar@opscompany.com", podId: podIds[5], isLead: false },
      { id: "emp-32", name: "Farhan Qureshi", email: "farhan.qureshi@opscompany.com", podId: podIds[5], isLead: false },
    ];

    for (const emp of employeeData) {
      await sql`
        INSERT INTO employees (id, name, email, pod_id, active, created_at, updated_at)
        VALUES (${emp.id}, ${emp.name}, ${emp.email}, ${emp.podId}, true, now(), now());
      `;

      if (emp.isLead) {
        await sql`
          UPDATE pods SET lead_employee_id = ${emp.id} WHERE id = ${emp.podId};
        `;
      }
    }

    // 3. Create Users
    // Manager
    await sql`
      INSERT INTO users (id, email, password_hash, role, employee_id, created_at, updated_at)
      VALUES ('user-mgr', 'manager@opscompany.com', ${managerPasswordHash}, 'manager', NULL, now(), now());
    `;

    // Pod Lead (Aarav Sharma - Pod 1)
    await sql`
      INSERT INTO users (id, email, password_hash, role, employee_id, created_at, updated_at)
      VALUES ('user-lead-1', 'lead.pod1@opscompany.com', ${leadPasswordHash}, 'pod_lead', 'emp-1', now(), now());
    `;

    // 3 Test Employees
    await sql`
      INSERT INTO users (id, email, password_hash, role, employee_id, created_at, updated_at)
      VALUES 
        ('user-emp-1', 'employee.aarav@opscompany.com', ${employeePasswordHash}, 'employee', 'emp-1', now(), now()),
        ('user-emp-6', 'employee.priya@opscompany.com', ${employeePasswordHash}, 'employee', 'emp-6', now(), now()),
        ('user-emp-11', 'employee.rahul@opscompany.com', ${employeePasswordHash}, 'employee', 'emp-11', now(), now());
    `;

    // 4. Create 4 Processes
    const processList = [
      { id: "proc-cs", name: "Customer Support", code: "CS" },
      { id: "proc-acc", name: "Abandoned Cart Conversions", code: "ACC" },
      { id: "proc-ret", name: "Retention & Loyalty", code: "RET" },
      { id: "proc-ndr", name: "Non-Delivery Report Management", code: "NDR" },
    ];

    for (const p of processList) {
      await sql`
        INSERT INTO processes (id, name, code, created_at, updated_at)
        VALUES (${p.id}, ${p.name}, ${p.code}, now(), now());
      `;
    }

    // 5. Create 12 Brands
    // 9 Single-resource dedicated brands:
    // - Lumora Skincare (Dedicated: emp-1 Aarav)
    // - Brewhaus Coffee (Dedicated: emp-6 Priya)
    // - Nestwell Home (Dedicated: emp-11 Rahul)
    // - Trekkr Outdoor (Dedicated: emp-17 Sneha)
    // - Aura Glow (Dedicated: emp-22 Vikram)
    // - Urban Botanics (Dedicated: emp-27 Ananya)
    // - Daily Greens (Dedicated: emp-2 Neha)
    // - Zen Lifestyle (Dedicated: emp-7 Suresh)
    // - Velvet Thread (Dedicated: emp-12 Aditi)
    // 3 Multi-resource brands (2-3 employees split across processes):
    // - Kicks & Co (Pod 4: emp-18 Manish, emp-19 Tanvi, emp-20 Karthik)
    // - Pulse Nutrition (Pod 5: emp-23 Nikhil, emp-24 Tara, emp-25 Harsh)
    // - Bloom Baby (Pod 6: emp-28 Sameer, emp-29 Divya, emp-30 Prateik)

    const brandList = [
      { id: "brand-1", name: "Lumora Skincare" },
      { id: "brand-2", name: "Brewhaus Coffee" },
      { id: "brand-3", name: "Nestwell Home" },
      { id: "brand-4", name: "Trekkr Outdoor" },
      { id: "brand-5", name: "Aura Glow" },
      { id: "brand-6", name: "Urban Botanics" },
      { id: "brand-7", name: "Daily Greens" },
      { id: "brand-8", name: "Zen Lifestyle" },
      { id: "brand-9", name: "Velvet Thread" },
      { id: "brand-10", name: "Kicks & Co" },
      { id: "brand-11", name: "Pulse Nutrition" },
      { id: "brand-12", name: "Bloom Baby" },
    ];

    for (const b of brandList) {
      await sql`
        INSERT INTO brands (id, name, active, created_at, updated_at)
        VALUES (${b.id}, ${b.name}, true, now(), now());
      `;
    }

    // 6. Create Brand Processes & Assignments
    // Diverse calendars: all_365, daily_no_holidays, mon_sat_no_holidays, custom
    const bpConfigs = [
      // Brand 1: Lumora Skincare -> CS (all_365), ACC (mon_sat_no_holidays)
      { id: "bp-1-cs", brandId: "brand-1", processId: "proc-cs", cal: "all_365", w: 1, sun: 1, hol: 1, empIds: ["emp-1"] },
      { id: "bp-1-acc", brandId: "brand-1", processId: "proc-acc", cal: "mon_sat_no_holidays", w: 1, sun: 0, hol: 0, empIds: ["emp-1"] },

      // Brand 2: Brewhaus Coffee -> CS (daily_no_holidays), NDR (all_365)
      { id: "bp-2-cs", brandId: "brand-2", processId: "proc-cs", cal: "daily_no_holidays", w: 1, sun: 1, hol: 0, empIds: ["emp-6"] },
      { id: "bp-2-ndr", brandId: "brand-2", processId: "proc-ndr", cal: "all_365", w: 1, sun: 1, hol: 1, empIds: ["emp-6"] },

      // Brand 3: Nestwell Home -> NDR (all_365)
      { id: "bp-3-ndr", brandId: "brand-3", processId: "proc-ndr", cal: "all_365", w: 1, sun: 1, hol: 1, empIds: ["emp-11"] },

      // Brand 4: Trekkr Outdoor -> RET (mon_sat_no_holidays)
      { id: "bp-4-ret", brandId: "brand-4", processId: "proc-ret", cal: "mon_sat_no_holidays", w: 1, sun: 0, hol: 0, empIds: ["emp-17"] },

      // Brand 5: Aura Glow -> CS (mon_sat_no_holidays)
      { id: "bp-5-cs", brandId: "brand-5", processId: "proc-cs", cal: "mon_sat_no_holidays", w: 1, sun: 0, hol: 0, empIds: ["emp-22"] },

      // Brand 6: Urban Botanics -> ACC (daily_no_holidays)
      { id: "bp-6-acc", brandId: "brand-6", processId: "proc-acc", cal: "daily_no_holidays", w: 1, sun: 1, hol: 0, empIds: ["emp-27"] },

      // Brand 7: Daily Greens -> CS (mon_sat_no_holidays)
      { id: "bp-7-cs", brandId: "brand-7", processId: "proc-cs", cal: "mon_sat_no_holidays", w: 1, sun: 0, hol: 0, empIds: ["emp-2"] },

      // Brand 8: Zen Lifestyle -> RET (mon_sat_no_holidays)
      { id: "bp-8-ret", brandId: "brand-8", processId: "proc-ret", cal: "mon_sat_no_holidays", w: 1, sun: 0, hol: 0, empIds: ["emp-7"] },

      // Brand 9: Velvet Thread -> CS (all_365)
      { id: "bp-9-cs", brandId: "brand-9", processId: "proc-cs", cal: "all_365", w: 1, sun: 1, hol: 1, empIds: ["emp-12"] },

      // Multi-resource Brand 10: Kicks & Co -> CS (min 2 weekday, 1 sun, 3 employees assigned: emp-18, emp-19, emp-20)
      { id: "bp-10-cs", brandId: "brand-10", processId: "proc-cs", cal: "daily_no_holidays", w: 2, sun: 1, hol: 0, empIds: ["emp-18", "emp-19", "emp-20"] },
      { id: "bp-10-acc", brandId: "brand-10", processId: "proc-acc", cal: "mon_sat_no_holidays", w: 1, sun: 0, hol: 0, empIds: ["emp-19"] },

      // Multi-resource Brand 11: Pulse Nutrition -> CS (all_365, shared by emp-23, emp-24), NDR (emp-25)
      { id: "bp-11-cs", brandId: "brand-11", processId: "proc-cs", cal: "all_365", w: 2, sun: 1, hol: 1, empIds: ["emp-23", "emp-24"] },
      { id: "bp-11-ndr", brandId: "brand-11", processId: "proc-ndr", cal: "mon_sat_no_holidays", w: 1, sun: 0, hol: 0, empIds: ["emp-25"] },

      // Multi-resource Brand 12: Bloom Baby -> CS (mon_sat_no_holidays, emp-28, emp-29), RET (emp-30)
      { id: "bp-12-cs", brandId: "brand-12", processId: "proc-cs", cal: "mon_sat_no_holidays", w: 2, sun: 0, hol: 0, empIds: ["emp-28", "emp-29"] },
      { id: "bp-12-ret", brandId: "brand-12", processId: "proc-ret", cal: "mon_sat_no_holidays", w: 1, sun: 0, hol: 0, empIds: ["emp-30"] },
    ];

    for (const bpc of bpConfigs) {
      await sql`
        INSERT INTO brand_processes (
          id, brand_id, process_id, operating_calendar, min_headcount_weekday, min_headcount_sunday, min_headcount_holiday, created_at, updated_at
        )
        VALUES (
          ${bpc.id}, ${bpc.brandId}, ${bpc.processId}, ${bpc.cal as any}, ${bpc.w}, ${bpc.sun}, ${bpc.hol}, now(), now()
        );
      `;

      for (const eId of bpc.empIds) {
        const asgnId = `asgn-${bpc.id}-${eId}`;
        await sql`
          INSERT INTO assignments (
            id, employee_id, brand_process_id, start_date, end_date, priority, is_exclusive, created_at, updated_at
          )
          VALUES (
            ${asgnId}, ${eId}, ${bpc.id}, '2026-01-01', NULL, 1, false, now(), now()
          );
        `;
      }
    }

    // 7. Weekly Offs
    // Default: Sunday (0) for most employees, Monday (1) or Tuesday (2) for a few to stagger
    for (let i = 0; i < employeeData.length; i++) {
      const eId = employeeData[i].id;
      const offWeekday = i % 7 === 0 ? 1 : i % 5 === 0 ? 6 : 0; // mostly Sunday (0), some Monday (1) and Saturday (6)
      await sql`
        INSERT INTO weekly_offs (id, employee_id, weekday, effective_from, effective_to, created_at, updated_at)
        VALUES (${`wo-${eId}`}, ${eId}, ${offWeekday}, '2026-01-01', NULL, now(), now());
      `;
    }

    // 8. Public Holidays (Nov 2026)
    const holidaysNov2026 = [
      { id: "hol-1", date: "2026-11-08", name: "Diwali" },
      { id: "hol-2", date: "2026-11-09", name: "Govardhan Puja" },
      { id: "hol-3", date: "2026-11-10", name: "Bhai Dooj" },
      { id: "hol-4", date: "2026-11-24", name: "Guru Nanak Jayanti" },
    ];

    for (const h of holidaysNov2026) {
      await sql`
        INSERT INTO holidays (id, date, name, created_at, updated_at)
        VALUES (${h.id}, ${h.date}, ${h.name}, now(), now());
      `;
    }

    // 9. Leaves (Approved & Pending)
    // Approved leave for Priya (Brewhaus Coffee sole resource) creating a gap on Nov 15
    await sql`
      INSERT INTO leaves (id, employee_id, start_date, end_date, type, reason, status, reviewed_by, reviewed_at, created_at, updated_at)
      VALUES 
        ('leave-priya-nov', 'emp-6', '2026-11-15', '2026-11-16', 'planned', 'Family event', 'approved', 'user-mgr', now(), now(), now()),
        ('leave-aarav-nov', 'emp-1', '2026-11-25', '2026-11-25', 'sick', 'Doctor appointment', 'approved', 'user-mgr', now(), now(), now()),
        ('leave-pending-1', 'emp-11', '2026-11-18', '2026-11-20', 'planned', 'Wedding attendance', 'pending', NULL, NULL, now(), now()),
        ('leave-pending-2', 'emp-18', '2026-11-22', '2026-11-23', 'planned', 'Personal work', 'pending', NULL, NULL, now(), now());
    `;

    // 10. Comp-Offs
    await sql`
      INSERT INTO comp_offs (id, employee_id, date, status, reason, created_at, updated_at)
      VALUES 
        ('comp-1', 'emp-2', '2026-11-04', 'approved', 'Overtime coverage on previous month festival launch', now(), now());
    `;

    console.log("Database seeded successfully!");
  } catch (error) {
    console.error("Seeding failed:", error);
    process.exit(1);
  }
}

seed();
