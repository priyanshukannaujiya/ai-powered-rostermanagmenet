import "./dns-patch";
import { neon } from "@neondatabase/serverless";
import * as dotenv from "dotenv";
import bcrypt from "bcryptjs";
import { randomUUID } from "crypto";

dotenv.config({ path: ".env" });

async function bootstrapManager() {
  const connectionString = process.env.DATABASE_URL;
  const email = process.env.BOOTSTRAP_MANAGER_EMAIL?.trim().toLowerCase();
  const password = process.env.BOOTSTRAP_MANAGER_PASSWORD;

  if (!connectionString || !email || !password) {
    throw new Error(
      "Set DATABASE_URL, BOOTSTRAP_MANAGER_EMAIL, and BOOTSTRAP_MANAGER_PASSWORD before bootstrapping a manager."
    );
  }
  if (password.length < 16) {
    throw new Error("BOOTSTRAP_MANAGER_PASSWORD must be at least 16 characters.");
  }

  const sql = neon(connectionString);
  const passwordHash = await bcrypt.hash(password, 12);
  await sql`
    INSERT INTO users (id, email, password_hash, role, employee_id, created_at, updated_at)
    VALUES (${`user-${randomUUID()}`}, ${email}, ${passwordHash}, 'manager', NULL, now(), now())
    ON CONFLICT (email) DO UPDATE SET
      password_hash = EXCLUDED.password_hash,
      role = 'manager',
      employee_id = NULL,
      updated_at = now();
  `;

  console.log(`Manager account ${email} is ready. No sample roster data was created or deleted.`);
}

bootstrapManager().catch((error) => {
  console.error("Manager bootstrap failed:", error);
  process.exitCode = 1;
});
