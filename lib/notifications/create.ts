import { randomUUID } from "crypto";
import type { NeonQueryFunction } from "@neondatabase/serverless";

type NotificationInput = {
  employeeId: string;
  title: string;
  message: string;
  type: string;
  date?: string | null;
  metadata?: Record<string, unknown>;
  notifyPodLead?: boolean;
};

export async function createEmployeeNotification(
  sql: NeonQueryFunction<false, false>,
  input: NotificationInput
) {
  // Deduplication guard: ignore duplicate identical notifications emitted within 60 seconds
  const existing = await sql`
    SELECT id FROM notifications
    WHERE employee_id = ${input.employeeId}
      AND title = ${input.title}
      AND type = ${input.type}
      AND created_at >= now() - interval '60 seconds'
    LIMIT 1;
  `;
  if (existing.length > 0) {
    return { notificationId: existing[0].id as string, podLeadNotificationId: null };
  }

  const notificationId = `notif-${randomUUID()}`;
  const employeeRows = input.notifyPodLead
    ? await sql`
        SELECT e.name, p.lead_employee_id
        FROM employees e
        LEFT JOIN pods p ON p.id = e.pod_id
        WHERE e.id = ${input.employeeId}
        LIMIT 1;
      `
    : [];
  const podLeadId = employeeRows[0]?.lead_employee_id as string | null | undefined;
  const podLeadNotificationId =
    podLeadId && podLeadId !== input.employeeId ? `notif-${randomUUID()}` : null;
  const metadata = JSON.stringify(input.metadata || {});
  await sql`
    INSERT INTO notifications (id, employee_id, title, message, type, date, read, metadata, created_at, updated_at)
    VALUES (
      ${notificationId}, ${input.employeeId}, ${input.title}, ${input.message},
      ${input.type}, ${input.date || null}, false, ${metadata}::jsonb, now(), now()
    );
  `;

  if (podLeadNotificationId && podLeadId) {
    const employeeName = employeeRows[0]?.name || "An employee";
    await sql`
      INSERT INTO notifications (id, employee_id, title, message, type, date, read, metadata, created_at, updated_at)
      VALUES (
        ${podLeadNotificationId}, ${podLeadId}, ${`Pod update: ${input.title}`},
        ${`${employeeName}: ${input.message}`}, ${input.type}, ${input.date || null},
        false, ${JSON.stringify({ ...(input.metadata || {}), employeeId: input.employeeId })}::jsonb, now(), now()
      );
    `;
  }

  return { notificationId, podLeadNotificationId };
}
