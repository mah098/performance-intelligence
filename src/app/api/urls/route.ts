import { NextResponse } from "next/server";
import { z } from "zod";
import { canonicalizePublicHttpsUrl, UnsafeUrlError } from "@/domain/urls/policy";
import { jsonError, unexpectedError } from "@/server/http";
import { getPool } from "@/server/db";
import { getWorkspace } from "@/server/workspaces";
import { consumeRateLimit } from "@/server/rate-limit";

export const dynamic = "force-dynamic";

const createSchema = z.object({ url: z.string().min(1).max(2048), label: z.string().trim().max(80).optional() });

export async function GET() {
  try {
    const workspace = await getWorkspace();
    if (!workspace) return jsonError("unauthenticated", "Sign in to view monitored URLs.", 401);
    const result = await getPool().query(
      `SELECT u.id, u.url, u.label, u.created_at,
              a.id AS latest_audit_id, a.status AS latest_status, a.requested_strategy AS latest_strategy,
              a.completed_at AS latest_completed_at, a.lab_categories AS latest_categories,
              (SELECT count(*)::int FROM audit_run history WHERE history.monitored_url_id = u.id) AS run_count
       FROM monitored_url u
       JOIN project p ON p.id = u.project_id AND p.organization_id = $1
       LEFT JOIN LATERAL (
         SELECT id, status, requested_strategy, completed_at, lab_categories
         FROM audit_run WHERE monitored_url_id = u.id
         ORDER BY queued_at DESC LIMIT 1
       ) a ON true
       WHERE u.enabled = true
       ORDER BY u.created_at DESC LIMIT 100`,
      [workspace.organizationId],
    );
    return NextResponse.json({ urls: result.rows, projectId: workspace.projectId });
  } catch {
    return unexpectedError();
  }
}

export async function POST(request: Request) {
  try {
    const workspace = await getWorkspace();
    if (!workspace) return jsonError("unauthenticated", "Sign in to add a monitored URL.", 401);
    if (!await consumeRateLimit(workspace.organizationId, "url_create", 20, 3600)) return jsonError("rate_limited", "URL creation is temporarily rate limited. Try again later.", 429);
    const body = createSchema.safeParse(await request.json());
    if (!body.success) return jsonError("invalid_input", "Enter a URL and an optional label of at most 80 characters.", 400);
    let canonicalUrl: string;
    try {
      canonicalUrl = canonicalizePublicHttpsUrl(body.data.url);
    } catch (error) {
      if (error instanceof UnsafeUrlError) return jsonError("unsafe_url", error.message, 422);
      throw error;
    }

    const pool = getPool();
    const count = await pool.query<{ count: number }>(
      `SELECT count(*)::int AS count FROM monitored_url u JOIN project p ON p.id = u.project_id WHERE p.organization_id = $1 AND u.enabled = true`,
      [workspace.organizationId],
    );
    if ((count.rows[0]?.count ?? 0) >= 100) return jsonError("url_limit_reached", "This workspace can monitor up to 100 URLs in the MVP.", 429);

    const result = await pool.query(
      `INSERT INTO monitored_url (project_id, url, canonical_url, label)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (project_id, canonical_url) DO NOTHING
       RETURNING id, url, label, created_at`,
      [workspace.projectId, canonicalUrl, canonicalUrl, body.data.label?.trim() || null],
    );
    const created = result.rows[0];
    if (!created) return jsonError("duplicate_url", "That URL is already monitored in this project.", 409);
    return NextResponse.json({ url: created }, { status: 201 });
  } catch {
    return unexpectedError();
  }
}
