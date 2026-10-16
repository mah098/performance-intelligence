import { NextResponse } from "next/server";
import { getPool } from "@/server/db";
import { jsonError, unexpectedError } from "@/server/http";
import { getWorkspace } from "@/server/workspaces";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const workspace = await getWorkspace();
    if (!workspace) return jsonError("unauthenticated", "Sign in to view regression alerts.", 401);
    const result = await getPool().query(
      `SELECT event.id, event.metric_key, event.source, event.form_factor, event.scope, event.policy_version,
              event.before_value::text, event.after_value::text, event.delta::text,
              event.relative_change_percent::text, event.severity, event.status, event.detected_at,
              url.url, url.label, alert.id AS alert_id, alert.read_at
       FROM regression_event event
       JOIN monitored_url url ON url.id = event.monitored_url_id
       JOIN project ON project.id = event.project_id AND project.organization_id = $1
       LEFT JOIN in_app_alert alert ON alert.regression_event_id = event.id
       ORDER BY event.detected_at DESC LIMIT 100`,
      [workspace.organizationId],
    );
    return NextResponse.json({ regressions: result.rows });
  } catch {
    return unexpectedError();
  }
}
