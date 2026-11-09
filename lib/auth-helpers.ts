import { auth } from "@/auth";
import { NextResponse } from "next/server";

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

  const user: AuthenticatedUser = {
    id: session.user.id,
    email: session.user.email || "",
    role: (session.user as any).role || "employee",
    employeeId: (session.user as any).employeeId || null,
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

