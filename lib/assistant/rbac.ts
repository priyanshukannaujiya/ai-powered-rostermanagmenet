export const EMPLOYEE_SCOPED_TOOLS = new Set([
  "get_employee_schedule",
  "get_leave_requests",
  "get_roster_configuration",
]);

export const MANAGER_ONLY_TOOLS = new Set([
  "get_system_health",
  "get_system_analysis",
  "get_pod_workload",
  "get_pod_analysis",
  "get_spof_risks",
  "find_backups",
  "get_import_summary",
  "get_import_errors",
  "get_latest_import",
  "list_brands",
  "list_processes",
  "get_pod_members",
  "assign_replacement_employee",
]);

export interface ToolAccessCheck {
  allowed: boolean;
  error?: string;
  denied?: boolean;
}

export function checkToolAccess(toolName: string, userRole: string): ToolAccessCheck {
  if (userRole === "employee" && !EMPLOYEE_SCOPED_TOOLS.has(toolName)) {
    return {
      allowed: false,
      denied: true,
      error: "This operation is not available for employee accounts.",
    };
  }

  if (userRole === "pod_lead" && MANAGER_ONLY_TOOLS.has(toolName)) {
    return {
      allowed: false,
      denied: true,
      error: "This operation is restricted to managers.",
    };
  }

  return { allowed: true };
}
