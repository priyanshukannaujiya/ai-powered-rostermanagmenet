import "./dns-patch";
import { neon } from "@neondatabase/serverless";
import * as dotenv from "dotenv";

dotenv.config({ path: ".env" });

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.error("DATABASE_URL is not set!");
  process.exit(1);
}

const sql = neon(connectionString);

async function runMigrations() {
  console.log("Starting Neon database schema migration...");

  try {
    // 1. Enums
    await sql`
      DO $$ BEGIN
        CREATE TYPE user_role AS ENUM ('manager', 'pod_lead', 'employee');
      EXCEPTION
        WHEN duplicate_object THEN null;
      END $$;
    `;

    await sql`
      DO $$ BEGIN
        CREATE TYPE operating_calendar AS ENUM ('all_365', 'daily_no_holidays', 'mon_sat_no_holidays', 'custom');
      EXCEPTION
        WHEN duplicate_object THEN null;
      END $$;
    `;

    await sql`
      DO $$ BEGIN
        CREATE TYPE leave_type AS ENUM ('planned', 'sick', 'other');
      EXCEPTION
        WHEN duplicate_object THEN null;
      END $$;
    `;

    await sql`
      DO $$ BEGIN
        CREATE TYPE leave_status AS ENUM ('pending', 'approved', 'rejected');
      EXCEPTION
        WHEN duplicate_object THEN null;
      END $$;
    `;

    await sql`
      DO $$ BEGIN
        CREATE TYPE comp_off_status AS ENUM ('pending', 'approved', 'used');
      EXCEPTION
        WHEN duplicate_object THEN null;
      END $$;
    `;

    await sql`
      DO $$ BEGIN
        CREATE TYPE roster_month_status AS ENUM ('draft', 'published');
      EXCEPTION
        WHEN duplicate_object THEN null;
      END $$;
    `;

    await sql`
      DO $$ BEGIN
        CREATE TYPE roster_day_status AS ENUM ('working', 'weekly_off', 'leave', 'holiday', 'comp_off', 'unassigned');
      EXCEPTION
        WHEN duplicate_object THEN null;
      END $$;
    `;

    await sql`
      DO $$ BEGIN
        CREATE TYPE conflict_severity AS ENUM ('blocking', 'warning');
      EXCEPTION
        WHEN duplicate_object THEN null;
      END $$;
    `;

    await sql`
      DO $$ BEGIN
        CREATE TYPE import_status AS ENUM ('previewed', 'committed', 'failed');
      EXCEPTION
        WHEN duplicate_object THEN null;
      END $$;
    `;

    // 2. Tables
    await sql`
      CREATE TABLE IF NOT EXISTS imports (
        id text PRIMARY KEY,
        filename text NOT NULL,
        uploaded_by text,
        uploaded_at timestamp DEFAULT now() NOT NULL,
        status import_status DEFAULT 'previewed' NOT NULL,
        row_counts jsonb,
        error_summary jsonb,
        target_month text,
        created_at timestamp DEFAULT now() NOT NULL,
        updated_at timestamp DEFAULT now() NOT NULL
      );
    `;

    await sql`ALTER TABLE imports ADD COLUMN IF NOT EXISTS target_month text;`;

    await sql`
      CREATE TABLE IF NOT EXISTS pods (
        id text PRIMARY KEY,
        name text NOT NULL,
        lead_employee_id text,
        created_at timestamp DEFAULT now() NOT NULL,
        updated_at timestamp DEFAULT now() NOT NULL
      );
    `;

    await sql`
      CREATE TABLE IF NOT EXISTS employees (
        id text PRIMARY KEY,
        name text NOT NULL,
        email text NOT NULL UNIQUE,
        pod_id text REFERENCES pods(id) ON DELETE SET NULL,
        active boolean DEFAULT true NOT NULL,
        created_at timestamp DEFAULT now() NOT NULL,
        updated_at timestamp DEFAULT now() NOT NULL
      );
    `;
    await sql`ALTER TABLE employees ADD COLUMN IF NOT EXISTS import_id text REFERENCES imports(id);`;

    await sql`
      CREATE TABLE IF NOT EXISTS users (
        id text PRIMARY KEY,
        email text NOT NULL UNIQUE,
        password_hash text NOT NULL,
        role user_role DEFAULT 'employee' NOT NULL,
        employee_id text REFERENCES employees(id) ON DELETE SET NULL,
        created_at timestamp DEFAULT now() NOT NULL,
        updated_at timestamp DEFAULT now() NOT NULL
      );
    `;

    await sql`
      CREATE TABLE IF NOT EXISTS brands (
        id text PRIMARY KEY,
        name text NOT NULL,
        code text UNIQUE,
        category text,
        active boolean DEFAULT true NOT NULL,
        created_at timestamp DEFAULT now() NOT NULL,
        updated_at timestamp DEFAULT now() NOT NULL
      );
    `;
    await sql`ALTER TABLE brands ADD COLUMN IF NOT EXISTS code text;`;
    await sql`ALTER TABLE brands ADD COLUMN IF NOT EXISTS category text;`;
    await sql`CREATE UNIQUE INDEX IF NOT EXISTS idx_brands_code ON brands(code);`;

    await sql`
      CREATE TABLE IF NOT EXISTS processes (
        id text PRIMARY KEY,
        name text NOT NULL,
        code text NOT NULL UNIQUE,
        created_at timestamp DEFAULT now() NOT NULL,
        updated_at timestamp DEFAULT now() NOT NULL
      );
    `;

    await sql`
      CREATE TABLE IF NOT EXISTS brand_processes (
        id text PRIMARY KEY,
        brand_id text NOT NULL REFERENCES brands(id) ON DELETE CASCADE,
        process_id text NOT NULL REFERENCES processes(id) ON DELETE CASCADE,
        operating_calendar operating_calendar DEFAULT 'mon_sat_no_holidays' NOT NULL,
        min_headcount_weekday integer DEFAULT 1 NOT NULL,
        min_headcount_sunday integer DEFAULT 0 NOT NULL,
        min_headcount_holiday integer DEFAULT 0 NOT NULL,
        custom_schedule_config jsonb,
        import_id text REFERENCES imports(id),
        active boolean DEFAULT true NOT NULL,
        created_at timestamp DEFAULT now() NOT NULL,
        updated_at timestamp DEFAULT now() NOT NULL,
        CONSTRAINT brand_process_unique UNIQUE (brand_id, process_id)
      );
    `;
    await sql`ALTER TABLE brand_processes ADD COLUMN IF NOT EXISTS import_id text REFERENCES imports(id);`;
    await sql`ALTER TABLE brand_processes ADD COLUMN IF NOT EXISTS active boolean DEFAULT true NOT NULL;`;

    await sql`
      CREATE TABLE IF NOT EXISTS assignments (
        id text PRIMARY KEY,
        employee_id text NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
        brand_process_id text NOT NULL REFERENCES brand_processes(id) ON DELETE CASCADE,
        start_date date NOT NULL,
        end_date date,
        priority integer DEFAULT 1 NOT NULL,
        is_exclusive boolean DEFAULT false NOT NULL,
        import_id text REFERENCES imports(id),
        active boolean DEFAULT true NOT NULL,
        created_at timestamp DEFAULT now() NOT NULL,
        updated_at timestamp DEFAULT now() NOT NULL
      );
    `;
    await sql`ALTER TABLE assignments ADD COLUMN IF NOT EXISTS import_id text REFERENCES imports(id);`;
    await sql`ALTER TABLE assignments ADD COLUMN IF NOT EXISTS active boolean DEFAULT true NOT NULL;`;

    await sql`
      CREATE TABLE IF NOT EXISTS weekly_offs (
        id text PRIMARY KEY,
        employee_id text NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
        weekday integer NOT NULL,
        effective_from date NOT NULL,
        effective_to date,
        created_at timestamp DEFAULT now() NOT NULL,
        updated_at timestamp DEFAULT now() NOT NULL
      );
    `;

    await sql`
      CREATE TABLE IF NOT EXISTS holidays (
        id text PRIMARY KEY,
        date date NOT NULL UNIQUE,
        name text NOT NULL,
        created_at timestamp DEFAULT now() NOT NULL,
        updated_at timestamp DEFAULT now() NOT NULL
      );
    `;

    await sql`
      CREATE TABLE IF NOT EXISTS leaves (
        id text PRIMARY KEY,
        employee_id text NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
        start_date date NOT NULL,
        end_date date NOT NULL,
        type leave_type DEFAULT 'planned' NOT NULL,
        reason text,
        status leave_status DEFAULT 'pending' NOT NULL,
        reviewed_by text REFERENCES users(id) ON DELETE SET NULL,
        reviewed_at timestamp,
        created_at timestamp DEFAULT now() NOT NULL,
        updated_at timestamp DEFAULT now() NOT NULL
      );
    `;

    await sql`
      CREATE TABLE IF NOT EXISTS comp_offs (
        id text PRIMARY KEY,
        employee_id text NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
        date date NOT NULL,
        status comp_off_status DEFAULT 'pending' NOT NULL,
        reason text,
        created_at timestamp DEFAULT now() NOT NULL,
        updated_at timestamp DEFAULT now() NOT NULL
      );
    `;

    await sql`
      CREATE TABLE IF NOT EXISTS roster_months (
        id text PRIMARY KEY,
        month text NOT NULL UNIQUE,
        status roster_month_status DEFAULT 'draft' NOT NULL,
        generated_at timestamp DEFAULT now() NOT NULL,
        published_at timestamp,
        created_at timestamp DEFAULT now() NOT NULL,
        updated_at timestamp DEFAULT now() NOT NULL
      );
    `;

    await sql`
      CREATE TABLE IF NOT EXISTS roster_month_rules (
        id text PRIMARY KEY,
        month text NOT NULL,
        brand_process_id text NOT NULL REFERENCES brand_processes(id) ON DELETE CASCADE,
        operating_calendar operating_calendar NOT NULL,
        min_headcount_weekday integer NOT NULL,
        min_headcount_sunday integer NOT NULL,
        min_headcount_holiday integer NOT NULL,
        created_at timestamp DEFAULT now() NOT NULL,
        updated_at timestamp DEFAULT now() NOT NULL,
        CONSTRAINT roster_month_rules_month_bp_unique UNIQUE (month, brand_process_id)
      );
    `;
    await sql`CREATE INDEX IF NOT EXISTS idx_imports_uploaded_at ON imports(uploaded_at);`;
    await sql`CREATE INDEX IF NOT EXISTS idx_roster_month_rules_month ON roster_month_rules(month);`;

    await sql`
      CREATE TABLE IF NOT EXISTS roster_days (
        id text PRIMARY KEY,
        roster_month_id text NOT NULL REFERENCES roster_months(id) ON DELETE CASCADE,
        employee_id text NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
        date date NOT NULL,
        status roster_day_status NOT NULL,
        brand_process_id text REFERENCES brand_processes(id) ON DELETE SET NULL,
        pinned boolean DEFAULT false NOT NULL,
        notes text,
        created_at timestamp DEFAULT now() NOT NULL,
        updated_at timestamp DEFAULT now() NOT NULL,
        CONSTRAINT rd_emp_date_bp_unique UNIQUE (roster_month_id, employee_id, date, brand_process_id)
      );
    `;

    await sql`
      CREATE TABLE IF NOT EXISTS conflicts (
        id text PRIMARY KEY,
        roster_month_id text NOT NULL REFERENCES roster_months(id) ON DELETE CASCADE,
        type text NOT NULL,
        severity conflict_severity NOT NULL,
        brand_process_id text REFERENCES brand_processes(id) ON DELETE CASCADE,
        employee_id text REFERENCES employees(id) ON DELETE CASCADE,
        date date,
        message text NOT NULL,
        suggested_fix text,
        resolved boolean DEFAULT false NOT NULL,
        created_at timestamp DEFAULT now() NOT NULL,
        updated_at timestamp DEFAULT now() NOT NULL
      );
    `;

    await sql`
      CREATE TABLE IF NOT EXISTS audit_log (
        id text PRIMARY KEY,
        actor_user_id text REFERENCES users(id) ON DELETE SET NULL,
        action text NOT NULL,
        entity text NOT NULL,
        entity_id text NOT NULL,
        before jsonb,
        after jsonb,
        created_at timestamp DEFAULT now() NOT NULL,
        updated_at timestamp DEFAULT now() NOT NULL
      );
    `;

    // 3. Indexes
    await sql`CREATE INDEX IF NOT EXISTS idx_employees_pod_id ON employees(pod_id);`;
    await sql`CREATE INDEX IF NOT EXISTS idx_brand_processes_brand ON brand_processes(brand_id);`;
    await sql`CREATE INDEX IF NOT EXISTS idx_brand_processes_proc ON brand_processes(process_id);`;
    await sql`CREATE INDEX IF NOT EXISTS idx_assignments_emp ON assignments(employee_id);`;
    await sql`CREATE INDEX IF NOT EXISTS idx_assignments_bp ON assignments(brand_process_id);`;
    await sql`CREATE INDEX IF NOT EXISTS idx_weekly_offs_emp ON weekly_offs(employee_id);`;
    await sql`CREATE INDEX IF NOT EXISTS idx_leaves_emp ON leaves(employee_id);`;
    await sql`CREATE INDEX IF NOT EXISTS idx_leaves_status ON leaves(status);`;
    await sql`CREATE INDEX IF NOT EXISTS idx_roster_days_month ON roster_days(roster_month_id);`;
    await sql`CREATE INDEX IF NOT EXISTS idx_roster_days_emp ON roster_days(employee_id);`;
    await sql`CREATE INDEX IF NOT EXISTS idx_roster_days_date ON roster_days(date);`;
    await sql`CREATE INDEX IF NOT EXISTS idx_conflicts_month ON conflicts(roster_month_id);`;
    await sql`CREATE INDEX IF NOT EXISTS idx_conflicts_severity ON conflicts(severity);`;

    console.log("Migration executed successfully!");
  } catch (error) {
    console.error("Migration failed:", error);
    process.exit(1);
  }
}

runMigrations();
