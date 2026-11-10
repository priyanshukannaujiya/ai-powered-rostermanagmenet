import "@/lib/db/dns-patch";
import { neon } from "@neondatabase/serverless";
import * as dotenv from "dotenv";

dotenv.config({ path: ".env" });

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.error("DATABASE_URL is not set!");
  process.exit(1);
}

const sql = neon(connectionString);

async function run() {
  console.log("Migrating database for Excel imports...");

  try {
    // 1. Enum for import_status
    await sql`
      DO $$ BEGIN
        CREATE TYPE import_status AS ENUM ('previewed', 'committed', 'failed');
      EXCEPTION
        WHEN duplicate_object THEN null;
      END $$;
    `;

    // 2. imports table
    await sql`
      CREATE TABLE IF NOT EXISTS imports (
        id text PRIMARY KEY,
        filename text NOT NULL,
        uploaded_by text,
        uploaded_at timestamp DEFAULT now() NOT NULL,
        status import_status DEFAULT 'previewed' NOT NULL,
        row_counts jsonb,
        error_summary jsonb,
        created_at timestamp DEFAULT now() NOT NULL,
        updated_at timestamp DEFAULT now() NOT NULL
      );
    `;

    // 3. Add columns to brands if not exists
    await sql`ALTER TABLE brands ADD COLUMN IF NOT EXISTS code text UNIQUE;`;
    await sql`ALTER TABLE brands ADD COLUMN IF NOT EXISTS category text;`;

    // Populate existing brands with uppercase codes if null
    await sql`
      UPDATE brands 
      SET code = UPPER(REPLACE(REPLACE(name, ' ', '_'), '&', 'AND'))
      WHERE code IS NULL;
    `;

    // 4. Add columns to employees, brand_processes, assignments
    await sql`ALTER TABLE employees ADD COLUMN IF NOT EXISTS import_id text REFERENCES imports(id) ON DELETE SET NULL;`;
    await sql`ALTER TABLE brand_processes ADD COLUMN IF NOT EXISTS import_id text REFERENCES imports(id) ON DELETE SET NULL;`;
    await sql`ALTER TABLE brand_processes ADD COLUMN IF NOT EXISTS active boolean DEFAULT true NOT NULL;`;
    await sql`ALTER TABLE assignments ADD COLUMN IF NOT EXISTS import_id text REFERENCES imports(id) ON DELETE SET NULL;`;
    await sql`ALTER TABLE assignments ADD COLUMN IF NOT EXISTS active boolean DEFAULT true NOT NULL;`;

    // 5. Indexes
    await sql`CREATE INDEX IF NOT EXISTS idx_imports_status ON imports(status);`;
    await sql`CREATE INDEX IF NOT EXISTS idx_imports_uploaded_at ON imports(uploaded_at);`;

    console.log("Excel imports migration completed successfully!");
  } catch (err) {
    console.error("Migration failed:", err);
    process.exit(1);
  }
}

run();
