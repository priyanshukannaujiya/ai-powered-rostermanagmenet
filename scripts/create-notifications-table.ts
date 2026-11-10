import "@/lib/db/dns-patch";
import { neon } from "@neondatabase/serverless";
import * as dotenv from "dotenv";

dotenv.config({ path: ".env" });

const sql = neon(process.env.DATABASE_URL!);

async function main() {
  console.log("Creating notifications table in Neon PostgreSQL...");
  await sql`
    CREATE TABLE IF NOT EXISTS notifications (
      id text PRIMARY KEY,
      employee_id text NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
      title text NOT NULL,
      message text NOT NULL,
      type text NOT NULL DEFAULT 'shift_appointment',
      date text,
      read boolean NOT NULL DEFAULT false,
      metadata jsonb,
      created_at timestamp DEFAULT now() NOT NULL,
      updated_at timestamp DEFAULT now() NOT NULL
    );
  `;
  await sql`CREATE INDEX IF NOT EXISTS idx_notifications_emp ON notifications(employee_id);`;
  await sql`CREATE INDEX IF NOT EXISTS idx_notifications_read ON notifications(read);`;
  console.log("✅ Notifications table created successfully!");
}

main().catch(console.error);
