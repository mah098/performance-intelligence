import { NextResponse } from "next/server";
import { z } from "zod";
import { defaultRegressionPolicy } from "@/domain/regressions/service";
import { getPool } from "@/server/db";
import { jsonError, unexpectedError } from "@/server/http";
import { getWorkspace } from "@/server/workspaces";

export const dynamic = "force-dynamic";

const policySchema = z.object({
  metricKey: z.string().min(1).max(80),
  source: z.enum(["lighthouse_lab", "crux_field"]),
  formFactor: z.enum(["mobile", "desktop", "PHONE", "DESKTOP"]),
  scope: z.enum(["page", "origin"]),
  absoluteThreshold: z.number().positive().finite(),
  relativeThresholdPercent: z.number().positive().max(1000).finite().optional(),
});

export async function GET() {
  try {
    const workspace = await getWorkspace();
    if (!workspace) return jsonError("unauthenticated", "Sign in to view regression policies.", 401);
    const result = await getPool().query(
      `SELECT id, metric_key, source, form_factor, scope, direction, absolute_threshold::text,
              relative_threshold_percent::text, enabled, version, updated_at
       FROM regression_policy WHERE project_id = $1 ORDER BY metric_key, source, form_factor, scope`,
      [workspace.projectId],
    );
    return NextResponse.json({ policies: result.rows });
  } catch {
    return unexpectedError();
  }
}

export async function POST(request: Request) {
  try {
    const workspace = await getWorkspace();
    if (!workspace) return jsonError("unauthenticated", "Sign in to configure regression thresholds.", 401);
    let json: unknown;
    try { json = await request.json(); } catch { return jsonError("invalid_json", "Provide a valid JSON policy.", 400); }
    const parsed = policySchema.safeParse(json);
    if (!parsed.success) return jsonError("invalid_policy", "Check the metric and threshold values.", 400);
    const defaults = defaultRegressionPolicy(parsed.data.metricKey);
    if (!defaults) return jsonError("unsupported_metric", "That metric does not support regression rules yet.", 422);
    if (parsed.data.source === "crux_field" && parsed.data.metricKey.includes("_score")) return jsonError("unsupported_source", "Lighthouse category scores are not CrUX field metrics.", 422);
    if (parsed.data.source === "lighthouse_lab" && parsed.data.scope !== "page") return jsonError("unsupported_scope", "Lighthouse lab observations are page-scoped.", 422);
    if (parsed.data.source === "lighthouse_lab" && !["mobile", "desktop"].includes(parsed.data.formFactor)) return jsonError("invalid_form_factor", "Lab rules use mobile or desktop form factors.", 422);
    if (parsed.data.source === "crux_field" && !["PHONE", "DESKTOP"].includes(parsed.data.formFactor)) return jsonError("invalid_form_factor", "CrUX rules use PHONE or DESKTOP form factors.", 422);

    const result = await getPool().query(
      `INSERT INTO regression_policy
        (project_id, metric_key, source, form_factor, scope, direction, absolute_threshold, relative_threshold_percent)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       ON CONFLICT (project_id, metric_key, source, form_factor, scope)
       DO UPDATE SET direction = EXCLUDED.direction, absolute_threshold = EXCLUDED.absolute_threshold,
         relative_threshold_percent = EXCLUDED.relative_threshold_percent, enabled = true,
         version = regression_policy.version + 1, updated_at = now()
       RETURNING id, metric_key, source, form_factor, scope, direction, absolute_threshold::text,
         relative_threshold_percent::text, enabled, version, updated_at`,
      [workspace.projectId, parsed.data.metricKey, parsed.data.source, parsed.data.formFactor, parsed.data.scope,
        defaults.direction, parsed.data.absoluteThreshold, parsed.data.relativeThresholdPercent ?? null],
    );
    return NextResponse.json({ policy: result.rows[0] }, { status: 201 });
  } catch {
    return unexpectedError();
  }
}
