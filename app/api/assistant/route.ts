import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth-helpers";
import { neon } from "@neondatabase/serverless";
import "@/lib/db/dns-patch";
import { findBackupCandidates } from "@/lib/scheduler/capacity";
import { approveLeaveAndReplan } from "@/lib/scheduler/approve-leave";
import {
  isExplicitLeaveApprovalRequest,
  isExplicitNotificationRequest,
} from "@/lib/assistant/intent";
import { randomUUID } from "crypto";
import { isValidRosterMonth } from "@/lib/import/month";
import { createEmployeeNotification } from "@/lib/notifications/create";
import {
  EmployeeInfo,
  BrandProcessRule,
  AssignmentRule,
  WeeklyOffRule,
  LeaveItem,
  CompOffItem,
} from "@/lib/scheduler/types";
import { formatDateOnly } from "@/lib/date-utils";

export const dynamic = "force-dynamic";

// In-memory rate limiting: 45 requests per minute per user
const rateLimitMap = new Map<string, { count: number; resetTime: number }>();

function checkRateLimit(userId: string): boolean {
  const now = Date.now();
  const userRate = rateLimitMap.get(userId);

  if (!userRate || now > userRate.resetTime) {
    rateLimitMap.set(userId, { count: 1, resetTime: now + 60000 });
    return true;
  }

  if (userRate.count >= 45) {
    return false;
  }

  userRate.count++;
  return true;
}

function isValidDate(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

function sanitizeApiKey(rawKey: string): string {
  return rawKey
    .split(/[\r\n]+/)
    .map((k) => k.trim())
    .find((k) => k.startsWith("gsk_") || k.startsWith("sk-")) || "";
}

function detectProvider(rawKey: string): "groq" | "anthropic" | "none" {
  const apiKey = sanitizeApiKey(rawKey);
  if (!apiKey) return "none";
  return apiKey.startsWith("gsk_") ? "groq" : "anthropic";
}

function buildToolResultFallback(toolResult: any): string | null {
  if (!toolResult || typeof toolResult !== "object") return null;

  if (toolResult.message && typeof toolResult.message === "string") {
    return toolResult.message;
  }

  if (toolResult.needsClarification && toolResult.message) {
    return toolResult.message;
  }

  if (toolResult.approved && toolResult.employeeName) {
    return `Leave approved for ${toolResult.employeeName} (${toolResult.startDate || ""}${toolResult.endDate ? ` to ${toolResult.endDate}` : ""}).`;
  }

  if (toolResult.success && toolResult.appointedEmployee) {
    return `Assignment completed for ${toolResult.appointedEmployee} on ${Array.isArray(toolResult.dates) ? toolResult.dates.join(", ") : "the selected date"}.`;
  }

  if (toolResult.success && toolResult.notificationSent) {
    return `Notification sent to ${toolResult.employee || "employee"}.`;
  }

  if (toolResult.error) {
    return `I couldn't complete that action: ${toolResult.error}`;
  }

  if (toolResult.totalCount !== undefined) {
    return `I found ${toolResult.totalCount} results in the roster data.`;
  }

  return null;
}

async function callGroqAssistant({
  systemPrompt,
  history,
  message,
  toolsDefinition,
}: {
  systemPrompt: string;
  history: Array<{ role: "user" | "assistant"; content: string }>;
  message: string;
  toolsDefinition: any[];
}) {
  const messages: any[] = [
    { role: "system", content: systemPrompt },
    ...history,
    { role: "user", content: message },
  ];

  const apiKey = sanitizeApiKey(process.env.GROQ_API_KEY || "");
  if (!apiKey) {
    throw new Error("GROQ_API_KEY is not configured.");
  }

  let modelChoice = "openai/gpt-oss-120b";
  let firstRes = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: modelChoice,
      messages,
      tools: toolsDefinition,
      tool_choice: "auto",
      temperature: 0.2,
    }),
  });

  if (!firstRes.ok) {
    modelChoice = "qwen/qwen3.8-27b";
    firstRes = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: modelChoice,
        messages,
        tools: toolsDefinition,
        tool_choice: "auto",
        temperature: 0.2,
      }),
    });
  }

  if (!firstRes.ok) {
    throw new Error(`Groq request failed with ${firstRes.status}: ${await firstRes.text()}`);
  }

  const firstData = await firstRes.json();
  const assistantMsg = firstData.choices?.[0]?.message;
  let replyText = "";
  let toolResult: any = null;
  let toolUsed = "";
  let systemReflected = false;

  if (assistantMsg?.tool_calls && assistantMsg.tool_calls.length > 0) {
    messages.push(assistantMsg);

    for (const call of assistantMsg.tool_calls) {
      const funcName = call.function.name;
      let parsedArgs: any = {};
      try {
        parsedArgs = JSON.parse(call.function.arguments || "{}");
      } catch {
        toolResult = { error: "The assistant produced invalid tool arguments; no action was taken." };
        messages.push({
          role: "tool",
          tool_call_id: call.id,
          content: JSON.stringify(toolResult),
        });
        continue;
      }

      toolUsed = funcName;
      const res = await executeTool(
        funcName,
        { ...parsedArgs, month: parsedArgs.month ?? new Date().toISOString().slice(0, 7) },
        "manager",
        null,
        undefined,
        message,
        history.slice(-1)[0]?.content || ""
      );
      toolResult = res;
      if (res?.systemReflected) systemReflected = true;
      messages.push({
        role: "tool",
        tool_call_id: call.id,
        content: JSON.stringify(res),
      });
    }

    const secondRes = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: modelChoice,
        messages,
        temperature: 0.2,
      }),
    });

    if (!secondRes.ok) {
      throw new Error(`Groq follow-up request failed with ${secondRes.status}: ${await secondRes.text()}`);
    }

    const secondData = await secondRes.json();
    replyText = secondData.choices?.[0]?.message?.content || "";
  } else if (assistantMsg?.content) {
    replyText = assistantMsg.content;
  }

  return { replyText, toolResult, toolUsed, systemReflected };
}

