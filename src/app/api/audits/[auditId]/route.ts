import { NextResponse } from "next/server";
import { z } from "zod";
import { getPool } from "@/server/db";
import { jsonError, unexpectedError } from "@/server/http";
import { getWorkspace } from "@/server/workspaces";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, context: { params: Promise<{ auditId: string }> }) {
  try {
    const workspace = await getWorkspace();
    if (!workspace) return jsonError("unauthenticated", "Sign in to view this audit.", 401);
    const params = z.object({ auditId: z.string().uuid() }).safeParse(await context.params);
    if (!params.success) return jsonError("not_found", "The audit was not found.", 404);
    const result = await getPool().query(
      `SELECT a.id, a.status, a.requested_strategy, a.requested_url, a.final_url, a.queued_at,
              a.started_at, a.completed_at, a.lighthouse_version, a.lab_categories, a.lab_metrics,
              a.evidence, a.warnings, a.field_data_status, a.field_data, a.error_code, a.error_message,
              u.id AS monitored_url_id, u.label
       FROM audit_run a JOIN monitored_url u ON u.id = a.monitored_url_id
       JOIN project p ON p.id = u.project_id
       WHERE a.id = $1 AND p.organization_id = $2`,
      [params.data.auditId, workspace.organizationId],
    );
    const audit = result.rows[0];
    if (!audit) return jsonError("not_found", "The audit was not found.", 404);
    return NextResponse.json({ audit });
  } catch {
    return unexpectedError();
  }
}
