import { createHash, randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { canonicalizePublicHttpsUrl, UnsafeUrlError } from "@/domain/urls/policy";
import { getPool } from "@/server/db";
import { getServerEnv } from "@/server/env";
import { jsonError, unexpectedError } from "@/server/http";

export const dynamic = "force-dynamic";

const requestSchema = z.object({
  url: z.string().trim().min(1).max(2048),
  strategy: z.enum(["mobile", "desktop"]).default("mobile"),
});

function sha256(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

async function readRequestBody(request: Request, maxBytes: number): Promise<string> {
  const declaredBytes = Number(request.headers.get("content-length"));
  if (Number.isFinite(declaredBytes) && declaredBytes > maxBytes) throw new Error("request_too_large");
  if (!request.body) return "";
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      totalBytes += value.byteLength;
      if (totalBytes > maxBytes) {
        await reader.cancel();
        throw new Error("request_too_large");
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const body = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) { body.set(chunk, offset); offset += chunk.byteLength; }
  return new TextDecoder().decode(body);
}

export async function POST(request: Request) {
  const configuredOrigin = getServerEnv().APP_BASE_URL;
  const expectedOrigin = configuredOrigin ? new URL(configuredOrigin).origin : new URL(request.url).origin;
  if (request.headers.get("origin") !== expectedOrigin) {
    return jsonError("invalid_origin", "Submit the quick audit from this site.", 403);
  }

  let input: unknown;
  try {
    input = JSON.parse(await readRequestBody(request, 4096));
  } catch (error) {
    if (error instanceof Error && error.message === "request_too_large") {
      return jsonError("request_too_large", "The quick-audit request is too large.", 413);
    }
    return jsonError("invalid_input", "Enter a valid public HTTPS URL using a small JSON request.", 400);
  }
  const parsed = requestSchema.safeParse(input);
  if (!parsed.success) return jsonError("invalid_input", "Enter a valid public HTTPS URL and choose a device.", 400);

  let canonicalUrl: string;
  try {
    canonicalUrl = canonicalizePublicHttpsUrl(parsed.data.url);
  } catch (error) {
    if (error instanceof UnsafeUrlError) return jsonError("unsafe_url", error.message, 422);
    return jsonError("invalid_url", "Enter a valid public HTTPS URL.", 422);
  }

  const forwarded = request.headers.get("x-real-ip") ?? request.headers.get("x-forwarded-for")?.split(",", 1)[0]?.trim();
  const clientFingerprint = sha256(forwarded?.slice(0, 128) || "unknown-client");
  const token = randomBytes(32).toString("base64url");
  const pool = getPool();
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(
      `DELETE FROM organization
       WHERE id IN (SELECT organization_id FROM guest_audit_access WHERE expires_at <= now())`,
    );
    await client.query("DELETE FROM public_audit_rate_limit WHERE window_started_at < now() - interval '2 days'");

    const limit = await client.query(
      `INSERT INTO public_audit_rate_limit (client_fingerprint, window_started_at, request_count)
       VALUES ($1, to_timestamp(floor(extract(epoch FROM now()) / 3600) * 3600), 1)
       ON CONFLICT (client_fingerprint, window_started_at) DO UPDATE
         SET request_count = public_audit_rate_limit.request_count + 1, updated_at = now()
         WHERE public_audit_rate_limit.request_count < 3
       RETURNING request_count`,
      [clientFingerprint],
    );
    if (limit.rowCount === 0) {
      await client.query("COMMIT");
      return jsonError("rate_limited", "Quick audits are limited to 3 per hour. Sign in to continue monitoring this page.", 429);
    }

    await client.query("SELECT pg_advisory_xact_lock(hashtextextended('public-quick-audit-cap', 0))");
    const active = await client.query<{ count: number }>(
      "SELECT count(*)::int AS count FROM audit_job WHERE status IN ('queued', 'running')",
    );
    if ((active.rows[0]?.count ?? 0) >= 50) {
      await client.query("COMMIT");
      return jsonError("busy", "Quick audits are busy right now. Please try again shortly.", 429, true);
    }

    const organization = await client.query<{ id: string }>(
      "INSERT INTO organization (name) VALUES ('Quick audit') RETURNING id",
    );
    const organizationId = organization.rows[0]?.id;
    if (!organizationId) throw new Error("Could not create quick-audit workspace.");
    const project = await client.query<{ id: string }>(
      "INSERT INTO project (organization_id, name) VALUES ($1, 'One-time audit') RETURNING id",
      [organizationId],
    );
    const projectId = project.rows[0]?.id;
    if (!projectId) throw new Error("Could not create quick-audit project.");
    const monitoredUrl = await client.query<{ id: string }>(
      `INSERT INTO monitored_url (project_id, url, canonical_url, label)
       VALUES ($1, $2, $2, 'Quick audit') RETURNING id`,
      [projectId, canonicalUrl],
    );
    const urlId = monitoredUrl.rows[0]?.id;
    if (!urlId) throw new Error("Could not create monitored URL.");
    const audit = await client.query<{ id: string }>(
      `INSERT INTO audit_run (monitored_url_id, requested_strategy, status, idempotency_key, requested_url)
       VALUES ($1, $2, 'queued', $3, $4) RETURNING id`,
      [urlId, parsed.data.strategy, randomBytes(24).toString("base64url"), canonicalUrl],
    );
    const auditId = audit.rows[0]?.id;
    if (!auditId) throw new Error("Could not enqueue quick audit.");
    await client.query("INSERT INTO audit_job (audit_run_id, status) VALUES ($1, 'queued')", [auditId]);
    await client.query(
      `INSERT INTO guest_audit_access (audit_run_id, organization_id, token_sha256, expires_at)
       VALUES ($1, $2, $3, now() + interval '24 hours')`,
      [auditId, organizationId, sha256(token)],
    );
    await client.query("COMMIT");
    return NextResponse.json({ auditId, token, status: "queued" }, { status: 202, headers: { "Cache-Control": "no-store" } });
  } catch {
    await client.query("ROLLBACK");
    return unexpectedError();
  } finally {
    client.release();
  }
}
