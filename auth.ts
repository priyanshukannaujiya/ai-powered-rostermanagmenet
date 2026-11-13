import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { neon } from "@neondatabase/serverless";
import { authConfig } from "./auth.config";
import "./lib/db/dns-patch";
import { consumeRateLimit, clearRateLimit } from "./lib/security/rate-limit";

export const { handlers, signIn, signOut, auth } = NextAuth({
  ...authConfig,
  providers: [
    Credentials({
      name: "Credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      authorize: async (credentials, request) => {
        if (!credentials?.email || !credentials?.password) {
          return null;
        }

        const email = String(credentials.email).trim().toLowerCase();
        const password = String(credentials.password);

        const connectionString = process.env.DATABASE_URL;
        if (!connectionString) {
          throw new Error("DATABASE_URL is not configured.");
        }

        const sql = neon(connectionString);
        const loginKey = `login:account:${email}`;
        const forwardedFor = typeof request?.headers?.get === "function"
          ? request.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
          : undefined;
        const sourceIp = forwardedFor || (typeof request?.headers?.get === "function" ? request.headers.get("x-real-ip") : null) || "unknown";
        const [accountAttempt, sourceAttempt] = await Promise.all([
          consumeRateLimit(sql, loginKey, 10, 15 * 60),
          consumeRateLimit(sql, `login:source:${sourceIp}`, 30, 15 * 60),
        ]);
        if (!accountAttempt.allowed || !sourceAttempt.allowed) {
          console.warn(
            `[AUTH_DIAGNOSTIC] Login rate limit exceeded for account: ${email} (source IP: ${sourceIp}) - accountCount=${accountAttempt.count}, sourceCount=${sourceAttempt.count}`
          );
          return null;
        }
        const rows = await sql`
          SELECT u.id, u.email, u.password_hash, u.role, u.employee_id
          FROM users u
          WHERE LOWER(u.email) = ${email}
            AND (
              u.employee_id IS NULL
              OR EXISTS (
                SELECT 1 FROM employees e
                WHERE e.id = u.employee_id AND e.active = true
              )
            )
          LIMIT 1;
        `;

        if (!rows || rows.length === 0) {
          console.warn(`[AUTH_DIAGNOSTIC] Login failed: User account not found or employee is inactive: ${email}`);
          return null;
        }

        const user = rows[0];
        const isValid = await bcrypt.compare(password, user.password_hash);
        if (!isValid) {
          console.warn(`[AUTH_DIAGNOSTIC] Login failed: Password mismatch for user: ${email}`);
          return null;
        }
        await clearRateLimit(sql, loginKey);
        console.info(`[AUTH_DIAGNOSTIC] Login successful for user: ${user.email} (role: ${user.role}, employeeId: ${user.employee_id})`);

        return {
          id: user.id,
          email: user.email,
          role: user.role,
          employeeId: user.employee_id,
        };
      },
    }),
  ],
  session: {
    strategy: "jwt",
  },
  secret: process.env.AUTH_SECRET,
});
