import { NextResponse } from "next/server";
import { z } from "zod";
import { getPool } from "@/server/db";
import { jsonError, unexpectedError } from "@/server/http";
import { getWorkspace } from "@/server/workspaces";

export const dynamic = "force-dynamic";

export async function POST(request: Request, context: { params: Promise<{ releaseId: string }> }) {
  try {
    const workspace = await getWorkspace();
    if (!workspace) return jsonError("unauthenticated", "Sign in to associate an audit.", 401);
    const params = z.object({ releaseId: z.string().uuid() }).safeParse(await context.params);
    if (!params.success) return jsonError("not_found", "The release marker was not found.", 404);
    let json: unknown;
    try { json = await request.json(); } catch { return jsonError("invalid_json", "Provide an audit run ID.", 400); }
    const body = z.object({ auditRunId: z.string().uuid() }).safeParse(json);
    if (!body.success) return jsonError("invalid_audit", "Choose a valid audit run.", 400);
    const result = await getPool().query(
      `INSERT INTO release_audit_association (release_marker_id, audit_run_id, associated_by)
       SELECT marker.id, run.id, $4
       FROM release_marker marker
       JOIN audit_run run ON run.id = $2 AND run.status IN ('succeeded', 'partial')
       JOIN monitored_url url ON url.id = run.monitored_url_id AND url.project_id = marker.project_id
       WHERE marker.id = $1 AND marker.project_id = $3
       ON CONFLICT (release_marker_id, audit_run_id) DO UPDATE SET associated_by = EXCLUDED.associated_by
       RETURNING release_marker_id, audit_run_id, associated_at`,
      [params.data.releaseId, body.data.auditRunId, workspace.projectId, workspace.userId],
    );
    if (!result.rows[0]) return jsonError("not_found", "A compatible release and completed audit were not found in this project.", 404);
    return NextResponse.json({ association: result.rows[0] }, { status: 201 });
  } catch {
    return unexpectedError();
  }
}
