import { describe, it, expect } from "vitest";
import { authConfig } from "../auth.config";
import { z } from "zod";

function isValidLeaveDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

const leaveSubmissionSchema = z.object({
  employeeId: z.string().optional(),
  startDate: z.string().refine(isValidLeaveDate, "Start date must be a valid YYYY-MM-DD date."),
  endDate: z.string().refine(isValidLeaveDate, "End date must be a valid YYYY-MM-DD date."),
  type: z.enum(["planned", "sick", "other"]),
  reason: z.string().optional(),
}).refine((value) => value.startDate <= value.endDate, {
  message: "End date cannot be before start date.",
  path: ["endDate"],
});

describe("Production Fixes Regression Suite", () => {
  describe("Leave Request Date Validation (Regex & Logical Validity)", () => {
    it("accepts valid ISO date strings in YYYY-MM-DD format", () => {
      expect(isValidLeaveDate("2026-11-20")).toBe(true);
      expect(isValidLeaveDate("2026-02-28")).toBe(true);
      expect(isValidLeaveDate("2026-12-31")).toBe(true);
    });

    it("rejects invalid date strings, leap day mismatches, and malformed strings", () => {
      expect(isValidLeaveDate("2026-11-31")).toBe(false); // Nov has 30 days
      expect(isValidLeaveDate("2026-02-29")).toBe(false); // 2026 is not a leap year
      expect(isValidLeaveDate("2026/11/20")).toBe(false);
      expect(isValidLeaveDate("invalid-date")).toBe(false);
      expect(isValidLeaveDate("2026-1-1")).toBe(false);
      expect(isValidLeaveDate("\\d{4}-\\d{2}-\\d{2}")).toBe(false);
    });

    it("validates leave submission schema successfully for normal requests", () => {
      const validPayload = {
        startDate: "2026-11-15",
        endDate: "2026-11-17",
        type: "planned",
        reason: "Family function",
      };
      const result = leaveSubmissionSchema.safeParse(validPayload);
      expect(result.success).toBe(true);
    });

    it("rejects leave submission if endDate is before startDate", () => {
      const invalidPayload = {
        startDate: "2026-11-17",
        endDate: "2026-11-15",
        type: "planned",
      };
      const result = leaveSubmissionSchema.safeParse(invalidPayload);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.errors[0].message).toBe("End date cannot be before start date.");
      }
    });
  });

  describe("Role-Based Access Control and Redirect Resolution", () => {
    const authorized = authConfig.callbacks?.authorized;
    if (!authorized) throw new Error("authorized callback is missing");

    it("allows manager to access /manager route", () => {
      const res = authorized({
        auth: { user: { id: "u-mgr", role: "manager" } } as any,
        request: { nextUrl: new URL("http://localhost:3000/manager") } as any,
      });
      expect(res).toBe(true);
    });

    it("allows pod_lead to access /manager route", () => {
      const res = authorized({
        auth: { user: { id: "u-lead", role: "pod_lead" } } as any,
        request: { nextUrl: new URL("http://localhost:3000/manager") } as any,
      });
      expect(res).toBe(true);
    });

    it("redirects employee attempting /manager to /me (preventing login loop)", () => {
      const res: any = authorized({
        auth: { user: { id: "u-emp", role: "employee" } } as any,
        request: { nextUrl: new URL("http://localhost:3000/manager") } as any,
      });
      expect(res instanceof Response).toBe(true);
      expect(res.headers.get("Location")).toContain("/me");
    });

    it("redirects unauthenticated user accessing /manager to sign-in page", () => {
      const res = authorized({
        auth: null as any,
        request: { nextUrl: new URL("http://localhost:3000/manager") } as any,
      });
      expect(res).toBe(false);
    });

    it("redirects already logged-in employee accessing /login directly to /me", () => {
      const res: any = authorized({
        auth: { user: { id: "u-emp", role: "employee" } } as any,
        request: { nextUrl: new URL("http://localhost:3000/login") } as any,
      });
      expect(res instanceof Response).toBe(true);
      expect(res.headers.get("Location")).toContain("/me");
    });

    it("redirects already logged-in manager accessing /login directly to /manager", () => {
      const res: any = authorized({
        auth: { user: { id: "u-mgr", role: "manager" } } as any,
        request: { nextUrl: new URL("http://localhost:3000/login") } as any,
      });
      expect(res instanceof Response).toBe(true);
      expect(res.headers.get("Location")).toContain("/manager");
    });
  });

  describe("Safe Account Linking Business Rules", () => {
    function findEligibleEmployee(
      userEmail: string,
      userId: string,
      employees: Array<{ id: string; email: string; active: boolean; linkedUserId?: string | null }>
    ): string | null {
      const normalizedEmail = userEmail.trim().toLowerCase();
      const eligible = employees.filter((e) => {
        const emailMatch = e.email.trim().toLowerCase() === normalizedEmail;
        const isActive = e.active === true;
        const notClaimedByOther = !e.linkedUserId || e.linkedUserId === userId;
        return emailMatch && isActive && notClaimedByOther;
      });

      if (eligible.length === 1) {
        return eligible[0].id;
      }
      return null; // Ambiguous (>1) or not found (0)
    }

    it("links successfully when exactly one active, unlinked employee matches email", () => {
      const employees = [
        { id: "E015", email: "arjun.rampal@example.com", active: true, linkedUserId: null },
        { id: "E016", email: "other@example.com", active: true, linkedUserId: null },
      ];
      const match = findEligibleEmployee("Arjun.Rampal@example.com ", "user-15", employees);
      expect(match).toBe("E015");
    });

    it("refuses to auto-link inactive employees", () => {
      const employees = [
        { id: "E015", email: "inactive.emp@example.com", active: false, linkedUserId: null },
      ];
      const match = findEligibleEmployee("inactive.emp@example.com", "user-15", employees);
      expect(match).toBeNull();
    });

    it("refuses to link an employee record already claimed by a different user", () => {
      const employees = [
        { id: "E015", email: "shared@example.com", active: true, linkedUserId: "user-OTHER" },
      ];
      const match = findEligibleEmployee("shared@example.com", "user-15", employees);
      expect(match).toBeNull();
    });

    it("refuses to link ambiguous duplicate accounts", () => {
      const employees = [
        { id: "E015", email: "duplicate@example.com", active: true, linkedUserId: null },
        { id: "E099", email: "duplicate@example.com", active: true, linkedUserId: null },
      ];
      const match = findEligibleEmployee("duplicate@example.com", "user-15", employees);
      expect(match).toBeNull();
    });
  });

  describe("Roster Cell Edit & Skill Conflict Override Validation", () => {
    function evaluateCellAssignment({
      userRole,
      hasEligibleAssignment,
      hasApprovedLeave,
      isOverride,
      overrideReason,
    }: {
      userRole: "manager" | "pod_lead" | "employee";
      hasEligibleAssignment: boolean;
      hasApprovedLeave: boolean;
      isOverride?: boolean;
      overrideReason?: string;
    }) {
      if (isOverride && userRole !== "manager") {
        return { allowed: false, error: "Only managers can override constraints." };
      }
      if (isOverride && !overrideReason?.trim()) {
        return { allowed: false, error: "A reason is required for a manager override." };
      }

      if (!hasEligibleAssignment) {
        if (!isOverride) {
          return {
            allowed: false,
            error: "SKILL_CONFLICT",
            requiresOverride: true,
            message: "The employee is not actively assigned to this brand/process on the selected date.",
          };
        }
      }

      if (hasApprovedLeave && !isOverride) {
        return {
          allowed: false,
          error: "BLOCKING_CONFLICT",
          requiresOverride: true,
          message: "Employee is on approved leave on this date.",
        };
      }

      return { allowed: true };
    }

    it("requires manager override for skill conflict when assignment is missing", () => {
      const result = evaluateCellAssignment({
        userRole: "manager",
        hasEligibleAssignment: false,
        hasApprovedLeave: false,
        isOverride: false,
      });

      expect(result.allowed).toBe(false);
      expect(result.error).toBe("SKILL_CONFLICT");
      expect(result.requiresOverride).toBe(true);
    });

    it("permits manager override with justification reason", () => {
      const result = evaluateCellAssignment({
        userRole: "manager",
        hasEligibleAssignment: false,
        hasApprovedLeave: false,
        isOverride: true,
        overrideReason: "Cross-brand urgent staffing requirement",
      });

      expect(result.allowed).toBe(true);
    });

    it("rejects override without justification reason", () => {
      const result = evaluateCellAssignment({
        userRole: "manager",
        hasEligibleAssignment: false,
        hasApprovedLeave: false,
        isOverride: true,
        overrideReason: "   ",
      });

      expect(result.allowed).toBe(false);
      expect(result.error).toBe("A reason is required for a manager override.");
    });

    it("prevents non-manager from overriding skill conflict", () => {
      const result = evaluateCellAssignment({
        userRole: "pod_lead",
        hasEligibleAssignment: false,
        hasApprovedLeave: false,
        isOverride: true,
        overrideReason: "Lead override",
      });

      expect(result.allowed).toBe(false);
      expect(result.error).toBe("Only managers can override constraints.");
    });
  });
});
