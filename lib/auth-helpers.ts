import { auth } from "@/auth";
import { NextResponse } from "next/server";

export interface AuthenticatedUser {
  id: string;
  email: string;
  role: "manager" | "pod_lead" | "employee";
  employeeId?: string | null;
}

/**
 * Read the authenticated user's identity from the verified Auth.js session.
 * Employee account linking is performed once during credentials sign-in;
 * protected API requests must not each issue extra database queries.
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

  const sessionUser = session.user as typeof session.user & {
    role?: "manager" | "pod_lead" | "employee";
    employeeId?: string | null;
  };

  if (!sessionUser.role) {
    return {
      errorResponse: NextResponse.json(
        { error: "Your session is missing a role. Please sign out and sign in again." },
        { status: 401 }
      ),
    };
  }

  const user: AuthenticatedUser = {
    id: sessionUser.id,
    email: sessionUser.email || "",
    role: sessionUser.role,
    employeeId: sessionUser.employeeId || null,
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
}
