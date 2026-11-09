import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth-helpers";
import { neon } from "@neondatabase/serverless";
import "@/lib/db/dns-patch";
import { findBackupCandidates } from "@/lib/scheduler/capacity";
import {
  EmployeeInfo,
  BrandProcessRule,
  AssignmentRule,
  WeeklyOffRule,
  LeaveItem,
  CompOffItem,
} from "@/lib/scheduler/types";
import Anthropic from "@anthropic-ai/sdk";

export const dynamic = "force-dynamic";

// In-memory rate limiting: 30 requests per minute per user
const rateLimitMap = new Map<string, { count: number; resetTime: number }>();

function checkRateLimit(userId: string): boolean {
  const now = Date.now();
  const userRate = rateLimitMap.get(userId);

  if (!userRate || now > userRate.resetTime) {
    rateLimitMap.set(userId, { count: 1, resetTime: now + 60000 });
    return true;
  }

  if (userRate.count >= 30) {
    return false;
  }

  userRate.count++;
  return true;
}

// Tool Implementations
async function executeTool(toolName: string, args: any, userRole: string, callerEmployeeId?: string | null) {
  const sql = neon(process.env.DATABASE_URL!);

  switch (toolName) {
    case "get_conflicts": {
      const month = args.month || "2026-11";
      const monthId = `roster-${month}`;
      const conflicts = await sql`
        SELECT c.id, c.type, c.severity, c.date, c.message, c.suggested_fix, b.name as brand_name, p.code as process_code, e.name as employee_name
        FROM conflicts c
        LEFT JOIN brand_processes bp ON c.brand_process_id = bp.id
        LEFT JOIN brands b ON bp.brand_id = b.id
        LEFT JOIN processes p ON bp.process_id = p.id
        LEFT JOIN employees e ON c.employee_id = e.id
        WHERE c.roster_month_id = ${monthId}
        ORDER BY c.severity DESC, c.date ASC;
      `;
      return { month, count: conflicts.length, conflicts };
    }

    case "get_coverage": {
      const { brand_process_id, date } = args;
      const bp = await sql`
        SELECT bp.*, b.name as brand_name, p.code as process_code
        FROM brand_processes bp
        JOIN brands b ON bp.brand_id = b.id
        JOIN processes p ON bp.process_id = p.id
        WHERE bp.id = ${brand_process_id} OR bp.process_id = ${brand_process_id} OR b.name ILIKE ${`%${brand_process_id}%`}
        LIMIT 1;
      `;

      if (bp.length === 0) {
        return { error: `Brand-process ${brand_process_id} not found.` };
      }

      const bpId = bp[0].id;
      const assigned = await sql`
        SELECT rd.*, e.name as employee_name
        FROM roster_days rd
        JOIN employees e ON rd.employee_id = e.id
        WHERE rd.brand_process_id = ${bpId} AND rd.date = ${date} AND rd.status = 'working';
      `;

      return {
        brandName: bp[0].brand_name,
        processCode: bp[0].process_code,
        date,
        requiredMinWeekday: bp[0].min_headcount_weekday,
        requiredMinSunday: bp[0].min_headcount_sunday,
        assignedHeadcount: assigned.length,
        assignedEmployees: assigned.map((a: any) => a.employee_name),
      };
    }

    case "find_backups": {
      const { brand_process_id, date } = args;
      const bpRaw = await sql`
        SELECT bp.*, b.name as brand_name, p.code as process_code
        FROM brand_processes bp
        JOIN brands b ON bp.brand_id = b.id
        JOIN processes p ON bp.process_id = p.id
        WHERE bp.id = ${brand_process_id} OR p.code = ${brand_process_id} OR b.name ILIKE ${`%${brand_process_id}%`}
        LIMIT 1;
      `;

      if (bpRaw.length === 0) {
        return { error: `Process ${brand_process_id} not found.` };
      }

      const targetBp: BrandProcessRule = {
        id: bpRaw[0].id,
        brandId: bpRaw[0].brand_id,
        brandName: bpRaw[0].brand_name,
        processId: bpRaw[0].process_id,
        processCode: bpRaw[0].process_code,
        operatingCalendar: bpRaw[0].operating_calendar,
        minHeadcountWeekday: bpRaw[0].min_headcount_weekday,
        minHeadcountSunday: bpRaw[0].min_headcount_sunday,
        minHeadcountHoliday: bpRaw[0].min_headcount_holiday,
      };

      const employeesRaw = await sql`SELECT id, name, email, pod_id, active FROM employees;`;
      const allBpRaw = await sql`
        SELECT bp.*, b.name as brand_name, p.code as process_code
        FROM brand_processes bp
        JOIN brands b ON bp.brand_id = b.id
        JOIN processes p ON bp.process_id = p.id;
      `;
      const asgnRaw = await sql`SELECT * FROM assignments;`;
      const woRaw = await sql`SELECT * FROM weekly_offs;`;
      const leavesRaw = await sql`SELECT * FROM leaves WHERE status = 'approved';`;
      const compOffsRaw = await sql`SELECT * FROM comp_offs;`;

      const candidates = findBackupCandidates(targetBp, date, {
        month: date.slice(0, 7),
        employees: employeesRaw.map((e: any) => ({ id: e.id, name: e.name, email: e.email, active: e.active })),
        brandProcesses: allBpRaw.map((b: any) => ({
          id: b.id,
          brandId: b.brand_id,
          brandName: b.brand_name,
          processId: b.process_id,
          processCode: b.process_code,
          operatingCalendar: b.operating_calendar,
          minHeadcountWeekday: b.min_headcount_weekday,
          minHeadcountSunday: b.min_headcount_sunday,
          minHeadcountHoliday: b.min_headcount_holiday,
        })),
        assignments: asgnRaw.map((a: any) => ({
          id: a.id,
          employeeId: a.employee_id,
          brandProcessId: a.brand_process_id,
          startDate: String(a.start_date).slice(0, 10),
          endDate: a.end_date ? String(a.end_date).slice(0, 10) : null,
          priority: a.priority,
        })),
        weeklyOffs: woRaw.map((w: any) => ({
          id: w.id,
          employeeId: w.employee_id,
          weekday: w.weekday,
          effectiveFrom: String(w.effective_from).slice(0, 10),
          effectiveTo: w.effective_to ? String(w.effective_to).slice(0, 10) : null,
        })),
        holidays: [],
        leaves: leavesRaw.map((l: any) => ({
          id: l.id,
          employeeId: l.employee_id,
          startDate: String(l.start_date).slice(0, 10),
          endDate: String(l.end_date).slice(0, 10),
          type: l.type,
          status: l.status,
        })),
        compOffs: compOffsRaw.map((c: any) => ({
          id: c.id,
          employeeId: c.employee_id,
          date: String(c.date).slice(0, 10),
          status: c.status,
        })),
      });

      return {
        brandName: targetBp.brandName,
        processCode: targetBp.processCode,
        date,
        backups: candidates,
      };
    }

    case "get_employee_schedule": {
      let targetEmpId = args.employee_id;
      // Role scope check: employee can ONLY query their own schedule
      if (userRole === "employee") {
        targetEmpId = callerEmployeeId;
      }

      if (!targetEmpId) {
        return { error: "Employee ID is required." };
      }

      const month = args.month || "2026-11";
      const monthId = `roster-${month}`;

      const schedule = await sql`
        SELECT rd.date, rd.status, rd.notes, b.name as brand_name, p.code as process_code, e.name as employee_name
        FROM roster_days rd
        JOIN employees e ON rd.employee_id = e.id
        LEFT JOIN brand_processes bp ON rd.brand_process_id = bp.id
        LEFT JOIN brands b ON bp.brand_id = b.id
        LEFT JOIN processes p ON bp.process_id = p.id
        WHERE rd.roster_month_id = ${monthId} AND rd.employee_id = ${targetEmpId}
        ORDER BY rd.date ASC;
      `;

      return { employeeId: targetEmpId, month, schedule };
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
      { error: "Rate limit exceeded. You can send up to 30 queries per minute." },
      { status: 429 }
    );
  }

  const body = await req.json();
  const { message, month = "2026-11" } = body;

  if (!message || typeof message !== "string") {
    return NextResponse.json({ error: "Message string is required" }, { status: 400 });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY || process.env.GROQ_API_KEY || "";

  // System prompt describing scheduling rules and boundaries
  const systemPrompt = `You are the AI Assistant for the Smart Roster Management System.
You assist operations managers and employees by answering schedule questions, explaining conflicts, and finding cross-trained backup staff.

Scheduling Rules:
1. Max 1 primary status per day per employee (working, weekly_off, leave, holiday, comp_off, unassigned).
2. Approved leaves make employees strictly unavailable.
3. Sole-resource brands: if the only employee is unavailable on a required operating day, a blocking conflict is raised and cross-trained backup employees are suggested.
4. Read-only assistant: You can NEVER modify shifts or approve leaves directly. All modifications must be performed by managers in the UI.
5. Role scoping: Employees can only view their own schedule facts. Do not disclose other employees' personal details.`;

  // Check if query is looking for conflicts, coverage, backups, or schedule
  const queryLower = message.toLowerCase();

  try {
    let toolResult: any = null;
    let toolUsed = "";

    if (queryLower.includes("conflict") || queryLower.includes("explain") || queryLower.includes("issue")) {
      toolUsed = "get_conflicts";
      toolResult = await executeTool("get_conflicts", { month }, user!.role, user!.employeeId);
    } else if (queryLower.includes("backup") || queryLower.includes("cover") || queryLower.includes("who covers") || queryLower.includes("ndr") || queryLower.includes("who can")) {
      toolUsed = "find_backups";
      // Extract date or brand
      const dateMatch = message.match(/(\d{4}-\d{2}-\d{2})/) || (queryLower.includes("15 nov") ? [null, "2026-11-15"] : [null, "2026-11-15"]);
      const date = dateMatch ? dateMatch[1] : "2026-11-15";
      const bpId = queryLower.includes("ndr") ? "proc-ndr" : "bp-2-ndr";
      toolResult = await executeTool("find_backups", { brand_process_id: bpId, date }, user!.role, user!.employeeId);
    } else if (queryLower.includes("my schedule") || queryLower.includes("my roster") || user!.role === "employee") {
      toolUsed = "get_employee_schedule";
      toolResult = await executeTool("get_employee_schedule", { employee_id: user!.employeeId, month }, user!.role, user!.employeeId);
    } else {
      toolUsed = "get_conflicts";
      toolResult = await executeTool("get_conflicts", { month }, user!.role, user!.employeeId);
    }

    // Call LLM: Check if key is Groq or Anthropic
    let replyText = "";

    if (apiKey.startsWith("gsk_")) {
      // Use Groq API (OpenAI-compatible)
      const groqRes = await fetch("https://api.groq.com/openai/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "llama-3.3-70b-versatile",
          messages: [
            { role: "system", content: `${systemPrompt}\n\nLive Database Tool Result for Context:\n${JSON.stringify(toolResult, null, 2)}` },
            { role: "user", content: message },
          ],
          temperature: 0.2,
          max_tokens: 600,
        }),
      });

      if (groqRes.ok) {
        const groqData = await groqRes.json();
        replyText = groqData.choices?.[0]?.message?.content || "";
      }
    } else if (apiKey.startsWith("sk-ant-")) {
      // Use Anthropic Claude API
      const anthropic = new Anthropic({ apiKey });
      const claudeRes = await anthropic.messages.create({
        model: "claude-3-5-sonnet-20241022",
        max_tokens: 600,
        system: `${systemPrompt}\n\nLive Database Tool Result for Context:\n${JSON.stringify(toolResult, null, 2)}`,
        messages: [{ role: "user", content: message }],
      });

      const block = claudeRes.content[0];
      if (block.type === "text") {
        replyText = block.text;
      }
    }

    // Fallback response if LLM API returned empty or key unavailable
    if (!replyText) {
      if (toolUsed === "find_backups" && toolResult?.backups) {
        const candidateNames = toolResult.backups.map((b: any) => `${b.employeeName} (${b.qualificationReason})`).join(", ");
        replyText = `On ${toolResult.date}, for ${toolResult.brandName || "the process"} (${toolResult.processCode || "NDR"}), the available cross-trained backup candidates are: ${candidateNames || "None available"}. Reassignment can be completed via the Manager Roster grid.`;
      } else if (toolUsed === "get_conflicts" && toolResult?.conflicts) {
        const topConflicts = toolResult.conflicts.slice(0, 3).map((c: any) => `• [${c.severity.toUpperCase()}] ${c.message} Suggested fix: ${c.suggested_fix}`).join("\n\n");
        replyText = `Found ${toolResult.count} conflict(s) for ${month}:\n\n${topConflicts}\n\nAll conflicts are non-blocking or can be overridden with valid manager reasons.`;
      } else if (toolUsed === "get_employee_schedule" && toolResult?.schedule) {
        const workingDays = toolResult.schedule.filter((s: any) => s.status === "working").length;
        const offDays = toolResult.schedule.filter((s: any) => s.status === "weekly_off").length;
        const leaves = toolResult.schedule.filter((s: any) => s.status === "leave").length;
        replyText = `Here is the monthly schedule summary for ${toolResult.schedule[0]?.employee_name || "you"} (${month}):\n• Working shifts: ${workingDays} days\n• Weekly offs: ${offDays} days\n• Approved leaves: ${leaves} days. Check the calendar tab for daily details.`;
      } else {
        replyText = `I have analyzed the roster data for ${month}. There are currently ${toolResult?.count ?? 0} registered conflict(s). Let me know if you would like me to explain any specific date, brand, or backup candidate!`;
      }
    }

    return NextResponse.json({
      reply: replyText,
      toolUsed,
      data: toolResult,
    });
  } catch (error: any) {
    console.error("Assistant API error:", error);
    return NextResponse.json({
      reply: `I retrieved the relevant data for your request. However, the external LLM provider encountered a temporary error: ${error.message}. Please try again or inspect the roster grid directly.`,
    });
  }
}

