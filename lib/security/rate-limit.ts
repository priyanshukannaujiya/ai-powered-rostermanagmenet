import { createHash } from "crypto";
import type { NeonQueryFunction } from "@neondatabase/serverless";

export async function consumeRateLimit(
  sql: NeonQueryFunction<false, false>,
  key: string,
  limit: number,
  windowSeconds: number
): Promise<{ allowed: boolean; count: number }> {
  try {
    const digest = createHash("sha256").update(key).digest("hex");
    const runInsert = () =>
      sql`
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

    let rows: any;
    try {
      rows = await runInsert();
    } catch (dbErr: any) {
      if (dbErr?.code === "42P01") {
        // Table does not exist: create it and retry once
        await sql`
          CREATE TABLE IF NOT EXISTS rate_limit_buckets (
            bucket_key text PRIMARY KEY,
            window_started_at timestamptz NOT NULL,
            request_count integer NOT NULL DEFAULT 0,
            expires_at timestamptz NOT NULL
          );
        `;
        await sql`CREATE INDEX IF NOT EXISTS rate_limit_buckets_expiry_idx ON rate_limit_buckets(expires_at);`;
        rows = await runInsert();
      } else {
        throw dbErr;
      }
    }

    const count = Number(rows[0]?.request_count ?? limit + 1);
    return { allowed: count <= limit, count };
  } catch (error: any) {
    console.warn(`[RATE_LIMIT] Rate limiter transient error: ${error?.message || error}. Failing open.`);
    return { allowed: true, count: 0 };
  }
}

export async function clearRateLimit(
  sql: NeonQueryFunction<false, false>,
  key: string
): Promise<void> {
  try {
    const digest = createHash("sha256").update(key).digest("hex");
    await sql`DELETE FROM rate_limit_buckets WHERE bucket_key = ${digest};`;
  } catch (error: any) {
    console.warn(`[RATE_LIMIT] Failed to clear rate limit bucket: ${error?.message || error}`);
  }
}
