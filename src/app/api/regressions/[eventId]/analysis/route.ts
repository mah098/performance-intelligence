import { NextResponse } from "next/server";
import { z } from "zod";
import { getPool } from "@/server/db";
import { jsonError, unexpectedError } from "@/server/http";
import { getWorkspace } from "@/server/workspaces";
import { isAnalysisConfigured, getAnalysisModel, type AnalysisEvidence } from "@/providers/openai/client";
import { ANALYSIS_SCHEMA_VERSION } from "@/domain/ai/analysis";
import { consumeRateLimit } from "@/server/rate-limit";

export const dynamic = "force-dynamic";
const eventParams = z.object({ eventId: z.string().uuid() });

export async function GET(_request: Request, context: { params: Promise<{ eventId: string }> }) {
  try {
    const workspace = await getWorkspace();
    if (!workspace) return jsonError("unauthenticated", "Sign in to view analysis.", 401);
    const params = eventParams.safeParse(await context.params);
    if (!params.success) return jsonError("not_found", "The regression was not found.", 404);
    const result = await getPool().query(
      `SELECT analysis.id, analysis.status, analysis.result, analysis.model, analysis.schema_version,
              analysis.error_code, analysis.created_at, analysis.completed_at
       FROM regression_analysis analysis
       JOIN regression_event event ON event.id = analysis.regression_event_id
       JOIN project ON project.id = event.project_id AND project.organization_id = $2
       WHERE event.id = $1`,
      [params.data.eventId, workspace.organizationId],
    );
    return NextResponse.json({ enabled: isAnalysisConfigured(), analysis: result.rows[0] ?? null });
  } catch {
    return unexpectedError();
  }
}

export async function POST(_request: Request, context: { params: Promise<{ eventId: string }> }) {
  try {
    const workspace = await getWorkspace();
    if (!workspace) return jsonError("unauthenticated", "Sign in to request analysis.", 401);
    if (!await consumeRateLimit(workspace.organizationId, "analysis_request", 5, 3600)) return jsonError("rate_limited", "AI analysis is limited to five requests per hour for this workspace.", 429);
    const params = eventParams.safeParse(await context.params);
    if (!params.success) return jsonError("not_found", "The regression was not found.", 404);
    if (!isAnalysisConfigured()) return jsonError("analysis_not_configured", "AI analysis is unavailable until OPENAI_API_KEY is configured on the server.", 503);
    const pool = getPool();
    const eventResult = await pool.query<{
      metric_key: string; source: string; form_factor: string; scope: string;
      before_value: string; after_value: string; delta: string; unit: string;
      requested_url: string; current_evidence: unknown; previous_evidence: unknown;
    }>(
      `SELECT event.metric_key, event.source, event.form_factor, event.scope,
              event.before_value::text, event.after_value::text, event.delta::text,
              current_observation.unit, current_run.requested_url,
              current_run.evidence AS current_evidence, previous_run.evidence AS previous_evidence
       FROM regression_event event
       JOIN project ON project.id = event.project_id AND project.organization_id = $2
       JOIN metric_observation current_observation ON current_observation.id = event.current_observation_id
       JOIN metric_observation previous_observation ON previous_observation.id = event.previous_observation_id
       JOIN audit_run current_run ON current_run.id = current_observation.audit_run_id
       JOIN audit_run previous_run ON previous_run.id = previous_observation.audit_run_id
       WHERE event.id = $1`,
      [params.data.eventId, workspace.organizationId],
    );
    const row = eventResult.rows[0];
    if (!row) return jsonError("not_found", "The regression was not found.", 404);
    const evidence: AnalysisEvidence[] = [
      { id: "measurement:before", title: "Previous measured value", description: `${row.metric_key}: ${row.before_value} ${row.unit} (${row.source}, ${row.form_factor}, ${row.scope}).` },
      { id: "measurement:after", title: "Current measured value", description: `${row.metric_key}: ${row.after_value} ${row.unit} (${row.source}, ${row.form_factor}, ${row.scope}).` },
      ...auditEvidence(row.previous_evidence, "previous"),
      ...auditEvidence(row.current_evidence, "current"),
    ].slice(0, 30);
    const requestInput = {
      host: new URL(row.requested_url).hostname,
      metricKey: row.metric_key,
      source: row.source,
      formFactor: row.form_factor,
      scope: row.scope,
      beforeValue: Number(row.before_value),
      afterValue: Number(row.after_value),
      delta: Number(row.delta),
      evidence,
    };
    const result = await pool.query(
      `INSERT INTO regression_analysis (regression_event_id, status, request_input, model, schema_version)
       VALUES ($1, 'queued', $2, $3, $4)
       ON CONFLICT (regression_event_id) DO UPDATE SET
         status = CASE WHEN regression_analysis.status = 'failed' THEN 'queued' ELSE regression_analysis.status END,
         request_input = CASE WHEN regression_analysis.status = 'failed' THEN EXCLUDED.request_input ELSE regression_analysis.request_input END,
         result = CASE WHEN regression_analysis.status = 'failed' THEN NULL ELSE regression_analysis.result END,
         error_code = CASE WHEN regression_analysis.status = 'failed' THEN NULL ELSE regression_analysis.error_code END,
         model = EXCLUDED.model,
         updated_at = CASE WHEN regression_analysis.status = 'failed' THEN now() ELSE regression_analysis.updated_at END
       RETURNING id, status, model, schema_version, created_at, completed_at`,
      [params.data.eventId, JSON.stringify(requestInput), getAnalysisModel(), ANALYSIS_SCHEMA_VERSION],
    );
    return NextResponse.json({ analysis: result.rows[0] }, { status: result.rows[0]?.status === "queued" ? 202 : 200 });
  } catch {
    return unexpectedError();
  }
}

function auditEvidence(value: unknown, prefix: string): AnalysisEvidence[] {
  if (!Array.isArray(value)) return [];
  return value.slice(0, 14).flatMap((item): AnalysisEvidence[] => {
    if (!item || typeof item !== "object") return [];
    const evidence = item as Record<string, unknown>;
    if (typeof evidence.id !== "string" || typeof evidence.title !== "string") return [];
    const description = typeof evidence.description === "string" ? evidence.description.slice(0, 700) : "No diagnostic description was supplied.";
    const score = typeof evidence.score === "number" && Number.isFinite(evidence.score) ? evidence.score : null;
    return [{ id: `${prefix}:${evidence.id}`.slice(0, 100), title: evidence.title.slice(0, 150), description, score }];
  });
}