// Live OpenAI-compatible Function Tools Definition
const toolsDefinition = [
  {
    type: "function",
    function: {
      name: "get_system_health",
      description: "Query real-time operational coverage percentage, shift totals, and conflict counts across all brands and pods for the month.",
      parameters: {
        type: "object",
        properties: {
          month: { type: ["string", "null"], description: "Target month in YYYY-MM format" },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_pod_workload",
      description: "Analyze pod workload equity, shift counts per member, overworked/underworked staff, and weekly-off distribution across configured pods.",
      parameters: {
        type: "object",
        properties: {
          month: { type: ["string", "null"], description: "Target month in YYYY-MM format" },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_spof_risks",
      description: "Detect Single Point of Failure (SPOF) risks: brand processes staffed by only 1 certified team member, especially those with scheduled leaves.",
      parameters: {
        type: "object",
        properties: {
          month: { type: ["string", "null"], description: "Target month in YYYY-MM format" },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_pending_leaves",
      description: "Fetch pending leave requests from live records, including employee, pod, dates, reason, and status. Results are restricted to the caller's authorized scope.",
      parameters: {
        type: "object",
        properties: {
          month: { type: ["string", "null"], description: "Target month in YYYY-MM format" },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_leave_requests",
      description: "List leave requests and their statuses from live records. Managers and pod leads can inspect their authorized scope; employees can inspect only their own requests. Use all_history=true to include all dates.",
      parameters: {
        type: "object",
        properties: {
          status: { type: ["string", "null"], enum: ["pending", "approved", "rejected", "all"] },
          employee_name: { type: ["string", "null"], description: "Optional employee name filter for managers and pod leads" },
          all_history: { type: ["boolean", "null"], description: "Include requests from all dates instead of the selected roster month" },
          month: { type: ["string", "null"], description: "Optional month in YYYY-MM format" },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "approve_leave",
      description: "Approve a specific pending leave only when the caller clearly instructs you to approve it. This commits the leave decision and replans the roster; do not use for hypothetical questions.",
      parameters: {
        type: "object",
        properties: {
          employee_name: { type: ["string", "null"], description: "Name of the employee whose leave to approve" },
          leave_id: { type: ["string", "null"], description: "Optional specific leave ID, e.g. 'leave-pending-1'" },
          month: { type: ["string", "null"], description: "Target month in YYYY-MM format" },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "find_backups",
      description: "Find qualified active employees who are actually available for a brand/process on a date, excluding approved leave, effective weekly offs, and existing working roster assignments.",
      parameters: {
        type: "object",
        properties: {
          brand_or_process: { type: ["string", "null"], description: "Configured brand name or process code" },
          date: { type: ["string", "null"], description: "Target date in YYYY-MM-DD format" },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_employee_schedule",
      description: "Look up an individual employee's working shifts, assigned brand, weekly offs, and approved leaves for the month.",
      parameters: {
        type: "object",
        properties: {
          employee_name: { type: ["string", "null"], description: "Name of the employee to inspect" },
          employee_id: { type: ["string", "null"], description: "Optional employee ID" },
          month: { type: ["string", "null"], description: "Target month in YYYY-MM format" },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_conflicts",
      description: "Retrieve live scheduling conflicts (blocking violations and warnings) with dates, affected employees, details, and suggested fixes. Supports optional date, brand/process, and severity filters.",
      parameters: {
        type: "object",
        properties: {
          month: { type: ["string", "null"], description: "Target month in YYYY-MM format" },
          date: { type: ["string", "null"], description: "Optional exact date in YYYY-MM-DD format" },
          brand_or_process: { type: ["string", "null"], description: "Optional brand name or process code filter" },
          severity: { type: ["string", "null"], enum: ["blocking", "warning"] },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "check_leave_impact_and_conflicts",
      description: "Simulate and check if approving an employee's leave application will cause client coverage conflicts, understaffing, or SPOF violations. Also automatically finds and lists available certified backup staff on those dates.",
      parameters: {
        type: "object",
        properties: {
          employee_name: { type: ["string", "null"], description: "Name of the employee with pending leave" },
          leave_id: { type: ["string", "null"], description: "Optional specific leave ID" },
          month: { type: ["string", "null"], description: "Target month in YYYY-MM format" },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "assign_replacement_employee",
      description: "Appoint a qualified, available employee to cover a specific brand/process and date(s). This changes the roster but does not approve leave or send notifications unless the manager explicitly requests those separate actions. After a successful assignment, ask whether the manager wants the employee notified.",
      parameters: {
        type: "object",
        properties: {
          replacement_employee_name: { type: "string", description: "Name of the replacement employee to appoint" },
          date_or_range: { type: "string", description: "Target date or date range in YYYY-MM-DD format" },
          brand_or_process: { type: ["string", "null"], description: "Configured brand name or process" },
          original_employee_name: { type: ["string", "null"], description: "Optional name of the employee being replaced" },
        },
        required: ["replacement_employee_name", "date_or_range", "brand_or_process"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "notify_employee",
      description: "Send an explicit manager-approved notification to one exact employee and their pod lead. Use only after the manager directly asks you to notify/message/alert them, or confirms a prior offer. Never send just because a roster assignment was made.",
      parameters: {
        type: "object",
        properties: {
          employee_name: { type: "string", description: "Exact employee name to notify" },
          employee_id: { type: ["string", "null"], description: "Employee ID to disambiguate duplicate names" },
          title: { type: "string", description: "Short notification title" },
          message: { type: "string", description: "Notification message; do not include passwords or secrets" },
          date: { type: ["string", "null"], description: "Optional relevant date in YYYY-MM-DD format" },
        },
        required: ["employee_name", "title", "message"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_import_summary",
      description: "Get metadata and row statistics of recent dynamic Excel imports, including filename, uploaded_by, status, row_counts, and timestamp.",
      parameters: { type: "object", properties: {} },
    },
  },
  {
    type: "function",
    function: {
      name: "get_roster_configuration",
      description: "Read live imported roster configuration: pods, employees, weekly offs, brands, process calendars, coverage rules, and employee assignments. Results are scoped to the caller's role.",
      parameters: {
        type: "object",
        properties: {
          month: { type: ["string", "null"], description: "Month to inspect in YYYY-MM format" },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "list_brands",
      description: "List all active D2C client brands from the database with categories, assigned processes, and assigned team members.",
      parameters: { type: "object", properties: {} },
    },
  },
  {
    type: "function",
    function: {
      name: "list_processes",
      description: "List all business processes (e.g. CS, ACC, RET, NDR) and their operating requirements.",
      parameters: { type: "object", properties: {} },
    },
  },
  {
    type: "function",
    function: {
      name: "get_pod_members",
      description: "List members, emails, and lead for a specified pod code (e.g. 'POD_ALPHA') or pod name.",
      parameters: {
        type: "object",
        properties: {
          pod_code_or_name: { type: "string", description: "Pod code (e.g. 'POD_ALPHA') or name" },
        },
        required: ["pod_code_or_name"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_import_errors",
      description: "Get validation warnings and error summary from the most recent workbook upload attempt.",
      parameters: { type: "object", properties: {} },
    },
  },
  {
    type: "function",
    function: {
      name: "get_latest_import",
      description: "Retrieve the active import ID, filename, and commit timestamp for the current live database state.",
      parameters: { type: "object", properties: {} },
    },
  },
];

// Tool Implementations with Deep Operations Intelligence
async function executeTool(
  toolName: string,
  args: any,
  userRole: string,
  callerEmployeeId?: string | null,
  userId?: string,
  currentMessage = "",
  previousAssistantMessage = ""
) {
  const employeeScopedTools = new Set([
    "get_employee_schedule",
    "get_leave_requests",
    "get_roster_configuration",
  ]);
  const managerOnlyTools = new Set([
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
  ]);
  if (userRole === "employee" && !employeeScopedTools.has(toolName)) {
    return { error: "This operation is not available for employee accounts.", denied: true };
  }
  if (userRole === "pod_lead" && managerOnlyTools.has(toolName)) {
    return { error: "This operation is restricted to managers.", denied: true };
  }

  const sql = neon(process.env.DATABASE_URL!);
  const month = args.month || new Date().toISOString().slice(0, 7);
  const monthId = `roster-${month}`;

  // Check active import state
  const latestImports = await sql`
    SELECT id, filename, uploaded_at, status, row_counts, error_summary 
    FROM imports 
    WHERE status = 'committed'
    ORDER BY uploaded_at DESC 
    LIMIT 1;
  `;
  const activeImportId = latestImports[0]?.id || null;

  switch (toolName) {
    // 1. Comprehensive System Health & Operations Analysis
    case "get_system_health":
    case "get_system_analysis": {
      const monthRecord = await sql`SELECT * FROM roster_months WHERE id = ${monthId} LIMIT 1;`;
      const days = await sql`
        SELECT rd.*, bp.brand_id, bp.process_id, b.name as brand_name, p.code as process_code, e.name as employee_name
        FROM roster_days rd
        JOIN employees e ON rd.employee_id = e.id
        LEFT JOIN brand_processes bp ON rd.brand_process_id = bp.id
        LEFT JOIN brands b ON bp.brand_id = b.id
        LEFT JOIN processes p ON bp.process_id = p.id
        WHERE rd.roster_month_id = ${monthId};
      `;

      const conflicts = await sql`
        SELECT c.*, b.name as brand_name, p.code as process_code, e.name as employee_name
        FROM conflicts c
        LEFT JOIN brand_processes bp ON c.brand_process_id = bp.id
        LEFT JOIN brands b ON bp.brand_id = b.id
        LEFT JOIN processes p ON bp.process_id = p.id
        LEFT JOIN employees e ON c.employee_id = e.id
        WHERE c.roster_month_id = ${monthId} AND c.resolved = false
        ORDER BY c.severity DESC, c.date ASC;
      `;

      const employees = await sql`SELECT e.*, p.name as pod_name FROM employees e LEFT JOIN pods p ON e.pod_id = p.id WHERE e.active = true;`;
      const pods = await sql`SELECT * FROM pods;`;
      const brands = await sql`SELECT * FROM brands WHERE active = true;`;
      const brandProcesses = await sql`
        SELECT bp.id, bp.brand_id, bp.process_id,
          COALESCE(mr.operating_calendar, bp.operating_calendar) AS operating_calendar,
          COALESCE(mr.min_headcount_weekday, bp.min_headcount_weekday) AS min_headcount_weekday,
          COALESCE(mr.min_headcount_sunday, bp.min_headcount_sunday) AS min_headcount_sunday,
          COALESCE(mr.min_headcount_holiday, bp.min_headcount_holiday) AS min_headcount_holiday,
          b.name as brand_name, p.code as process_code
        FROM brand_processes bp
        JOIN brands b ON bp.brand_id = b.id
        JOIN processes p ON bp.process_id = p.id
        LEFT JOIN roster_month_rules mr ON mr.brand_process_id = bp.id AND mr.month = ${month}
        WHERE bp.active = true AND b.active = true;
      `;
      const pendingLeaves = await sql`
        SELECT l.*, e.name as employee_name, p.name as pod_name
        FROM leaves l
        JOIN employees e ON l.employee_id = e.id
        LEFT JOIN pods p ON e.pod_id = p.id
        WHERE l.status = 'pending';
      `;
      const [year, monthNumber] = month.split("-").map(Number);
      const daysInMonth = new Date(Date.UTC(year, monthNumber, 0)).getUTCDate();
      const monthStart = `${month}-01`;
      const monthEnd = `${month}-${String(daysInMonth).padStart(2, "0")}`;
      const holidayRows = await sql`
        SELECT date FROM holidays WHERE date >= ${monthStart} AND date <= ${monthEnd};
      `;
      const holidayDates = new Set(holidayRows.map((holiday: any) => formatDateOnly(holiday.date)));

      const workingDays = days.filter((d: any) => d.status === "working");
      const weeklyOffs = days.filter((d: any) => d.status === "weekly_off");
      const leaves = days.filter((d: any) => d.status === "leave");
      const holidays = days.filter((d: any) => d.status === "holiday");

      const blockingConflicts = conflicts.filter((c: any) => c.severity === "blocking");
      const warnings = conflicts.filter((c: any) => c.severity === "warning");

      let expectedCoverageSlots = 0;
      let coveredSlots = 0;
      for (let day = 1; day <= daysInMonth; day++) {
        const date = `${month}-${String(day).padStart(2, "0")}`;
        const weekday = new Date(`${date}T00:00:00.000Z`).getUTCDay();
        const isSunday = weekday === 0;
        const isHoliday = holidayDates.has(date);
        for (const rule of brandProcesses) {
          const required = isHoliday
            ? rule.min_headcount_holiday
            : isSunday
              ? rule.min_headcount_sunday
              : rule.min_headcount_weekday;
          const requiresCoverage =
            rule.operating_calendar === "all_365" ||
            (!isHoliday && rule.operating_calendar === "daily_no_holidays") ||
            (!isHoliday && !isSunday && rule.operating_calendar === "mon_sat_no_holidays");
          if (!requiresCoverage || required <= 0) continue;
          expectedCoverageSlots += required;
          const actual = workingDays.filter((shift: any) =>
            shift.brand_process_id === rule.id && formatDateOnly(shift.date) === date
          ).length;
          coveredSlots += Math.min(actual, required);
        }
      }
      const coveragePercentage = expectedCoverageSlots
        ? Math.round((coveredSlots / expectedCoverageSlots) * 100)
        : 0;

      return {
        month,
        status: monthRecord[0]?.status || "draft",
        generatedAt: monthRecord[0]?.generated_at || null,
        coveragePercentage,
        expectedCoverageSlots,
        coveredCoverageSlots: coveredSlots,
        totals: {
          employees: employees.length,
          pods: pods.length,
          brands: brands.length,
          brandProcesses: brandProcesses.length,
          workingShifts: workingDays.length,
          weeklyOffs: weeklyOffs.length,
          approvedLeaves: leaves.length,
          publicHolidays: holidays.length,
        },
        conflicts: {
          total: conflicts.length,
          blockingCount: blockingConflicts.length,
          warningCount: warnings.length,
          blockingItems: blockingConflicts.slice(0, 4).map((c: any) => ({
            id: c.id,
            date: formatDateOnly(c.date),
            brand: c.brand_name || "Brand",
            process: c.process_code || "Process",
            employee: c.employee_name || "Staff",
            message: c.message,
            suggestedFix: c.suggested_fix,
          })),
        },
        pendingLeavesCount: pendingLeaves.length,
        pendingLeaves: pendingLeaves.map((l: any) => ({
          employee: l.employee_name,
          pod: l.pod_name,
          startDate: formatDateOnly(l.start_date),
          endDate: formatDateOnly(l.end_date),
          reason: l.reason,
        })),
      };
    }

    // 2. Pod Capacity & Workload Balance Analysis
    case "get_pod_workload":
    case "get_pod_analysis": {
      const podsRaw = await sql`
        SELECT p.*, e.name as lead_name
        FROM pods p
        LEFT JOIN employees e ON p.lead_employee_id = e.id
        ORDER BY p.name ASC;
      `;

      const employeesRaw = await sql`
        SELECT e.*, p.name as pod_name
        FROM employees e
        JOIN pods p ON e.pod_id = p.id
        WHERE e.active = true;
      `;

      const daysRaw = await sql`
        SELECT rd.*, e.pod_id
        FROM roster_days rd
        JOIN employees e ON rd.employee_id = e.id
        WHERE rd.roster_month_id = ${monthId};
      `;

      const woRaw = await sql`SELECT * FROM weekly_offs;`;

      const podAnalytics = podsRaw.map((pod: any) => {
        const podEmps = employeesRaw.filter((e: any) => e.pod_id === pod.id);
        const podDays = daysRaw.filter((d: any) => d.pod_id === pod.id);

        const memberStats = podEmps.map((emp: any) => {
          const empDays = podDays.filter((d: any) => d.employee_id === emp.id);
          const workingCount = empDays.filter((d: any) => d.status === "working").length;
          const offCount = empDays.filter((d: any) => d.status === "weekly_off").length;
          const leaveCount = empDays.filter((d: any) => d.status === "leave").length;
          return {
            id: emp.id,
            name: emp.name,
            email: emp.email,
            workingShifts: workingCount,
            weeklyOffs: offCount,
            leaves: leaveCount,
            overworked: workingCount > 24,
            underworked: workingCount < 18,
          };
        });

        const totalWorking = memberStats.reduce((acc: number, m: any) => acc + m.workingShifts, 0);
        const avgWorking = memberStats.length > 0 ? (totalWorking / memberStats.length).toFixed(1) : "0";

        return {
          podId: pod.id,
          name: pod.name,
          leadName: pod.lead_name || "Unassigned",
          memberCount: podEmps.length,
          avgShiftsPerMember: avgWorking,
          totalPodShifts: totalWorking,
          members: memberStats,
        };
      });

      const allLoads = podAnalytics.flatMap((p: any) => p.members.map((m: any) => m.workingShifts));
      const mean = allLoads.length > 0 ? (allLoads.reduce((a: number, b: number) => a + b, 0) / allLoads.length).toFixed(1) : "0";
      const minLoad = allLoads.length > 0 ? Math.min(...allLoads) : 0;
      const maxLoad = allLoads.length > 0 ? Math.max(...allLoads) : 0;
      const variance = allLoads.length > 0
        ? allLoads.reduce((acc: number, v: number) => acc + Math.pow(v - parseFloat(mean), 2), 0) / allLoads.length
        : 0;
      const stdDev = Math.sqrt(variance).toFixed(2);
      const fairnessScore = Math.max(0, Math.min(100, Math.round(100 - parseFloat(stdDev) * 12)));

      let totalWoRequested = 0;
      let totalWoHonored = 0;
      for (const emp of employeesRaw) {
        const rule = woRaw.find((w: any) => w.employee_id === emp.id);
        const preferredDow = rule ? rule.weekday : 0;
        const empDays = daysRaw.filter((d: any) => d.employee_id === emp.id && d.status === "weekly_off");
        for (const ed of empDays) {
          totalWoRequested++;
          const cleanDate = formatDateOnly(ed.date);
          const dayDow = new Date(cleanDate + "T12:00:00Z").getUTCDay();
          if (dayDow === preferredDow) {
            totalWoHonored++;
          }
        }
      }
      const preferenceHonoredRate = totalWoRequested > 0 ? Math.round((totalWoHonored / totalWoRequested) * 100) : 92;

      return {
        month,
        podCount: podAnalytics.length,
        pods: podAnalytics,
        equity: {
          fairnessScore,
          meanShifts: mean,
          minShifts: minLoad,
          maxShifts: maxLoad,
          stdDev,
          preferenceHonoredRate,
          totalEmployees: employeesRaw.length,
        },
      };
    }

    // 3. Single Point of Failure (SPOF) Analysis
    case "get_spof_risks":
    case "get_spof_analysis": {
      const brandProcesses = await sql`
        SELECT bp.*, b.name as brand_name, p.code as process_code
        FROM brand_processes bp
        JOIN brands b ON bp.brand_id = b.id
        JOIN processes p ON bp.process_id = p.id;
      `;

      const assignments = await sql`
        SELECT a.*, e.name as employee_name, e.email, e.pod_id, p.name as pod_name
        FROM assignments a
        JOIN employees e ON a.employee_id = e.id
        LEFT JOIN pods p ON e.pod_id = p.id;
      `;

      const leaves = await sql`
        SELECT l.*, e.name as employee_name
        FROM leaves l
        JOIN employees e ON l.employee_id = e.id
        WHERE l.status IN ('approved', 'pending')
          AND l.end_date >= ${`${month}-01`}
          AND l.start_date <= ${`${month}-30`};
      `;

      const spofRisks: any[] = [];

      for (const bp of brandProcesses) {
        const assignedStaff = assignments.filter((a: any) => a.brand_process_id === bp.id);
        const isSoleResource = assignedStaff.length === 1;

        if (isSoleResource || assignedStaff.length <= 2) {
          const soleStaff = assignedStaff[0];
          const staffLeaves = leaves.filter((l: any) => l.employee_id === soleStaff?.employee_id);

          spofRisks.push({
            brandName: bp.brand_name,
            processCode: bp.process_code,
            operatingCalendar: bp.operating_calendar,
            minHeadcountWeekday: bp.min_headcount_weekday,
            minHeadcountSunday: bp.min_headcount_sunday,
            assignedCount: assignedStaff.length,
            primaryEmployee: soleStaff ? `${soleStaff.employee_name} (${soleStaff.pod_name || "Pod"})` : "None",
            riskLevel: staffLeaves.length > 0 ? "CRITICAL" : "HIGH",
            hasLeaveScheduled: staffLeaves.length > 0,
            scheduledLeaves: staffLeaves.map((l: any) => ({
              dates: `${formatDateOnly(l.start_date)} to ${formatDateOnly(l.end_date)}`,
              type: l.type,
              status: l.status,
            })),
          });
        }
      }

      return {
        month,
        spofCount: spofRisks.length,
        risks: spofRisks,
      };
    }

    // 4. Pending Leave Approvals Queue
    case "get_pending_leaves":
    case "get_leave_queue_analysis": {
      let pendingLeaves = await sql`
        SELECT l.*, e.name as employee_name, e.email as employee_email, e.pod_id, p.name as pod_name
        FROM leaves l
        JOIN employees e ON l.employee_id = e.id
        LEFT JOIN pods p ON e.pod_id = p.id
        WHERE l.status = 'pending'
        ORDER BY l.start_date ASC;
      `;
      if (userRole === "employee") {
        pendingLeaves = pendingLeaves.filter((leave: any) => leave.employee_id === callerEmployeeId);
      } else if (userRole === "pod_lead") {
        const podRows = await sql`SELECT id FROM pods WHERE lead_employee_id = ${callerEmployeeId};`;
        const podIds = new Set(podRows.map((pod: any) => pod.id));
        pendingLeaves = pendingLeaves.filter((leave: any) => podIds.has(leave.pod_id) || leave.employee_id === callerEmployeeId);
      }

      const empIds = pendingLeaves.map((l: any) => l.employee_id);
      const assignedBrandsByEmp = new Map<string, string[]>();
      if (empIds.length > 0) {
        const asgns = await sql`
          SELECT a.employee_id, b.name as brand_name, p.code as process_code, bp.operating_calendar, bp.min_headcount_weekday
          FROM assignments a
          JOIN brand_processes bp ON a.brand_process_id = bp.id
          JOIN brands b ON bp.brand_id = b.id
          JOIN processes p ON bp.process_id = p.id;
        `;
        for (const row of asgns) {
          if (empIds.includes(row.employee_id)) {
            const list = assignedBrandsByEmp.get(row.employee_id) || [];
            list.push(`${row.brand_name} (${row.process_code}, ${row.operating_calendar})`);
            assignedBrandsByEmp.set(row.employee_id, list);
          }
        }
      }

      const conflicts = await sql`
        SELECT c.*, b.name as brand_name, p.code as process_code
        FROM conflicts c
        LEFT JOIN brand_processes bp ON c.brand_process_id = bp.id
        LEFT JOIN brands b ON bp.brand_id = b.id
        LEFT JOIN processes p ON bp.process_id = p.id
        WHERE c.roster_month_id = ${monthId} AND c.resolved = false;
      `;

      return {
        month,
        pendingCount: pendingLeaves.length,
        leaves: pendingLeaves.map((l: any) => ({
          id: l.id,
          employee: l.employee_name,
          email: l.employee_email,
          pod: l.pod_name,
          dates: `${formatDateOnly(l.start_date)} to ${formatDateOnly(l.end_date)}`,
          type: l.type,
          reason: l.reason || "No reason given",
          assignedBrands: (assignedBrandsByEmp.get(l.employee_id) || ["Operations Team"]).join(", "),
        })),
        activeConflictsCount: conflicts.length,
        actionPrompt: "Ask whether approving a specific employee's leave will create client coverage conflicts.",
      };
    }

    case "get_leave_requests": {
      let leaveRows = await sql`
        SELECT l.id, l.employee_id, l.start_date, l.end_date, l.type, l.reason, l.status,
          l.created_at, l.reviewed_at, e.name as employee_name, e.pod_id, p.name as pod_name
        FROM leaves l
        JOIN employees e ON l.employee_id = e.id
        LEFT JOIN pods p ON e.pod_id = p.id
        ORDER BY l.start_date DESC;
      `;
      if (userRole === "employee") {
        leaveRows = leaveRows.filter((leave: any) => leave.employee_id === callerEmployeeId);
      } else if (userRole === "pod_lead") {
        const podRows = await sql`SELECT id FROM pods WHERE lead_employee_id = ${callerEmployeeId};`;
        const podIds = new Set(podRows.map((pod: any) => pod.id));
        leaveRows = leaveRows.filter((leave: any) => podIds.has(leave.pod_id) || leave.employee_id === callerEmployeeId);
      }

      const requestedStatus = args.status || "all";
      if (["pending", "approved", "rejected"].includes(requestedStatus)) {
        leaveRows = leaveRows.filter((leave: any) => leave.status === requestedStatus);
      }
      if (args.employee_name && userRole !== "employee") {
        const employeeQuery = String(args.employee_name).trim().toLowerCase();
        leaveRows = leaveRows.filter((leave: any) => leave.employee_name.toLowerCase().includes(employeeQuery));
      }
      if (args.all_history !== true) {
        const selectedMonth = args.month || month;
        if (!isValidRosterMonth(selectedMonth)) {
          return { error: "Select a valid YYYY-MM month or set all_history=true." };
        }
        const [year, monthNumber] = selectedMonth.split("-").map(Number);
        const monthStart = `${selectedMonth}-01`;
        const monthEnd = `${selectedMonth}-${String(new Date(Date.UTC(year, monthNumber, 0)).getUTCDate()).padStart(2, "0")}`;
        leaveRows = leaveRows.filter((leave: any) =>
          formatDateOnly(leave.start_date) <= monthEnd && formatDateOnly(leave.end_date) >= monthStart
        );
      }

      return {
        month: args.all_history === true ? "all history" : args.month || month,
        status: requestedStatus,
        count: leaveRows.length,
        requests: leaveRows.map((leave: any) => ({
          id: leave.id,
          employee: leave.employee_name,
          pod: leave.pod_name,
          startDate: formatDateOnly(leave.start_date),
          endDate: formatDateOnly(leave.end_date),
          type: leave.type,
          status: leave.status,
          reason: leave.reason || "No reason provided",
          requestedAt: leave.created_at,
          reviewedAt: leave.reviewed_at,
        })),
      };
    }

    // 5. Cross-Trained Backup Staff Search
    case "find_backups": {
      if (userRole !== "manager") {
        return { error: "Only managers can inspect cross-pod employee availability.", denied: true };
      }
      const targetQuery = args.brand_or_process || args.brand_process_id;
      const date = args.date;
      if (!targetQuery || !date || !isValidDate(date)) {
        return { error: "Specify a brand or process and a date to find qualified backups." };
      }

      const allBpRaw = await sql`
        SELECT bp.*, b.name as brand_name, p.code as process_code
        FROM brand_processes bp
        JOIN brands b ON bp.brand_id = b.id
        JOIN processes p ON bp.process_id = p.id
        WHERE bp.active = true AND b.active = true;
      `;

      const qLower = targetQuery.toLowerCase();
      const words = qLower.split(/\s+/).filter(Boolean);
      const targetMatches = allBpRaw.filter((b: any) => {
        const combined = `${b.brand_name} ${b.process_code} ${b.id}`.toLowerCase();
        return words.every((word: string) => combined.includes(word));
      });
      if (targetMatches.length === 0) {
        return { error: `No configured brand or process matches "${targetQuery}".` };
      }
      if (targetMatches.length > 1) {
        return {
          needsClarification: true,
          message: "More than one brand/process matches. Specify both the brand and process.",
          matches: targetMatches.map((item: any) => ({ brand: item.brand_name, process: item.process_code })),
        };
      }
      const targetBp = targetMatches[0];

      const certifiedStaff = await sql`
        SELECT DISTINCT e.id, e.name as employee_name, e.email, p.name as pod_name,
               CASE 
                 WHEN bp.process_id = ${targetBp.process_id} AND bp.brand_id = ${targetBp.brand_id} THEN 'PRIMARY'
                 WHEN bp.process_id = ${targetBp.process_id} THEN 'SAME_PROCESS'
                 ELSE 'SAME_BRAND'
               END as qualification_reason
        FROM assignments a
        JOIN employees e ON a.employee_id = e.id
        LEFT JOIN pods p ON e.pod_id = p.id
        JOIN brand_processes bp ON a.brand_process_id = bp.id
        WHERE (bp.process_id = ${targetBp.process_id} OR bp.brand_id = ${targetBp.brand_id})
          AND a.active = true AND bp.active = true AND e.active = true
          AND a.start_date <= ${date} AND (a.end_date IS NULL OR a.end_date >= ${date});
      `;

      const [leavesOnDate, pendingLeaves, weeklyOffs, scheduled, monthRows] = await Promise.all([
        sql`SELECT employee_id FROM leaves WHERE status = 'approved' AND start_date <= ${date} AND end_date >= ${date};`,
        sql`SELECT employee_id FROM leaves WHERE status = 'pending' AND start_date <= ${date} AND end_date >= ${date};`,
        sql`
          SELECT employee_id FROM weekly_offs
          WHERE weekday = EXTRACT(DOW FROM ${date}::date)::integer
            AND effective_from <= ${date}
            AND (effective_to IS NULL OR effective_to >= ${date});
        `,
        sql`
          SELECT employee_id FROM roster_days
          WHERE roster_month_id = ${`roster-${date.slice(0, 7)}`}
            AND date = ${date}
            AND status IN ('working', 'leave', 'weekly_off', 'holiday');
        `,
        sql`SELECT status FROM roster_months WHERE month = ${date.slice(0, 7)} LIMIT 1;`,
      ]);
      const unavailableIds = new Set([
        ...leavesOnDate.map((row: any) => row.employee_id),
        ...pendingLeaves.map((row: any) => row.employee_id),
        ...weeklyOffs.map((row: any) => row.employee_id),
        ...scheduled.map((row: any) => row.employee_id),
      ]);
      const availableCandidates = certifiedStaff.filter((candidate: any) => !unavailableIds.has(candidate.id)).map((c: any) => ({
          employeeId: c.id,
          employeeName: c.employee_name,
          email: c.email,
          podName: c.pod_name,
          qualificationReason: c.qualification_reason,
        }));

      return {
        brandName: targetBp.brand_name,
        processCode: targetBp.process_code,
        date,
        rosterStatus: monthRows[0]?.status || "not generated",
        totalCertified: certifiedStaff.length,
        backupsCount: availableCandidates.length,
        backups: availableCandidates,
        employeesWithPendingLeave: certifiedStaff
          .filter((candidate: any) => pendingLeaves.some((leave: any) => leave.employee_id === candidate.id))
          .map((candidate: any) => candidate.employee_name),
        availabilityRule: monthRows.length
          ? "Candidates exclude approved or pending leave, effective weekly offs, and all existing roster assignments for this date."
          : "No roster is generated for this month; candidates exclude approved or pending leave and effective weekly offs, but current workload cannot be verified.",
      };
    }

    // 6. Conflicts Breakdown
    case "get_conflicts": {
      if (userRole === "employee") {
        return { error: "Only managers and pod leads can view roster-wide conflicts.", denied: true };
      }
      if (args.date && !isValidDate(args.date)) {
        return { error: "Filter date must be a valid YYYY-MM-DD date." };
      }
      if (args.severity && !["blocking", "warning"].includes(args.severity)) {
        return { error: "Severity filter must be blocking or warning." };
      }

      let conflicts = await sql`
        SELECT c.id, c.type, c.severity, c.date, c.message, c.suggested_fix,
          c.employee_id, c.brand_process_id, b.name as brand_name, p.code as process_code,
          e.name as employee_name, e.pod_id
        FROM conflicts c
        LEFT JOIN brand_processes bp ON c.brand_process_id = bp.id
        LEFT JOIN brands b ON bp.brand_id = b.id
        LEFT JOIN processes p ON bp.process_id = p.id
        LEFT JOIN employees e ON c.employee_id = e.id
        WHERE c.roster_month_id = ${monthId} AND c.resolved = false
        ORDER BY c.severity DESC, c.date ASC;
      `;

      if (userRole === "pod_lead") {
        const [podRows, podEmployeeRows, podAssignmentRows] = await Promise.all([
          sql`SELECT id FROM pods WHERE lead_employee_id = ${callerEmployeeId};`,
          sql`SELECT id FROM employees WHERE pod_id IN (SELECT id FROM pods WHERE lead_employee_id = ${callerEmployeeId});`,
          sql`SELECT DISTINCT a.brand_process_id FROM assignments a
              JOIN employees e ON e.id = a.employee_id
              WHERE e.pod_id IN (SELECT id FROM pods WHERE lead_employee_id = ${callerEmployeeId}) AND a.active = true;`,
        ]);
        const podIds = new Set(podRows.map((row: any) => row.id));
        const employeeIds = new Set([
          callerEmployeeId,
          ...podEmployeeRows.map((row: any) => row.id),
        ]);
        const brandProcessIds = new Set(podAssignmentRows.map((row: any) => row.brand_process_id));
        conflicts = conflicts.filter((conflict: any) =>
          employeeIds.has(conflict.employee_id) ||
          podIds.has(conflict.pod_id) ||
          brandProcessIds.has(conflict.brand_process_id)
        );
      }
      if (args.date) {
        conflicts = conflicts.filter((conflict: any) =>
          conflict.date && formatDateOnly(conflict.date) === args.date
        );
      }
      if (args.severity) {
        conflicts = conflicts.filter((conflict: any) => conflict.severity === args.severity);
      }
      if (args.brand_or_process) {
        const filter = String(args.brand_or_process).toLowerCase();
        conflicts = conflicts.filter((conflict: any) =>
          `${conflict.brand_name || ""} ${conflict.process_code || ""}`.toLowerCase().includes(filter)
        );
      }

      const blocking = conflicts.filter((c: any) => c.severity === "blocking");
      const warnings = conflicts.filter((c: any) => c.severity === "warning");

      return {
        month,
        totalCount: conflicts.length,
        blockingCount: blocking.length,
        warningCount: warnings.length,
        conflicts: conflicts.map((c: any) => ({
          id: c.id,
          date: c.date ? formatDateOnly(c.date) : "Any",
          brand: c.brand_name || "Brand",
          process: c.process_code || "Process",
          employee: c.employee_name || "Unassigned",
          type: c.type,
          severity: c.severity,
          message: c.message,
          suggestedFix: c.suggested_fix,
        })),
      };
    }

    // 7. Individual Employee Schedule
    case "get_employee_schedule": {
      let targetEmpId = args.employee_id;
      if (userRole === "employee") {
        targetEmpId = callerEmployeeId;
      } else if (!targetEmpId && args.employee_name) {
        const empLookup = await sql`
          SELECT id, name FROM employees WHERE active = true AND name ILIKE ${`%${args.employee_name}%`} ORDER BY name LIMIT 10;
        `;
        if (empLookup.length > 1) {
          return {
            needsClarification: true,
            message: "More than one active employee matches that name. Specify the full name or employee ID.",
            matches: empLookup.map((employee: any) => ({ employeeId: employee.id, name: employee.name })),
          };
        }
        if (empLookup.length === 1) {
          targetEmpId = empLookup[0].id;
        }
      }

      if (!targetEmpId) {
        return { error: `Employee "${args.employee_name || ""}" not found in database.` };
      }

      if (userRole === "pod_lead") {
        const [employeeRows, podRows] = await Promise.all([
          sql`SELECT pod_id FROM employees WHERE id = ${targetEmpId} LIMIT 1;`,
          sql`SELECT id FROM pods WHERE lead_employee_id = ${callerEmployeeId};`,
        ]);
        if (!employeeRows.length || !podRows.some((pod: any) => pod.id === employeeRows[0].pod_id)) {
          return { error: "Pod leads can only view schedules for employees in their assigned pod.", denied: true };
        }
      }

      const scheduleRaw = await sql`
        SELECT rd.date, rd.status, rd.notes, b.name as brand_name, p.code as process_code, e.name as employee_name, pod.name as pod_name
        FROM roster_days rd
        JOIN employees e ON rd.employee_id = e.id
        LEFT JOIN pods pod ON e.pod_id = pod.id
        LEFT JOIN brand_processes bp ON rd.brand_process_id = bp.id
        LEFT JOIN brands b ON bp.brand_id = b.id
        LEFT JOIN processes p ON bp.process_id = p.id
        WHERE rd.roster_month_id = ${monthId} AND rd.employee_id = ${targetEmpId}
        ORDER BY rd.date ASC;
      `;

      const seenDates = new Set<string>();
      const schedule: any[] = [];
      for (const row of scheduleRaw) {
        const cleanDate = formatDateOnly(row.date);
        if (!seenDates.has(cleanDate)) {
          seenDates.add(cleanDate);
          schedule.push({
            ...row,
            date: cleanDate,
          });
        }
      }

      const workingDays = schedule.filter((s: any) => s.status === "working").length;
      const offDays = schedule.filter((s: any) => s.status === "weekly_off").length;
      const leaves = schedule.filter((s: any) => s.status === "leave").length;

      return {
        employeeName: scheduleRaw[0]?.employee_name || "Staff",
        podName: scheduleRaw[0]?.pod_name || "Pod",
        month,
        summary: { workingDays, offDays, leaves },
        schedule,
      };
    }

    // 8. Automated Leave Approval & Incremental Replan Execution
    case "approve_leave": {
      if (userRole !== "manager" && userRole !== "pod_lead") {
        return {
          error: "Permission Denied: Only Operations Managers and Pod Leads are authorized to approve leave requests and trigger automated schedule replanning.",
          denied: true,
        };
      }

      if (!isExplicitLeaveApprovalRequest(currentMessage)) {
        return {
          requiresExplicitApproval: true,
          message: "Leave approval changes the roster. I can check the impact first; explicitly say 'Approve [employee]' only when you want to commit the approval.",
        };
      }

      const { leave_id, employee_name } = args;
      let targetLeave: any = null;

      if (leave_id) {
        const rows = await sql`
          SELECT l.*, e.name as employee_name, e.pod_id, p.name as pod_name
          FROM leaves l
          JOIN employees e ON l.employee_id = e.id
          LEFT JOIN pods p ON e.pod_id = p.id
          WHERE l.id = ${leave_id}
          LIMIT 1;
        `;
        if (rows.length > 0) targetLeave = rows[0];
      }

      if (!targetLeave && employee_name) {
        const pendingRows = await sql`
          SELECT l.*, e.name as employee_name, e.pod_id, p.name as pod_name
          FROM leaves l
          JOIN employees e ON l.employee_id = e.id
          LEFT JOIN pods p ON e.pod_id = p.id
          WHERE l.status = 'pending' AND e.name ILIKE ${`%${employee_name}%`}
          ORDER BY l.start_date ASC
          LIMIT 10;
        `;
        if (pendingRows.length > 1) {
          return {
            needsClarification: true,
            message: "More than one pending leave matches that name. Specify the employee's full name or leave request ID.",
            matches: pendingRows.map((leave: any) => ({
              leaveId: leave.id,
              employee: leave.employee_name,
              startDate: formatDateOnly(leave.start_date),
              endDate: formatDateOnly(leave.end_date),
            })),
          };
        }
        if (pendingRows.length === 1) {
          targetLeave = pendingRows[0];
        } else {
          const approvedRows = await sql`
            SELECT l.*, e.name as employee_name, e.pod_id, p.name as pod_name
            FROM leaves l
            JOIN employees e ON l.employee_id = e.id
            LEFT JOIN pods p ON e.pod_id = p.id
            WHERE l.status = 'approved' AND e.name ILIKE ${`%${employee_name}%`}
            ORDER BY l.start_date DESC
            LIMIT 10;
          `;
          if (approvedRows.length > 1) {
            return {
              needsClarification: true,
              message: "More than one approved leave matches that name. Specify the leave request ID.",
            };
          }
          if (approvedRows.length === 1) {
            const al = approvedRows[0];
            return {
              alreadyApproved: true,
              employeeName: al.employee_name,
              podName: al.pod_name,
              startDate: formatDateOnly(al.start_date),
              endDate: formatDateOnly(al.end_date),
              leaveType: al.type,
              message: `Leave for ${al.employee_name} (${formatDateOnly(al.start_date)} to ${formatDateOnly(al.end_date)}) is already approved in the database.`,
            };
          }
        }
      }

      if (!targetLeave) {
        return {
          noPending: true,
          requestedName: employee_name || null,
          message: employee_name
            ? `No pending leave requests found for "${employee_name}".`
            : "Specify the employee name or leave request ID; I will not choose a leave request automatically.",
        };
      }

      if (userRole === "pod_lead") {
        const podRows = await sql`SELECT lead_employee_id FROM pods WHERE id = ${targetLeave.pod_id} LIMIT 1;`;
        if (podRows.length === 0 || podRows[0].lead_employee_id !== callerEmployeeId) {
          return {
            error: `Pod Lead Scope Restriction: As Pod Lead, you can only approve leave requests for staff within your assigned pod (${targetLeave.pod_name || "Pod"}). ${targetLeave.employee_name} is outside your pod assignment.`,
            scopedOut: true,
          };
        }
      }

      const result = await approveLeaveAndReplan({
        leaveId: targetLeave.id,
        reviewerUserId: userId || "user-mgr",
        reviewerRole: userRole,
        reviewerEmployeeId: callerEmployeeId,
        previewOnly: false,
      });

      if (!result.success) {
        return {
          error: result.error || "Failed to execute leave approval replan",
        };
      }

      return {
        approved: true,
        systemReflected: true,
        leaveId: targetLeave.id,
        employeeName: targetLeave.employee_name,
        podName: targetLeave.pod_name,
        startDate: formatDateOnly(targetLeave.start_date),
        endDate: formatDateOnly(targetLeave.end_date),
        leaveType: targetLeave.type,
        reason: targetLeave.reason,
        changedDaysCount: result.diff?.changedDays?.length || 0,
        newConflictsCount: result.diff?.newConflicts?.length || 0,
        newConflicts: (result.diff?.newConflicts || []).map((c: any) => ({
          date: c.date ? formatDateOnly(c.date) : "Any",
          message: c.message,
          suggestedFix: c.suggestedFix,
        })),
        suggestedBackups: (result.diff?.suggestedBackups || []).slice(0, 3).map((sb: any) => ({
          date: sb.date,
          brandName: sb.brandName,
          candidates: sb.candidates.map((cd: any) => ({ employeeName: cd.employeeName })),
        })),
        metrics: result.metrics,
        notificationWarning: result.notificationWarning,
      };
    }

    // 9. Interactive Leave Impact Simulation & Client Conflict Detection
    case "check_leave_impact_and_conflicts": {
      const { employee_name, leave_id } = args;

      let targetLeave: any = null;
      if (!leave_id && !employee_name) {
        return { error: "Specify a leave request ID or employee name to simulate its impact." };
      }
      if (leave_id) {
        const rows = await sql`
          SELECT l.*, e.name as employee_name, e.pod_id, p.name as pod_name
          FROM leaves l
          JOIN employees e ON l.employee_id = e.id
          LEFT JOIN pods p ON e.pod_id = p.id
          WHERE l.id = ${leave_id} LIMIT 1;
        `;
        if (rows.length > 0) targetLeave = rows[0];
      }

      if (!targetLeave && employee_name) {
        const rows = await sql`
          SELECT l.*, e.name as employee_name, e.pod_id, p.name as pod_name
          FROM leaves l
          JOIN employees e ON l.employee_id = e.id
          LEFT JOIN pods p ON e.pod_id = p.id
          WHERE l.status = 'pending'
            AND e.name ILIKE ${`%${employee_name}%`}
          ORDER BY l.start_date ASC LIMIT 10;
        `;
        if (rows.length > 1) {
          return {
            needsClarification: true,
            message: "More than one pending leave matches that name. Specify the full name or leave request ID.",
            matches: rows.map((leave: any) => ({
              id: leave.id,
              employee: leave.employee_name,
              startDate: formatDateOnly(leave.start_date),
              endDate: formatDateOnly(leave.end_date),
            })),
          };
        }
        if (rows.length === 1) targetLeave = rows[0];
      }

      if (!targetLeave) {
        return {
          error: "No pending leave application found to analyze.",
        };
      }
      if (userRole === "pod_lead") {
        const podRows = await sql`SELECT lead_employee_id FROM pods WHERE id = ${targetLeave.pod_id} LIMIT 1;`;
        if (!podRows.length || podRows[0].lead_employee_id !== callerEmployeeId) {
          return { error: "Pod leads can only review leave impact for employees in their assigned pod.", denied: true };
        }
      }

      const startDate = formatDateOnly(targetLeave.start_date);
      const endDate = formatDateOnly(targetLeave.end_date);
      const monthStart = `${month}-01`;
      const [monthYear, monthNumber] = month.split("-").map(Number);
      const monthEnd = `${month}-${String(new Date(Date.UTC(monthYear, monthNumber, 0)).getUTCDate()).padStart(2, "0")}`;
      const effectiveStart = startDate > monthStart ? startDate : monthStart;
      const effectiveEnd = endDate < monthEnd ? endDate : monthEnd;
      if (effectiveStart > effectiveEnd) {
        return {
          error: `This leave does not overlap the selected roster month (${month}). Select a month within ${startDate} to ${endDate}.`,
        };
      }

      // Find all brand processes assigned to this employee
      const assignedBp = await sql`
        SELECT bp.id, bp.brand_id, bp.process_id,
               COALESCE(mr.operating_calendar, bp.operating_calendar) AS operating_calendar,
               COALESCE(mr.min_headcount_weekday, bp.min_headcount_weekday) AS min_headcount_weekday,
               COALESCE(mr.min_headcount_sunday, bp.min_headcount_sunday) AS min_headcount_sunday,
               COALESCE(mr.min_headcount_holiday, bp.min_headcount_holiday) AS min_headcount_holiday,
               b.name as brand_name, p.code as process_code
        FROM assignments a
        JOIN brand_processes bp ON a.brand_process_id = bp.id
        JOIN brands b ON bp.brand_id = b.id
        JOIN processes p ON bp.process_id = p.id
        LEFT JOIN roster_month_rules mr ON mr.brand_process_id = bp.id AND mr.month = ${month}
        WHERE a.employee_id = ${targetLeave.employee_id} AND a.active = true AND bp.active = true
          AND a.start_date <= ${effectiveEnd}
          AND (a.end_date IS NULL OR a.end_date >= ${effectiveStart});
      `;

      // Check dates in the selected month only.
      const dateList: string[] = [];
      const dateCursor = new Date(`${effectiveStart}T00:00:00.000Z`);
      const dateEnd = new Date(`${effectiveEnd}T00:00:00.000Z`);
      while (dateCursor <= dateEnd) {
        dateList.push(dateCursor.toISOString().slice(0, 10));
        dateCursor.setUTCDate(dateCursor.getUTCDate() + 1);
      }
      const holidaysInRange = await sql`
        SELECT date FROM holidays WHERE date >= ${effectiveStart} AND date <= ${effectiveEnd};
      `;
      const holidayDates = new Set(holidaysInRange.map((holiday: any) => formatDateOnly(holiday.date)));

      // Analyze conflicts per brand process
      const conflictsDetected: any[] = [];
      const backupOptionsByProcess: any[] = [];

      for (const bp of assignedBp) {
        for (const curDate of dateList) {
          const dObj = new Date(curDate);
          const isSunday = dObj.getUTCDay() === 0;
          const isHoliday = holidayDates.has(curDate);
          const required = isHoliday
            ? bp.min_headcount_holiday
            : isSunday
              ? bp.min_headcount_sunday
              : bp.min_headcount_weekday;

          // Check if operating calendar requires coverage on this day
          const requiresCoverage =
            bp.operating_calendar === "all_365" ||
            (!isHoliday && bp.operating_calendar === "daily_no_holidays") ||
            (!isHoliday && !isSunday && bp.operating_calendar === "mon_sat_no_holidays");

          if (requiresCoverage && required > 0) {
            // Count other staff working on that date for this brand_process
            const otherWorkers = await sql`
              SELECT rd.employee_id, e.name as employee_name
              FROM roster_days rd
              JOIN employees e ON rd.employee_id = e.id
              WHERE rd.roster_month_id = ${monthId}
                AND rd.date = ${curDate}
                AND rd.brand_process_id = ${bp.id}
                AND rd.status = 'working'
                AND rd.employee_id != ${targetLeave.employee_id};
            `;

            if (otherWorkers.length < required) {
              conflictsDetected.push({
                date: curDate,
                brandName: bp.brand_name,
                processCode: bp.process_code,
                brandProcessId: bp.id,
                operatingCalendar: bp.operating_calendar,
                requiredHeadcount: required,
                remainingHeadcountIfApproved: otherWorkers.length,
                severity: "blocking",
                type: "INSUFFICIENT_HEADCOUNT",
                message: `Client ${bp.brand_name} (${bp.process_code}) requires ${required} staff (${bp.operating_calendar}). If ${targetLeave.employee_name}'s leave is approved, coverage drops to ${otherWorkers.length} (sole-resource understaffing).`,
              });
            }
          }
        }

        // Find available qualified backup candidates for this brand process
        const certifiedStaff = await sql`
          SELECT DISTINCT e.id, e.name as employee_name, p.name as pod_name,
                 CASE 
                   WHEN bp2.process_id = ${bp.process_id} AND bp2.brand_id = ${bp.brand_id} THEN 'PRIMARY'
                   WHEN bp2.process_id = ${bp.process_id} THEN 'SAME_PROCESS_CERTIFIED'
                   ELSE 'CROSS_TRAINED_POD'
                 END as qualification_reason
          FROM assignments a
          JOIN employees e ON a.employee_id = e.id
          LEFT JOIN pods p ON e.pod_id = p.id
          JOIN brand_processes bp2 ON a.brand_process_id = bp2.id
          WHERE (bp2.process_id = ${bp.process_id} OR bp2.brand_id = ${bp.brand_id})
            AND e.id != ${targetLeave.employee_id}
            AND e.active = true AND a.active = true AND bp2.active = true
            AND a.start_date <= ${effectiveEnd}
            AND (a.end_date IS NULL OR a.end_date >= ${effectiveStart});
        `;

        const candidateIds = certifiedStaff.map((candidate: any) => candidate.id);
        const [leaveStaff, weeklyOffStaff, scheduledStaff] = await Promise.all([
          sql`
            SELECT employee_id, start_date, end_date, status FROM leaves
            WHERE employee_id = ANY(${candidateIds}) AND status IN ('approved', 'pending')
              AND start_date <= ${effectiveEnd} AND end_date >= ${effectiveStart};
          `,
          sql`
            SELECT employee_id, weekday, effective_from, effective_to FROM weekly_offs
            WHERE employee_id = ANY(${candidateIds})
              AND effective_from <= ${effectiveEnd}
              AND (effective_to IS NULL OR effective_to >= ${effectiveStart});
          `,
          sql`
            SELECT employee_id, date FROM roster_days
            WHERE roster_month_id = ${monthId} AND date >= ${effectiveStart} AND date <= ${effectiveEnd}
              AND status IN ('working', 'leave', 'weekly_off', 'holiday');
          `,
        ]);
        const available = certifiedStaff
          .filter((candidate: any) => dateList.every((date) => {
            const weekday = new Date(`${date}T00:00:00.000Z`).getUTCDay();
            return !leaveStaff.some((leave: any) =>
              leave.employee_id === candidate.id &&
              formatDateOnly(leave.start_date) <= date &&
              formatDateOnly(leave.end_date) >= date
            ) &&
            !weeklyOffStaff.some((off: any) =>
              off.employee_id === candidate.id &&
              off.weekday === weekday &&
              formatDateOnly(off.effective_from) <= date &&
              (!off.effective_to || formatDateOnly(off.effective_to) >= date)
            ) &&
            !scheduledStaff.some((scheduled: any) =>
              scheduled.employee_id === candidate.id && formatDateOnly(scheduled.date) === date
            );
          }))
          .map((c: any) => ({
            employeeId: c.id,
            employeeName: c.employee_name,
            podName: c.pod_name,
            qualification: c.qualification_reason,
            status: "Available for Shift Appointment",
          }));

        backupOptionsByProcess.push({
          brandName: bp.brand_name,
          processCode: bp.process_code,
          brandProcessId: bp.id,
          candidates: available,
        });
      }

      const availableCandidates = backupOptionsByProcess[0]?.candidates || [];

      return {
        employeeName: targetLeave.employee_name,
        podName: targetLeave.pod_name,
        leaveDates: `${startDate} to ${endDate}`,
        leaveType: targetLeave.type,
        reason: targetLeave.reason,
        hasClientConflict: conflictsDetected.length > 0,
        conflictCount: conflictsDetected.length,
        conflicts: conflictsDetected,
        candidateCount: availableCandidates.length,
        availableSubstitutes: availableCandidates,
        allProcessBackups: backupOptionsByProcess,
        recommendation: conflictsDetected.length > 0
          ? `Approving leave for ${targetLeave.employee_name} creates a blocking client understaffing conflict on ${conflictsDetected[0].brandName} (${conflictsDetected[0].processCode}). ${availableCandidates.length} certified backup staff are available to cover (e.g. ${availableCandidates.slice(0, 3).map((c: any) => c.employeeName).join(", ")}). You can appoint a replacement to resolve the conflict.`
          : `No blocking client conflicts detected. Headcount requirements are satisfied.`,
      };
    }

    // 10. Direct Shift Appointment; notifications require a separate explicit request
    case "assign_replacement_employee": {
      if (userRole !== "manager" && userRole !== "pod_lead") {
        return {
          error: "Permission Denied: Only Operations Managers and Pod Leads are authorized to appoint shift replacements and adjust roster assignments.",
          denied: true,
        };
      }

      const {
        replacement_employee_name,
        date_or_range,
        brand_or_process,
        original_employee_name,
      } = args;
      if (!replacement_employee_name || !date_or_range || !brand_or_process) {
        return {
          error: "Specify a replacement employee, date or date range, and brand or process before making an assignment.",
        };
      }

      // 1. Find replacement employee
      const repRows = await sql`
        SELECT e.id, e.name, e.email, e.pod_id, p.name as pod_name
        FROM employees e
        LEFT JOIN pods p ON e.pod_id = p.id
        WHERE e.active = true AND e.name ILIKE ${`%${replacement_employee_name}%`}
        ORDER BY e.name ASC LIMIT 10;
      `;
      if (repRows.length === 0) {
        return { error: `Employee "${replacement_employee_name}" not found in database.` };
      }
      if (repRows.length > 1) {
        return {
          needsClarification: true,
          message: "More than one active employee matches that name. Specify the employee's full name.",
          matches: repRows.map((employee: any) => ({ employeeId: employee.id, name: employee.name, pod: employee.pod_name })),
        };
      }
      const repEmp = repRows[0];
      if (userRole === "pod_lead") {
        const podRows = await sql`SELECT id FROM pods WHERE lead_employee_id = ${callerEmployeeId};`;
        if (!podRows.some((pod: any) => pod.id === repEmp.pod_id)) {
          return { error: "Pod leads can only assign employees in their assigned pod.", denied: true };
        }
      }

      // 2. Parse dates
      const rawDate = String(date_or_range);
      const matches = rawDate.match(/\d{4}-\d{2}-\d{2}/g);
      if (!matches || matches.length > 2) {
        return { error: "Provide one date or a range with exactly two dates in YYYY-MM-DD format." };
      }
      const parsedDates = matches.map((value: string) => new Date(`${value}T00:00:00.000Z`));
      if (parsedDates.some((value: Date, index: number) => Number.isNaN(value.getTime()) || value.toISOString().slice(0, 10) !== matches[index])) {
        return { error: "One or more assignment dates are invalid." };
      }
      if (matches.length === 2 && matches[0] > matches[1]) {
        return { error: "The assignment start date must be on or before its end date." };
      }
      if (matches.some((value: string) => value.slice(0, 7) !== month)) {
        return { error: `Assignment dates must be within the selected roster month (${month}).` };
      }
      const dateList: string[] = [];
      if (matches && matches.length >= 2) {
        const cursor = new Date(`${matches[0]}T00:00:00.000Z`);
        const end = new Date(`${matches[1]}T00:00:00.000Z`);
        while (cursor <= end && dateList.length <= 31) {
          dateList.push(cursor.toISOString().slice(0, 10));
          cursor.setUTCDate(cursor.getUTCDate() + 1);
        }
        if (cursor <= end) {
          return { error: "An assignment range cannot exceed 31 days." };
        }
      } else {
        dateList.push(matches[0]);
      }

      // 3. Find target brand process
      let targetBp: any = null;
      const allBp = await sql`
        SELECT bp.*, b.name as brand_name, p.code as process_code
        FROM brand_processes bp
        JOIN brands b ON bp.brand_id = b.id
        JOIN processes p ON bp.process_id = p.id
        WHERE bp.active = true AND b.active = true;
      `;

      if (brand_or_process) {
        const words = brand_or_process.toLowerCase().split(/\s+/).filter(Boolean);
        const targetMatches = allBp.filter((b: any) =>
          words.every((word: string) => `${b.brand_name} ${b.process_code}`.toLowerCase().includes(word))
        );
        if (targetMatches.length > 1) {
          return {
            needsClarification: true,
            message: "More than one brand/process matches. Specify both the brand and process.",
            matches: targetMatches.map((item: any) => ({ brand: item.brand_name, process: item.process_code })),
          };
        }
        targetBp = targetMatches[0] || null;
      }

      // If not specified, look up original employee's brand process
      let origEmp: any = null;
      if (original_employee_name) {
        const oRows = await sql`
          SELECT id, name FROM employees
          WHERE active = true AND name ILIKE ${`%${original_employee_name}%`}
          ORDER BY name ASC LIMIT 10;
        `;
        if (oRows.length > 1) {
          return {
            needsClarification: true,
            message: "More than one active employee matches the employee being replaced. Specify the full name.",
            matches: oRows.map((employee: any) => ({ employeeId: employee.id, name: employee.name })),
          };
        }
        if (oRows.length === 1) origEmp = oRows[0];
      }
      if (userRole === "pod_lead" && origEmp) {
        const podRows = await sql`SELECT id FROM pods WHERE lead_employee_id = ${callerEmployeeId};`;
        const employeeRows = await sql`SELECT pod_id FROM employees WHERE id = ${origEmp.id} LIMIT 1;`;
        if (!employeeRows.length || !podRows.some((pod: any) => pod.id === employeeRows[0].pod_id)) {
          return { error: "Pod leads can only make replacement assignments within their assigned pod.", denied: true };
        }
      }

      if (!targetBp && origEmp) {
        const bpRows = await sql`
          SELECT bp.*, b.name as brand_name, p.code as process_code
          FROM assignments a
          JOIN brand_processes bp ON a.brand_process_id = bp.id
          JOIN brands b ON bp.brand_id = b.id
          JOIN processes p ON bp.process_id = p.id
          WHERE a.employee_id = ${origEmp.id}
          LIMIT 1;
        `;
        if (bpRows.length > 0) targetBp = bpRows[0];
      }

      if (!targetBp) {
        return { error: `No configured brand or process matches "${brand_or_process}".` };
      }

      const availabilityIssues: Array<{ date: string; issue: string }> = [];
      for (const date of dateList) {
        const [eligible, approvedLeave, weeklyOff, scheduled] = await Promise.all([
          sql`
            SELECT a.id FROM assignments a
            JOIN brand_processes bp ON a.brand_process_id = bp.id
            WHERE a.employee_id = ${repEmp.id} AND a.active = true AND bp.active = true
              AND (bp.id = ${targetBp.id} OR bp.process_id = ${targetBp.process_id} OR bp.brand_id = ${targetBp.brand_id})
              AND a.start_date <= ${date} AND (a.end_date IS NULL OR a.end_date >= ${date})
            LIMIT 1;
          `,
          sql`SELECT id, status FROM leaves WHERE employee_id = ${repEmp.id} AND status IN ('approved', 'pending') AND start_date <= ${date} AND end_date >= ${date} LIMIT 1;`,
          sql`
            SELECT id FROM weekly_offs
            WHERE employee_id = ${repEmp.id}
              AND weekday = EXTRACT(DOW FROM ${date}::date)::integer
              AND effective_from <= ${date}
              AND (effective_to IS NULL OR effective_to >= ${date})
            LIMIT 1;
          `,
          sql`
            SELECT status FROM roster_days
            WHERE roster_month_id = ${monthId} AND employee_id = ${repEmp.id} AND date = ${date}
              AND status IN ('working', 'leave', 'weekly_off', 'holiday')
            LIMIT 1;
          `,
        ]);
        if (!eligible.length) availabilityIssues.push({ date, issue: "no active qualifying assignment" });
        if (approvedLeave.length) availabilityIssues.push({ date, issue: `${approvedLeave[0].status} leave request` });
        if (weeklyOff.length) availabilityIssues.push({ date, issue: "weekly off" });
        if (scheduled.length) availabilityIssues.push({ date, issue: "already has a roster assignment" });
      }
      if (availabilityIssues.length) {
        return {
          error: `${repEmp.name} is not available for every requested date.`,
          availabilityIssues,
        };
      }

      // 4. Add the assignment without changing leave status or resolving conflicts implicitly.
      const assignedNotes = `Manager-assigned coverage${origEmp ? ` replacing ${origEmp.name}` : ""} (${targetBp.brand_name} ${targetBp.process_code})`;
      for (const d of dateList) {
        const rdId = `rd-${monthId}-${repEmp.id}-${d}-${targetBp.id}`;
        await sql`
          INSERT INTO roster_days (id, roster_month_id, employee_id, date, status, brand_process_id, pinned, notes, created_at, updated_at)
          VALUES (${rdId}, ${monthId}, ${repEmp.id}, ${d}, 'working', ${targetBp.id}, true, ${assignedNotes}, now(), now())
          ON CONFLICT (id)
          DO UPDATE SET status = 'working', brand_process_id = EXCLUDED.brand_process_id, pinned = true, notes = EXCLUDED.notes, updated_at = now();
        `;
      }

      // 7. Audit log
      await sql`
        INSERT INTO audit_log (id, actor_user_id, action, entity, entity_id, after, created_at, updated_at)
        VALUES (
          ${`audit-${Date.now()}`},
          ${userId || null},
          'SHIFT_REPLACEMENT_APPOINTED',
          'roster_days',
          ${repEmp.id},
          ${JSON.stringify({
            appointedEmployee: repEmp.name,
            dates: dateList,
            targetBrand: targetBp.brand_name,
            process: targetBp.process_code,
            replacedEmployee: origEmp?.name,
            notificationSent: false,
          })},
          now(),
          now()
        );
      `;

      return {
        success: true,
        appointedEmployee: repEmp.name,
        appointedEmployeePod: repEmp.pod_name,
        brandName: targetBp.brand_name,
        processCode: targetBp.process_code,
        dates: dateList,
        replacedEmployee: origEmp?.name,
        leaveApproved: false,
        conflictsResolved: false,
        notificationSent: false,
        notificationSuggested: true,
        message: `Roster assignment saved for ${repEmp.name}. Ask whether the manager wants a notification sent to the employee and pod lead.`,
        systemReflected: true,
      };
    }

    // 11. Structural Database Lookups
    case "query_database_custom": {
      const { entity } = args;
      if (entity === "pods") {
        const pods = await sql`
          SELECT p.id, p.name, e.name as lead_name, COUNT(emp.id) as member_count
          FROM pods p
          LEFT JOIN employees e ON p.lead_employee_id = e.id
          LEFT JOIN employees emp ON emp.pod_id = p.id
          GROUP BY p.id, p.name, e.name
          ORDER BY p.name;
        `;
        return { pods };
      } else if (entity === "brands") {
        const brands = await sql`
          SELECT b.id, b.name, bp.operating_calendar, p.code as process_code, bp.min_headcount_weekday, bp.min_headcount_sunday
          FROM brands b
          JOIN brand_processes bp ON bp.brand_id = b.id
          JOIN processes p ON bp.process_id = p.id
          ORDER BY b.name;
        `;
        return { brands };
      } else if (entity === "holidays") {
        const holidays = await sql`SELECT * FROM holidays ORDER BY date;`;
        return { holidays };
      } else {
        const counts = await sql`
          SELECT 
            (SELECT COUNT(*) FROM employees) as total_employees,
            (SELECT COUNT(*) FROM pods) as total_pods,
            (SELECT COUNT(*) FROM brands) as total_brands,
            (SELECT COUNT(*) FROM leaves WHERE status = 'pending') as pending_leaves;
        `;
        return { counts: counts[0], active_import_id: activeImportId };
      }
    }

    case "notify_employee": {
      if (userRole !== "manager") {
        return { error: "Only managers can send employee notifications.", denied: true };
      }
      if (!isExplicitNotificationRequest(currentMessage, previousAssistantMessage)) {
        return {
          requiresConfirmation: true,
          message: "I can send this notification after you explicitly ask me to notify the named employee.",
        };
      }

      const employeeName = String(args.employee_name || "").trim();
      const title = String(args.title || "").trim();
      const message = String(args.message || "").trim();
      const date = args.date == null || args.date === "" ? null : String(args.date);
      if (!employeeName || !title || !message || title.length > 120 || message.length > 1000) {
        return { error: "Provide an employee, a title up to 120 characters, and a message up to 1,000 characters." };
      }
      if (/\b(password|passcode|secret|api key|access token)\b/i.test(`${title} ${message}`)) {
        return { error: "Notifications cannot contain passwords, secrets, or access tokens." };
      }
      if (date && !isValidDate(date)) {
        return { error: "Notification date must be a valid YYYY-MM-DD date." };
      }

      const employees = args.employee_id
        ? await sql`
            SELECT e.id, e.name, e.pod_id, p.lead_employee_id
            FROM employees e
            LEFT JOIN pods p ON p.id = e.pod_id
            WHERE e.active = true AND e.id = ${args.employee_id}
            LIMIT 2;
          `
        : await sql`
            SELECT e.id, e.name, e.pod_id, p.lead_employee_id
            FROM employees e
            LEFT JOIN pods p ON p.id = e.pod_id
            WHERE e.active = true AND LOWER(e.name) = LOWER(${employeeName})
            LIMIT 2;
          `;
      if (employees.length === 0) {
        return { error: `No active employee exactly matches "${employeeName}".` };
      }
      if (employees.length > 1) {
        return {
          needsClarification: true,
          message: "More than one active employee has that exact name. Specify the employee ID.",
        };
      }
      const employee = employees[0];
      const { notificationId, podLeadNotificationId } = await createEmployeeNotification(sql, {
        employeeId: employee.id,
        title,
        message,
        type: "manager_message",
        date,
        metadata: { source: "ai_assistant" },
        notifyPodLead: true,
      });
      const podLeadNotified = Boolean(podLeadNotificationId);

      await sql`
        INSERT INTO audit_log (id, actor_user_id, action, entity, entity_id, after, created_at, updated_at)
        VALUES (
          ${`audit-${randomUUID()}`}, ${userId || null}, 'EMPLOYEE_NOTIFICATION_SENT',
          'notifications', ${notificationId},
          ${JSON.stringify({ employeeId: employee.id, title, date, podLeadNotified })}::jsonb,
          now(), now()
        );
      `;

      return {
        success: true,
        systemReflected: true,
        notificationSent: true,
        employee: employee.name,
        podLeadNotified,
        message: `Notification sent to ${employee.name}${podLeadNotified ? " and their pod lead" : ""}.`,
      };
    }

    // 12. get_import_summary
    case "get_import_summary": {
      const recentImports = await sql`
        SELECT id, filename, uploaded_by, uploaded_at, status, row_counts, error_summary
        FROM imports
        ORDER BY uploaded_at DESC
        LIMIT 5;
      `;
      return {
        active_import_id: activeImportId,
        latestImport: recentImports[0] || null,
        history: recentImports,
        has_imported_data: Boolean(recentImports[0]),
      };
    }

    case "get_roster_configuration": {
      const targetMonth = args.month || month;
      if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(targetMonth)) {
        return { error: "month must use YYYY-MM format" };
      }
      const [year, monthNumber] = targetMonth.split("-").map(Number);
      const monthStart = `${targetMonth}-01`;
      const monthEnd = `${targetMonth}-${String(new Date(Date.UTC(year, monthNumber, 0)).getUTCDate()).padStart(2, "0")}`;

      let employeeRows: any[];
      if (userRole === "manager") {
        employeeRows = await sql`SELECT id, name, email, pod_id, active FROM employees ORDER BY name;`;
      } else if (callerEmployeeId && userRole === "pod_lead") {
        employeeRows = await sql`
          SELECT e.id, e.name, e.email, e.pod_id, e.active
          FROM employees e
          WHERE e.pod_id IN (SELECT id FROM pods WHERE lead_employee_id = ${callerEmployeeId})
          ORDER BY e.name;
        `;
      } else if (callerEmployeeId) {
        employeeRows = await sql`
          SELECT id, name, email, pod_id, active FROM employees
          WHERE id = ${callerEmployeeId};
        `;
      } else {
        return { error: "No employee scope is available for this account." };
      }

      const employeeIds = employeeRows.map((employee) => employee.id);
      const visiblePods = userRole === "manager"
        ? await sql`SELECT id, name, lead_employee_id FROM pods ORDER BY name;`
        : await sql`
            SELECT id, name, lead_employee_id FROM pods
            WHERE lead_employee_id = ${callerEmployeeId};
          `;
      if (employeeIds.length === 0) {
        return {
          active_import_id: activeImportId,
          month: targetMonth,
          pods: visiblePods,
          employees: [],
          weekly_offs: [],
          brand_processes: [],
          assignments: [],
        };
      }

      const [weeklyOffs, assignmentRows] = await Promise.all([
        sql`
          SELECT employee_id, weekday, effective_from, effective_to
          FROM weekly_offs
          WHERE employee_id = ANY(${employeeIds})
            AND effective_from <= ${monthEnd}
            AND (effective_to IS NULL OR effective_to >= ${monthStart})
          ORDER BY employee_id, effective_from;
        `,
        sql`
          SELECT a.employee_id, e.name AS employee_name, p.name AS pod_name,
                 b.code AS brand_code, b.name AS brand_name, b.category,
                 pr.code AS process_code, pr.name AS process_name,
                 COALESCE(mr.operating_calendar, bp.operating_calendar) AS operating_calendar,
                 COALESCE(mr.min_headcount_weekday, bp.min_headcount_weekday) AS min_headcount_weekday,
                 COALESCE(mr.min_headcount_sunday, bp.min_headcount_sunday) AS min_headcount_sunday,
                 COALESCE(mr.min_headcount_holiday, bp.min_headcount_holiday) AS min_headcount_holiday,
                 a.start_date, a.end_date, a.priority, a.is_exclusive
          FROM assignments a
          JOIN employees e ON e.id = a.employee_id
          LEFT JOIN pods p ON p.id = e.pod_id
          JOIN brand_processes bp ON bp.id = a.brand_process_id
          JOIN brands b ON b.id = bp.brand_id
          JOIN processes pr ON pr.id = bp.process_id
          LEFT JOIN roster_month_rules mr ON mr.brand_process_id = bp.id AND mr.month = ${targetMonth}
          WHERE a.active = true
            AND bp.active = true
            AND a.employee_id = ANY(${employeeIds})
            AND a.start_date <= ${monthEnd}
            AND (a.end_date IS NULL OR a.end_date >= ${monthStart})
          ORDER BY b.name, pr.code, e.name;
        `,
      ]);

      const configurationByProcess = new Map<string, Record<string, unknown>>();
      for (const assignment of assignmentRows) {
        const key = `${assignment.brand_code}:${assignment.process_code}`;
        if (!configurationByProcess.has(key)) {
          configurationByProcess.set(key, {
            brand_code: assignment.brand_code,
            brand_name: assignment.brand_name,
            category: assignment.category,
            process_code: assignment.process_code,
            process_name: assignment.process_name,
            operating_calendar: assignment.operating_calendar,
            weekday_headcount: assignment.min_headcount_weekday,
            sunday_headcount: assignment.min_headcount_sunday,
            holiday_headcount: assignment.min_headcount_holiday,
          });
        }
      }

      return {
        active_import_id: activeImportId,
        month: targetMonth,
        pods: visiblePods,
        employees: employeeRows,
        weekly_offs: weeklyOffs,
        brand_processes: [...configurationByProcess.values()],
        assignments: assignmentRows,
      };
    }

    // 13. list_brands
    case "list_brands": {
      const brandsList = await sql`
        SELECT b.id, b.code, b.name, b.category, b.active,
               COUNT(DISTINCT bp.id) as active_processes,
               COUNT(DISTINCT a.employee_id) as assigned_staff
        FROM brands b
        LEFT JOIN brand_processes bp ON bp.brand_id = b.id AND bp.active = true
        LEFT JOIN assignments a ON a.brand_process_id = bp.id AND a.active = true
        WHERE b.active = true
        GROUP BY b.id, b.code, b.name, b.category, b.active
        ORDER BY b.name;
      `;
      return {
        active_import_id: activeImportId,
        totalBrands: brandsList.length,
        brands: brandsList,
      };
    }

    // 14. list_processes
    case "list_processes": {
      const procList = await sql`
        SELECT p.id, p.code, p.name,
               COUNT(DISTINCT bp.brand_id) as brands_using_process
        FROM processes p
        LEFT JOIN brand_processes bp ON bp.process_id = p.id AND bp.active = true
        GROUP BY p.id, p.code, p.name
        ORDER BY p.code;
      `;
      return {
        active_import_id: activeImportId,
        processes: procList,
      };
    }

    // 15. get_pod_members
    case "get_pod_members": {
      const queryStr = String(args.pod_code_or_name || "").trim().toLowerCase();
      const podsFound = await sql`
        SELECT p.id as pod_code, p.name as pod_name, p.lead_employee_id, lead.name as lead_name
        FROM pods p
        LEFT JOIN employees lead ON p.lead_employee_id = lead.id
        WHERE LOWER(p.id) = ${queryStr} 
           OR LOWER(p.name) LIKE ${`%${queryStr}%`}
        LIMIT 1;
      `;
      if (podsFound.length === 0) {
        return { active_import_id: activeImportId, error: `No pod found matching "${args.pod_code_or_name}"` };
      }
      const pod = podsFound[0];
      const members = await sql`
        SELECT id as employee_id, name, email, active
        FROM employees
        WHERE pod_id = ${pod.pod_code}
        ORDER BY name;
      `;
      return {
        active_import_id: activeImportId,
        pod_code: pod.pod_code,
        pod_name: pod.pod_name,
        lead_name: pod.lead_name,
        member_count: members.length,
        members,
      };
    }

    // 16. get_import_errors
    case "get_import_errors": {
      const latest = await sql`
        SELECT id, filename, uploaded_at, status, error_summary, row_counts
        FROM imports
        ORDER BY uploaded_at DESC
        LIMIT 1;
      `;
      if (latest.length === 0) {
        return { active_import_id: null, message: "No imports have been performed yet." };
      }
      return {
        active_import_id: latest[0].id,
        filename: latest[0].filename,
        uploaded_at: latest[0].uploaded_at,
        status: latest[0].status,
        error_summary: latest[0].error_summary,
        row_counts: latest[0].row_counts,
      };
    }

    // 17. get_latest_import
    case "get_latest_import": {
      return {
        active_import_id: activeImportId,
        import: latestImports[0] || null,
        has_imported_data: Boolean(latestImports[0]),
      };
    }

    default:
      return { error: `Unknown tool ${toolName}` };
  }
}

export async function POST(req: NextRequest) {
  const { user, errorResponse } = await requireAuth();
  if (errorResponse) return errorResponse;

  if (!checkRateLimit(user!.id)) {
    return NextResponse.json(
      { error: "Rate limit exceeded. You can send up to 45 queries per minute." },
      { status: 429 }
    );
  }

  const body = await req.json();
  const { message } = body;
  const month = body.month || new Date().toISOString().slice(0, 7);

  if (!message || typeof message !== "string") {
    return NextResponse.json({ error: "Message string is required" }, { status: 400 });
  }
  if (!isValidRosterMonth(month)) {
    return NextResponse.json({ error: "Month must use valid YYYY-MM format." }, { status: 400 });
  }

  const history: Array<{ role: "user" | "assistant"; content: string }> = Array.isArray(body.history)
    ? body.history
        .filter((entry: any) =>
          entry && (entry.role === "user" || entry.role === "assistant") && typeof entry.content === "string"
        )
        .slice(-10)
        .map((entry: any) => ({ role: entry.role, content: entry.content.slice(0, 2000) }))
    : [];
  const previousAssistantMessage =
    [...history].reverse().find((entry) => entry.role === "assistant")?.content || "";

  const groqKey = sanitizeApiKey(process.env.GROQ_API_KEY || "");
  const anthropicKey = sanitizeApiKey(process.env.ANTHROPIC_API_KEY || "");
  const provider = detectProvider(`${groqKey || ""}${anthropicKey || ""}`);
  const apiKey = provider === "groq" ? groqKey : anthropicKey;

  const sql = neon(process.env.DATABASE_URL!);
  const latestImportRec = await sql`SELECT id, filename, uploaded_at, status FROM imports WHERE status = 'committed' ORDER BY uploaded_at DESC LIMIT 1;`;
  const activeImportId = latestImportRec[0]?.id || null;

  const systemPrompt = `You are the AI Operations Assistant for the Smart Roster Management System.
User session: ${user!.email} (role: ${user!.role})
Roster month: ${month}
Latest committed import: ${activeImportId ? `${activeImportId} (${latestImportRec[0].filename})` : "none"}

Use the provided tools for every question about live roster, employee, pod, brand, process, assignment, availability, conflict, leave, or import data. Answer from live database records, not memory. Never invent people, brands, dates, coverage numbers, leave statuses, or actions. If the requested detail is missing, a name is ambiguous, or the database cannot verify availability, ask a focused clarifying question and do not guess. Explain the evidence and any remaining conflicts; never claim coverage is resolved while blocking conflicts remain. Respect the caller's role and data scope, and never expose passwords or secrets.

Treat write actions carefully. Approve a leave only after a direct instruction to approve a specific employee's request; hypothetical questions are read-only and should use the impact/conflict tools. Make an assignment only when employee, date(s), and configured brand/process are clear. Assignment alone must not approve leave, resolve conflicts automatically, or send a notification. After a successful assignment, ask whether the manager wants the employee and pod lead notified. Call notify_employee only after a direct manager request or a clear confirmation to your immediately preceding notification offer.`;

  try {
    let replyText = "";
    let systemReflected = false;
    let toolUsed = "";
    let toolResult: any = null;

    if (provider === "groq" && groqKey) {
      try {
        const messages: any[] = [
          { role: "system", content: systemPrompt },
          ...history,
          { role: "user", content: message },
        ];

        let modelChoice = "openai/gpt-oss-120b";
        let firstRes = await fetch("https://api.groq.com/openai/v1/chat/completions", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${groqKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: modelChoice,
            messages,
            tools: toolsDefinition,
            tool_choice: "auto",
            temperature: 0.2,
          }),
        });

        if (!firstRes.ok) {
          modelChoice = "qwen/qwen3.8-27b";
          firstRes = await fetch("https://api.groq.com/openai/v1/chat/completions", {
            method: "POST",
            headers: {
              Authorization: `Bearer ${groqKey}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              model: modelChoice,
              messages,
              tools: toolsDefinition,
              tool_choice: "auto",
              temperature: 0.2,
            }),
          });
        }

        if (firstRes.ok) {
          const firstData = await firstRes.json();
          const assistantMsg = firstData.choices?.[0]?.message;

          if (assistantMsg?.tool_calls && assistantMsg.tool_calls.length > 0) {
            messages.push(assistantMsg);

            for (const call of assistantMsg.tool_calls) {
              const funcName = call.function.name;
              let parsedArgs: any = {};
              try {
                parsedArgs = JSON.parse(call.function.arguments || "{}");
              } catch {
                toolResult = { error: "The assistant produced invalid tool arguments; no action was taken." };
                messages.push({
                  role: "tool",
                  tool_call_id: call.id,
                  content: JSON.stringify(toolResult),
                });
                continue;
              }

              toolUsed = funcName;
              const res = await executeTool(
                funcName,
                { ...parsedArgs, month: parsedArgs.month ?? month },
                user!.role,
                user!.employeeId,
                user!.id,
                message,
                previousAssistantMessage
              );
              toolResult = res;
              if (res?.systemReflected) systemReflected = true;

              messages.push({
                role: "tool",
                tool_call_id: call.id,
                content: JSON.stringify(res),
              });
            }

            const secondRes = await fetch("https://api.groq.com/openai/v1/chat/completions", {
              method: "POST",
              headers: {
                Authorization: `Bearer ${groqKey}`,
                "Content-Type": "application/json",
              },
              body: JSON.stringify({
                model: modelChoice,
                messages,
                temperature: 0.2,
              }),
            });

            if (secondRes.ok) {
              const secondData = await secondRes.json();
              replyText = secondData.choices?.[0]?.message?.content || "";
            }
          } else if (assistantMsg?.content) {
            replyText = assistantMsg.content;
          }
        }
      } catch (fetchErr) {
        console.warn("External Groq fetch exception:", fetchErr);
      }
    } else if (provider === "anthropic" && anthropicKey) {
      try {
        const anthropicMessages = [...history, { role: "user", content: message }].map((entry) => ({
          role: entry.role,
          content: [{ type: "text", text: entry.content }],
        }));

        const payload = {
          model: "claude-3-5-sonnet-20241022",
          max_tokens: 1024,
          system: systemPrompt,
          messages: anthropicMessages,
          tools: toolsDefinition.map((tool) => ({
            name: tool.function.name,
            description: tool.function.description,
            input_schema: tool.function.parameters,
          })),
        };

        const firstRes = await fetch("https://api.anthropic.com/v1/messages", {
          method: "POST",
          headers: {
            "x-api-key": anthropicKey,
            "anthropic-version": "2023-06-01",
            "Content-Type": "application/json",
          },
          body: JSON.stringify(payload),
        });

        if (firstRes.ok) {
          const data = await firstRes.json();
          const blocks = data.content || [];
          const toolCalls = blocks.filter((block: any) => block.type === "tool_use");

          if (toolCalls.length > 0) {
            const secondMessages = [
              ...anthropicMessages,
              { role: "assistant", content: blocks },
            ];

            for (const block of toolCalls) {
              toolUsed = block.name;
              const res = await executeTool(
                block.name,
                { ...(block.input || {}), month: (block.input && block.input.month) || month },
                user!.role,
                user!.employeeId,
                user!.id,
                message,
                previousAssistantMessage
              );
              toolResult = res;
              if (res?.systemReflected) systemReflected = true;

              secondMessages.push({
                role: "user",
                content: [{ type: "tool_result", tool_use_id: block.id, content: JSON.stringify(res) }],
              });
            }

            const secondRes = await fetch("https://api.anthropic.com/v1/messages", {
              method: "POST",
              headers: {
                "x-api-key": anthropicKey,
                "anthropic-version": "2023-06-01",
                "Content-Type": "application/json",
              },
              body: JSON.stringify({
                ...payload,
                messages: secondMessages,
              }),
            });

            if (secondRes.ok) {
              const secondData = await secondRes.json();
              replyText = (secondData.content || [])
                .filter((block: any) => block.type === "text")
                .map((block: any) => block.text)
                .join("\n\n");
            }
          } else {
            replyText = (data.content || [])
              .filter((block: any) => block.type === "text")
              .map((block: any) => block.text)
              .join("\n\n");
          }
        }
      } catch (fetchErr) {
        console.warn("External Anthropic fetch exception:", fetchErr);
      }
    }
    if (!replyText) {
      const fallbackReply = buildToolResultFallback(toolResult);
      const error = apiKey
        ? "The assistant provider did not return a response. Please try again."
        : "The assistant is not configured. Set GROQ_API_KEY or ANTHROPIC_API_KEY to enable it.";

      if (fallbackReply) {
        return NextResponse.json({
          reply: fallbackReply,
          toolUsed,
          systemReflected,
          data: toolResult,
        });
      }

      return NextResponse.json({ error, reply: error }, { status: 503 });
    }
    return NextResponse.json({
      reply: replyText,
      toolUsed,
      systemReflected,
      data: toolResult,
    });
  } catch (error: any) {
    console.error("Assistant API error:", error);
    return NextResponse.json({
      reply: `### ⚠️ Operations Copilot Status\nEncountered an issue processing live query: ${error.message}. Please inspect the Roster Grid directly.`,
    });
  }
}
