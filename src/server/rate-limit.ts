import { getPool } from "@/server/db";

export async function consumeRateLimit(organizationId: string, action: string, maxRequests: number, windowSeconds: number): Promise<boolean> {
  const result = await getPool().query<{ request_count: number }>(
    `INSERT INTO api_rate_limit_bucket (organization_id, action, window_started_at, request_count)
     SELECT $1, $2, to_timestamp(floor(extract(epoch FROM now()) / $4) * $4), 1
     ON CONFLICT (organization_id, action, window_started_at) DO UPDATE
       SET request_count = api_rate_limit_bucket.request_count + 1, updated_at = now()
       WHERE api_rate_limit_bucket.request_count < $3
     RETURNING request_count`,
    [organizationId, action, maxRequests, windowSeconds],
  );
  if (Math.random() < 0.02) {
    await getPool().query("DELETE FROM api_rate_limit_bucket WHERE window_started_at < now() - interval '7 days'");
  }
  return result.rows.length > 0;
}
