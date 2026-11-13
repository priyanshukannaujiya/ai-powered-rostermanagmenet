import { createHash } from "crypto";
import type { NeonQueryFunction } from "@neondatabase/serverless";

export async function consumeRateLimit(
  sql: NeonQueryFunction<false, false>,
  key: string,
  limit: number,
  windowSeconds: number
): Promise<{ allowed: boolean; count: number }> {
  const digest = createHash("sha256").update(key).digest("hex");
  const rows = await sql`
    INSERT INTO rate_limit_buckets (bucket_key, window_started_at, request_count, expires_at)
    VALUES (${digest}, now(), 1, now() + (${windowSeconds} * interval '1 second'))
    ON CONFLICT (bucket_key) DO UPDATE SET
      request_count = CASE
        WHEN rate_limit_buckets.window_started_at <= now() - (${windowSeconds} * interval '1 second') THEN 1
        ELSE rate_limit_buckets.request_count + 1
      END,
      window_started_at = CASE
        WHEN rate_limit_buckets.window_started_at <= now() - (${windowSeconds} * interval '1 second') THEN now()
        ELSE rate_limit_buckets.window_started_at
      END,
      expires_at = now() + (${windowSeconds} * interval '1 second')
    RETURNING request_count;
  `;
  const count = Number(rows[0]?.request_count ?? limit + 1);
  return { allowed: count <= limit, count };
}

export async function clearRateLimit(
  sql: NeonQueryFunction<false, false>,
  key: string
): Promise<void> {
  const digest = createHash("sha256").update(key).digest("hex");
  await sql`DELETE FROM rate_limit_buckets WHERE bucket_key = ${digest};`;
}
