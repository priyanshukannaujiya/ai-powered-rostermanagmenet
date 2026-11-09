import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { neon } from "@neondatabase/serverless";
import { authConfig } from "./auth.config";
import "./lib/db/dns-patch";

export const { handlers, signIn, signOut, auth } = NextAuth({
  ...authConfig,
  providers: [
    Credentials({
      name: "Credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      authorize: async (credentials) => {
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
        const rows = await sql`
          SELECT id, email, password_hash, role, employee_id
          FROM users
          WHERE LOWER(email) = ${email}
          LIMIT 1;
        `;

        if (!rows || rows.length === 0) {
          return null;
        }

        const user = rows[0];
        const isValid = await bcrypt.compare(password, user.password_hash);
        if (!isValid) {
          return null;
        }

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
