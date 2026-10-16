import { NextResponse } from "next/server";
import { z } from "zod";
import { getPool } from "@/server/db";
import { jsonError, unexpectedError } from "@/server/http";
import { getWorkspace } from "@/server/workspaces";
import { consumeRateLimit } from "@/server/rate-limit";

export const dynamic = "force-dynamic";

const paramsSchema = z.object({ urlId: z.string().uuid() });
const bodySchema = z.object({
  enabled: z.boolean(),
  frequencyHours: z.union([z.literal(24), z.literal(168), z.literal(720)]),
  strategy: z.enum(["mobile", "desktop"]),
});

export async function GET(_request: Request, context: { params: Promise<{ urlId: string }> }) {
  try {
    const workspace = await getWorkspace();
    if (!workspace) return jsonError("unauthenticated", "Sign in to view schedules.", 401);
    const parsed = paramsSchema.safeParse(await context.params);
    if (!parsed.success) return jsonError("not_found", "The monitored URL was not found.", 404);
    const result = await getPool().query(
      `SELECT schedule.id, schedule.enabled, schedule.frequency_hours, schedule.strategy,
              schedule.next_run_at, schedule.last_enqueued_at
       FROM monitored_url url JOIN project ON project.id = url.project_id AND project.organization_id = $2
       LEFT JOIN audit_schedule schedule ON schedule.monitored_url_id = url.id
       WHERE url.id = $1`,
      [parsed.data.urlId, workspace.organizationId],
    );
    if (!result.rows.length) return jsonError("not_found", "The monitored URL was not found.", 404);
    return NextResponse.json({ schedule: result.rows[0] ?? null });
  } catch {
    return unexpectedError();
  }
}

export async function PUT(request: Request, context: { params: Promise<{ urlId: string }> }) {
  try {
    const workspace = await getWorkspace();
    if (!workspace) return jsonError("unauthenticated", "Sign in to configure schedules.", 401);
    if (!await consumeRateLimit(workspace.organizationId, "schedule_update", 30, 3600)) return jsonError("rate_limited", "Schedule changes are temporarily rate limited.", 429);
    const parsedParams = paramsSchema.safeParse(await context.params);
    if (!parsedParams.success) return jsonError("not_found", "The monitored URL was not found.", 404);
    let json: unknown;
    try { json = await request.json(); } catch { return jsonError("invalid_json", "Provide a valid schedule.", 400); }
    const body = bodySchema.safeParse(json);
    if (!body.success) return jsonError("invalid_schedule", "Choose a daily, weekly, or monthly frequency and a device.", 400);

    const result = await getPool().query(
      `INSERT INTO audit_schedule (monitored_url_id, enabled, frequency_hours, strategy, next_run_at)
       SELECT url.id, $3, $4, $5, now() + make_interval(hours => $4)
       FROM monitored_url url JOIN project ON project.id = url.project_id
       WHERE url.id = $1 AND url.enabled = true AND project.organization_id = $2
       ON CONFLICT (monitored_url_id) DO UPDATE SET enabled = EXCLUDED.enabled,
         frequency_hours = EXCLUDED.frequency_hours, strategy = EXCLUDED.strategy,
         next_run_at = now() + make_interval(hours => EXCLUDED.frequency_hours), updated_at = now()
       RETURNING id, enabled, frequency_hours, strategy, next_run_at, last_enqueued_at`,
      [parsedParams.data.urlId, workspace.organizationId, body.data.enabled, body.data.frequencyHours, body.data.strategy],
    );
    if (!result.rows[0]) return jsonError("not_found", "The monitored URL was not found.", 404);
    return NextResponse.json({ schedule: result.rows[0] });
  } catch {
    return unexpectedError();
  }
}
