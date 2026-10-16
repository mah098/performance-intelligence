import { NextResponse } from "next/server";
import { z } from "zod";
import { getPool } from "@/server/db";
import { jsonError, unexpectedError } from "@/server/http";
import { getWorkspace } from "@/server/workspaces";
import { consumeRateLimit } from "@/server/rate-limit";

export const dynamic = "force-dynamic";

const requestSchema = z.object({ strategy: z.enum(["mobile", "desktop"]) });
const paramsSchema = z.object({ urlId: z.string().uuid() });

export async function POST(request: Request, context: { params: Promise<{ urlId: string }> }) {
  const workspace = await getWorkspace();
  if (!workspace) return jsonError("unauthenticated", "Sign in to run an audit.", 401);
  if (!await consumeRateLimit(workspace.organizationId, "audit_enqueue", 10, 3600)) return jsonError("rate_limited", "This workspace has reached its manual audit limit for this hour.", 429);
  const params = paramsSchema.safeParse(await context.params);
  if (!params.success) return jsonError("invalid_url_id", "The monitored URL was not found.", 404);
  const body = requestSchema.safeParse(await request.json());
  if (!body.success) return jsonError("invalid_input", "Choose mobile or desktop for the audit.", 400);
  const key = request.headers.get("idempotency-key");
  if (!key || key.length > 120) return jsonError("idempotency_key_required", "A valid idempotency key is required.", 400);

  const pool = getPool();
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const target = await client.query<{ id: string; url: string }>(
      `SELECT u.id, u.url FROM monitored_url u JOIN project p ON p.id = u.project_id
       WHERE u.id = $1 AND p.organization_id = $2 AND u.enabled = true FOR SHARE`,
      [params.data.urlId, workspace.organizationId],
    );
    const url = target.rows[0];
    if (!url) {
      await client.query("ROLLBACK");
      return jsonError("not_found", "The monitored URL was not found.", 404);
    }
    const inserted = await client.query<{ id: string; status: string }>(
      `INSERT INTO audit_run (monitored_url_id, requested_strategy, status, idempotency_key, requested_url)
       VALUES ($1, $2, 'queued', $3, $4)
       ON CONFLICT (monitored_url_id, idempotency_key) DO NOTHING
       RETURNING id, status`,
      [url.id, body.data.strategy, key, url.url],
    );
    let audit = inserted.rows[0];
    if (audit) {
      await client.query("INSERT INTO audit_job (audit_run_id, status) VALUES ($1, 'queued')", [audit.id]);
    } else {
      const existing = await client.query<{ id: string; status: string; requested_strategy: string }>(
        `SELECT id, status, requested_strategy FROM audit_run WHERE monitored_url_id = $1 AND idempotency_key = $2`,
        [url.id, key],
      );
      const previous = existing.rows[0];
      if (!previous || previous.requested_strategy !== body.data.strategy) {
        await client.query("ROLLBACK");
        return jsonError("idempotency_conflict", "This request key was already used for a different audit.", 409);
      }
      audit = previous;
    }
    await client.query("COMMIT");
    return NextResponse.json({ auditRunId: audit.id, status: audit.status }, { status: inserted.rows[0] ? 202 : 200 });
  } catch {
    await client.query("ROLLBACK");
    return unexpectedError();
  } finally {
    client.release();
  }
}
