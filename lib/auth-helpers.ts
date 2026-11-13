import { auth } from "@/auth";
import { NextResponse } from "next/server";
import { neon } from "@neondatabase/serverless";
import "@/lib/db/dns-patch";

export interface AuthenticatedUser {
  id: string;
  email: string;
  role: "manager" | "pod_lead" | "employee";
  employeeId?: string | null;
}

/**
 * Validates the caller's session and role.
 * Employee and Pod Lead accounts with a missing employee_id are safely
 * linked by exact email only when exactly one active, unclaimed employee
 * record matches. Ambiguous or already-linked records are never auto-assigned.
 */
export async function requireAuth(allowedRoles?: Array<"manager" | "pod_lead" | "employee">): Promise<{
  user?: AuthenticatedUser;
  errorResponse?: NextResponse;
}> {
  const session = await auth();

  if (!session?.user?.id) {
    return {
      errorResponse: NextResponse.json(
        { error: "Authentication required" },
        { status: 401 }
      ),
    };
  }

  try {
    const sql = neon(process.env.DATABASE_URL!);

    // Repair legacy employee/Pod Lead accounts that were created without
    // employee_id. Exact email and a unique, active, unclaimed employee match
    // are required; never guess when there are zero or multiple matches.
    await sql`
      UPDATE users AS u
      SET employee_id = (
        SELECT matches.id
        FROM (
          SELECT e.id
          FROM employees AS e
          WHERE LOWER(TRIM(e.email)) = LOWER(TRIM(u.email))
            AND e.active = true
            AND NOT EXISTS (
              SELECT 1
              FROM users AS linked
              WHERE linked.employee_id = e.id
                AND linked.id <> u.id
            )
          LIMIT 2
        ) AS matches
        HAVING COUNT(*) = 1
      ),
      updated_at = now()
      WHERE u.id = ${session.user.id}
        AND u.employee_id IS NULL
        AND u.role IN ('employee', 'pod_lead')
        AND (
          SELECT COUNT(*)
          FROM (
            SELECT e.id
            FROM employees AS e
            WHERE LOWER(TRIM(e.email)) = LOWER(TRIM(u.email))
              AND e.active = true
              AND NOT EXISTS (
                SELECT 1
                FROM users AS linked
                WHERE linked.employee_id = e.id
                  AND linked.id <> u.id
              )
            LIMIT 2
          ) AS matches
        ) = 1;
    `;

    // Re-read the account after the guarded repair so current DB permissions
    // and the newly linked employee ID are used for this request.
    const rows = await sql`
      SELECT u.id, u.email, u.role, u.employee_id, e.active AS employee_active
      FROM users u
      LEFT JOIN employees e ON e.id = u.employee_id
      WHERE u.id = ${session.user.id}
      LIMIT 1;
    `;
    const account = rows[0];

    if (!account || (account.employee_id && account.employee_active !== true)) {
      return {
        errorResponse: NextResponse.json(
          { error: "Your account is inactive or no longer available. Please sign in again." },
          { status: 401 }
        ),
      };
    }

    const user: AuthenticatedUser = {
      id: account.id,
      email: account.email || "",
      role: account.role,
      employeeId: account.employee_id || null,
    };

    if (allowedRoles && !allowedRoles.includes(user.role)) {
      return {
        errorResponse: NextResponse.json(
          { error: `Forbidden: role '${user.role}' lacks permission for this action` },
          { status: 403 }
        ),
      };
    }

    return { user };
  } catch (error) {
    console.error("Authentication revalidation failed:", error);
    return {
      errorResponse: NextResponse.json(
        { error: "Unable to verify your account. Please try again." },
        { status: 503 }
      ),
    };
  }
}
