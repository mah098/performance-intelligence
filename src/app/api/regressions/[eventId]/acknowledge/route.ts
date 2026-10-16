import { NextResponse } from "next/server";
import { z } from "zod";
import { getPool } from "@/server/db";
import { jsonError, unexpectedError } from "@/server/http";
import { getWorkspace } from "@/server/workspaces";

export const dynamic = "force-dynamic";

export async function POST(_request: Request, context: { params: Promise<{ eventId: string }> }) {
  try {
    const workspace = await getWorkspace();
    if (!workspace) return jsonError("unauthenticated", "Sign in to acknowledge this alert.", 401);
    const parsed = z.object({ eventId: z.string().uuid() }).safeParse(await context.params);
    if (!parsed.success) return jsonError("not_found", "The regression was not found.", 404);
    const pool = getPool();
    const result = await pool.query(
      `UPDATE regression_event event SET status = 'acknowledged', acknowledged_at = COALESCE(acknowledged_at, now()), acknowledged_by = $2
       FROM project WHERE project.id = event.project_id AND project.organization_id = $1 AND event.id = $3
       RETURNING event.id, event.status, event.acknowledged_at`,
      [workspace.organizationId, workspace.userId, parsed.data.eventId],
    );
    if (!result.rows[0]) return jsonError("not_found", "The regression was not found.", 404);
    await pool.query("UPDATE in_app_alert SET read_at = COALESCE(read_at, now()) WHERE regression_event_id = $1", [parsed.data.eventId]);
    return NextResponse.json({ regression: result.rows[0] });
  } catch {
    return unexpectedError();
  }
}
