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
 * If unauthorized, returns a NextResponse that can be returned immediately.
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

  // JWT claims can outlive employee deactivation or role changes. Re-read the
  // account for each protected API request so current database permissions win.
  try {
    const sql = neon(process.env.DATABASE_URL!);
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

