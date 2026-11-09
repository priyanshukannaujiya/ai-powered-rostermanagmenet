import "./dns-patch";
import { neon, neonConfig } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import * as schema from "./schema";

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  console.warn("DATABASE_URL is not set in environment.");
}

// neon-http driver is ultra-fast, stateless, and perfect for Next.js App Router and serverless
const sql = neon(connectionString || "");
export const db = drizzle(sql, { schema });
