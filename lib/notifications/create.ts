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
  eventId?: string;
};

export async function createEmployeeNotification(
  sql: NeonQueryFunction<false, false>,
  input: NotificationInput
) {
  const notificationId = "notif-" + randomUUID();
  const podLeadNotificationId = "notif-" + randomUUID();
  const eventKey = input.eventId ? input.employeeId + ":" + input.eventId : null;
  const metadata = JSON.stringify(input.metadata || {});
  const leadMetadata = JSON.stringify({ ...(input.metadata || {}), employeeId: input.employeeId });
  const rows = await sql`
    WITH target AS (
      SELECT e.name, p.lead_employee_id
      FROM employees e
      LEFT JOIN pods p ON p.id = e.pod_id
      WHERE e.id = ${input.employeeId}
      LIMIT 1
    ),
    employee_insert AS (
      INSERT INTO notifications
        (id, employee_id, title, message, type, date, read, metadata, dedupe_key, created_at, updated_at)
      SELECT ${notificationId}, ${input.employeeId}, ${input.title}, ${input.message},
        ${input.type}, ${input.date || null}, false, ${metadata}::jsonb, ${eventKey}, now(), now()
      FROM target
      ON CONFLICT (dedupe_key) WHERE dedupe_key IS NOT NULL DO NOTHING
      RETURNING id
    ),
    lead_insert AS (
      INSERT INTO notifications
        (id, employee_id, title, message, type, date, read, metadata, dedupe_key, created_at, updated_at)
      SELECT ${podLeadNotificationId}, target.lead_employee_id,
        'Pod update: ' || ${input.title},
        COALESCE(target.name, 'An employee') || ': ' || ${input.message},
        ${input.type}, ${input.date || null}, false, ${leadMetadata}::jsonb,
        CASE WHEN ${eventKey}::text IS NULL THEN NULL ELSE ${eventKey} || ':pod-lead' END,
        now(), now()
      FROM target
      JOIN employee_insert ON true
      WHERE ${Boolean(input.notifyPodLead)} AND target.lead_employee_id IS NOT NULL
        AND target.lead_employee_id <> ${input.employeeId}
      ON CONFLICT (dedupe_key) WHERE dedupe_key IS NOT NULL DO NOTHING
      RETURNING id
    )
    SELECT
      (SELECT id FROM employee_insert LIMIT 1) AS notification_id,
      (SELECT id FROM lead_insert LIMIT 1) AS pod_lead_notification_id;
  `;
  return {
    notificationId: (rows[0]?.notification_id as string | null) || null,
    podLeadNotificationId: (rows[0]?.pod_lead_notification_id as string | null) || null,
  };
}
