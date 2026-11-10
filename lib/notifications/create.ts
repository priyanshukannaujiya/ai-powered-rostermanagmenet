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
  const queries = [
    sql`
      INSERT INTO notifications (id, employee_id, title, message, type, date, read, metadata, created_at, updated_at)
      VALUES (
        ${notificationId}, ${input.employeeId}, ${input.title}, ${input.message},
        ${input.type}, ${input.date || null}, false, ${metadata}::jsonb, now(), now()
      );
    `,
  ];

  if (podLeadNotificationId && podLeadId) {
    const employeeName = employeeRows[0]?.name || "An employee";
    queries.push(sql`
      INSERT INTO notifications (id, employee_id, title, message, type, date, read, metadata, created_at, updated_at)
      VALUES (
        ${podLeadNotificationId}, ${podLeadId}, ${`Pod update: ${input.title}`},
        ${`${employeeName}: ${input.message}`}, ${input.type}, ${input.date || null},
        false, ${JSON.stringify({ ...(input.metadata || {}), employeeId: input.employeeId })}::jsonb, now(), now()
      );
    `);
  }

  await sql.transaction(queries);
  return { notificationId, podLeadNotificationId };
}
