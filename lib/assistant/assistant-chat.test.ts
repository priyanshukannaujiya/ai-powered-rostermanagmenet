import { describe, it, expect } from "vitest";
import {
  isConversationalGreeting,
  isExplicitLeaveApprovalRequest,
  isExplicitNotificationRequest,
} from "./intent";
import { checkToolAccess } from "./rbac";

describe("AI Operations Assistant - Dual Mode & RBAC Matrix", () => {
  describe("Conversational vs Operational Mode Classification", () => {
    it("recognizes common conversational greetings without triggering tool calls", () => {
      const greetings = [
        "Hello",
        "Hi",
        "Hey",
        "Good morning",
        "good afternoon",
        "Good evening",
        "Howdy",
        "What can you do?",
        "Who are you",
      ];

      for (const greeting of greetings) {
        expect(isConversationalGreeting(greeting)).toBe(true);
      }
    });

    it("does not classify specific data queries as greetings", () => {
      const queries = [
        "What are the conflicts for Lumora Skincare?",
        "Show me the schedule for Alex Smith",
        "Check system health for November 2026",
        "Approve Priya's leave request",
        "Find backups for Urban Botanics",
      ];

      for (const query of queries) {
        expect(isConversationalGreeting(query)).toBe(false);
      }
    });
  });

  describe("Sensitive Action Intent Guardrails", () => {
    it("rejects tentative or hypothetical leave questions from triggering leave approvals", () => {
      expect(isExplicitLeaveApprovalRequest("What happens if I approve Priya's leave?")).toBe(false);
      expect(isExplicitLeaveApprovalRequest("Should I approve this leave request?")).toBe(false);
      expect(isExplicitLeaveApprovalRequest("Do not approve Priya's leave")).toBe(false);
    });

    it("approves direct and imperative manager leave approval commands", () => {
      expect(isExplicitLeaveApprovalRequest("Approve leave request for Priya")).toBe(true);
      expect(isExplicitLeaveApprovalRequest("Please approve this leave request")).toBe(true);
    });

    it("requires explicit manager confirmation before sending notifications", () => {
      expect(isExplicitNotificationRequest("Should I notify the employee?")).toBe(false);
      expect(isExplicitNotificationRequest("Do not notify the employee")).toBe(false);
      expect(isExplicitNotificationRequest("Yes", "Would you like me to notify Alex Smith?")).toBe(true);
      expect(isExplicitNotificationRequest("Please notify the employee about this change")).toBe(true);
    });
  });

  describe("Role-Based Access Control for AI Tools", () => {
    it("allows employees only to access employee-scoped tools", () => {
      expect(checkToolAccess("get_employee_schedule", "employee").allowed).toBe(true);
      expect(checkToolAccess("get_leave_requests", "employee").allowed).toBe(true);
      expect(checkToolAccess("get_roster_configuration", "employee").allowed).toBe(true);

      // Forbidden for employees
      expect(checkToolAccess("get_system_health", "employee").allowed).toBe(false);
      expect(checkToolAccess("get_pod_workload", "employee").allowed).toBe(false);
      expect(checkToolAccess("get_spof_risks", "employee").allowed).toBe(false);
      expect(checkToolAccess("assign_replacement_employee", "employee").allowed).toBe(false);
      expect(checkToolAccess("find_backups", "employee").allowed).toBe(false);
      expect(checkToolAccess("approve_leave", "employee").allowed).toBe(false);
      expect(checkToolAccess("get_import_summary", "employee").allowed).toBe(false);
    });

    it("restricts pod leads from accessing org-wide manager tools", () => {
      expect(checkToolAccess("get_system_health", "pod_lead").allowed).toBe(false);
      expect(checkToolAccess("get_pod_workload", "pod_lead").allowed).toBe(false);
      expect(checkToolAccess("get_spof_risks", "pod_lead").allowed).toBe(false);
      expect(checkToolAccess("find_backups", "pod_lead").allowed).toBe(false);
      expect(checkToolAccess("assign_replacement_employee", "pod_lead").allowed).toBe(false);
      expect(checkToolAccess("get_import_summary", "pod_lead").allowed).toBe(false);

      // Allowed for pod leads
      expect(checkToolAccess("get_pending_leaves", "pod_lead").allowed).toBe(true);
      expect(checkToolAccess("get_conflicts", "pod_lead").allowed).toBe(true);
      expect(checkToolAccess("get_employee_schedule", "pod_lead").allowed).toBe(true);
    });

    it("allows managers to access all tools", () => {
      const allTools = [
        "get_system_health",
        "get_pod_workload",
        "get_spof_risks",
        "get_pending_leaves",
        "get_leave_requests",
        "approve_leave",
        "find_backups",
        "get_employee_schedule",
        "get_conflicts",
        "check_leave_impact_and_conflicts",
        "assign_replacement_employee",
        "notify_employee",
        "get_import_summary",
        "get_roster_configuration",
        "list_brands",
        "list_processes",
        "get_pod_members",
        "get_import_errors",
        "get_latest_import",
      ];

      for (const tool of allTools) {
        expect(checkToolAccess(tool, "manager").allowed).toBe(true);
      }
    });
  });
});

