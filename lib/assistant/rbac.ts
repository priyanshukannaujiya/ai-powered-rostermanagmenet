const EMPLOYEE_SCOPED_TOOLS = new Set(["get_employee_schedule", "get_leave_requests", "get_roster_configuration"]);

const POD_LEAD_SCOPED_TOOLS = new Set([
  "get_pending_leaves",
  "get_leave_queue_analysis",
  "get_leave_requests",
  "get_employee_schedule",
  "get_roster_configuration",
  "get_conflicts",
  "approve_leave",
]);

const MANAGER_TOOLS = new Set([
  "get_system_health", "get_system_analysis",
  "get_pod_workload", "get_pod_analysis", "get_spof_risks",
  "get_pending_leaves", "get_leave_queue_analysis", "get_leave_requests",
  "approve_leave", "find_backups", "get_employee_schedule", "get_conflicts",
  "check_leave_impact_and_conflicts", "assign_replacement_employee", "notify_employee",
  "get_import_summary", "get_import_errors", "get_latest_import",
  "get_roster_configuration", "list_brands", "list_processes", "get_pod_members",
]);

export interface ToolAccessCheck {
  allowed: boolean;
  error?: string;
  denied?: boolean;
}

export function checkToolAccess(toolName: string, userRole: string): ToolAccessCheck {
  const allowed =
    (userRole === "manager" && MANAGER_TOOLS.has(toolName)) ||
    (userRole === "pod_lead" && POD_LEAD_SCOPED_TOOLS.has(toolName)) ||
    (userRole === "employee" && EMPLOYEE_SCOPED_TOOLS.has(toolName));

  if (!allowed) {
    return {
      allowed: false,
      denied: true,
      error: "This operation is not available for your account role.",
    };
  }

  return { allowed: true };
}