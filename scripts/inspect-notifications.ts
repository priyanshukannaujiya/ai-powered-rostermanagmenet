import 'dotenv/config';
import { neon } from '@neondatabase/serverless';
import '../lib/db/dns-patch';

async function main() {
  const sql = neon(process.env.DATABASE_URL!);
  const notifs = await sql`
    SELECT n.id, n.employee_id, e.name as employee_name, n.title, n.message, n.type, n.read, n.created_at
    FROM notifications n
    LEFT JOIN employees e ON n.employee_id = e.id
    ORDER BY n.created_at DESC
    LIMIT 20;
  `;
  console.log('NOTIFICATIONS IN DB:', JSON.stringify(notifs, null, 2));
}

main().catch(console.error);

