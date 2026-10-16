import { NextResponse } from "next/server";
import { z } from "zod";
import { getPool } from "@/server/db";
import { jsonError, unexpectedError } from "@/server/http";
import { getWorkspace } from "@/server/workspaces";
import { consumeRateLimit } from "@/server/rate-limit";

export const dynamic = "force-dynamic";

const createSchema = z.object({
  label: z.string().trim().min(1).max(120),
  commitSha: z.string().regex(/^[0-9a-fA-F]{7,40}$/).optional().or(z.literal("")),
  environment: z.string().trim().max(80).optional(),
  releasedAt: z.string().datetime().optional(),
});

export async function GET() {
  try {
    const workspace = await getWorkspace();
    if (!workspace) return jsonError("unauthenticated", "Sign in to view release markers.", 401);
    const result = await getPool().query(
      `SELECT marker.id, marker.label, marker.commit_sha, marker.environment, marker.released_at,
              marker.created_at, count(association.audit_run_id)::int AS associated_audits
       FROM release_marker marker LEFT JOIN release_audit_association association ON association.release_marker_id = marker.id
       WHERE marker.project_id = $1 GROUP BY marker.id ORDER BY marker.released_at DESC LIMIT 100`,
      [workspace.projectId],
    );
    return NextResponse.json({ releases: result.rows });
  } catch {
    return unexpectedError();
  }
}

export async function POST(request: Request) {
  try {
    const workspace = await getWorkspace();
    if (!workspace) return jsonError("unauthenticated", "Sign in to record a release.", 401);
    if (!await consumeRateLimit(workspace.organizationId, "release_create", 20, 3600)) return jsonError("rate_limited", "Release marker creation is temporarily rate limited.", 429);
    let json: unknown;
    try { json = await request.json(); } catch { return jsonError("invalid_json", "Provide a valid release marker.", 400); }
    const parsed = createSchema.safeParse(json);
    if (!parsed.success) return jsonError("invalid_release", "Check the release label, commit SHA, and environment.", 400);
    const result = await getPool().query(
      `INSERT INTO release_marker (project_id, label, commit_sha, environment, released_at, created_by)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id, label, commit_sha, environment, released_at, created_at`,
      [workspace.projectId, parsed.data.label, parsed.data.commitSha || null, parsed.data.environment || null,
        parsed.data.releasedAt ? new Date(parsed.data.releasedAt) : new Date(), workspace.userId],
    );
    return NextResponse.json({ release: result.rows[0] }, { status: 201 });
  } catch {
    return unexpectedError();
  }
}
