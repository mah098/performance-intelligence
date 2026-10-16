import { getPool } from "@/server/db";
import { detectRegression, type RegressionPolicy } from "@/domain/regressions/rules";

type Observation = {
  id: string;
  audit_run_id: string;
  monitored_url_id: string;
  project_id: string;
  organization_id: string;
  metric_key: string;
  value: string;
  source: "lighthouse_lab" | "crux_field";
  form_factor: string;
  scope: "page" | "origin";
  aggregation: "single_run" | "p75";
  completed_at: Date;
};

const DEFAULTS: Record<string, RegressionPolicy> = {
  lighthouse_performance_score: { direction: "lower_is_worse", absoluteThreshold: 5, relativeThresholdPercent: 7 },
  lighthouse_accessibility_score: { direction: "lower_is_worse", absoluteThreshold: 5, relativeThresholdPercent: 7 },
  lighthouse_best_practices_score: { direction: "lower_is_worse", absoluteThreshold: 5, relativeThresholdPercent: 7 },
  lighthouse_seo_score: { direction: "lower_is_worse", absoluteThreshold: 5, relativeThresholdPercent: 7 },
  largest_contentful_paint: { direction: "higher_is_worse", absoluteThreshold: 200, relativeThresholdPercent: 10 },
  interaction_to_next_paint: { direction: "higher_is_worse", absoluteThreshold: 80, relativeThresholdPercent: 10 },
  first_contentful_paint: { direction: "higher_is_worse", absoluteThreshold: 150, relativeThresholdPercent: 10 },
  time_to_first_byte: { direction: "higher_is_worse", absoluteThreshold: 100, relativeThresholdPercent: 10 },
  cumulative_layout_shift: { direction: "higher_is_worse", absoluteThreshold: 0.02 },
};

export function defaultRegressionPolicy(metricKey: string): RegressionPolicy | null {
  return DEFAULTS[metricKey] ?? null;
}

export async function detectAndPersistRegressions(auditRunId: string): Promise<number> {
  const pool = getPool();
  const currentResult = await pool.query<Observation>(
    `SELECT observation.id, observation.audit_run_id, url.id AS monitored_url_id,
            project.id AS project_id, project.organization_id, observation.metric_key, observation.value::text,
            observation.source, observation.form_factor, observation.scope, observation.aggregation, run.completed_at
     FROM metric_observation observation
     JOIN audit_run run ON run.id = observation.audit_run_id AND run.status IN ('succeeded', 'partial')
     JOIN monitored_url url ON url.id = run.monitored_url_id
     JOIN project ON project.id = url.project_id
     WHERE run.id = $1`,
    [auditRunId],
  );
  if (currentResult.rows.length === 0) return 0;

  let created = 0;
  for (const current of currentResult.rows) {
    const policyResult = await pool.query<{
      id: string;
      direction: RegressionPolicy["direction"];
      absolute_threshold: string;
      relative_threshold_percent: string | null;
      enabled: boolean;
      version: number;
    }>(
      `SELECT id, direction, absolute_threshold::text, relative_threshold_percent::text, enabled, version
       FROM regression_policy WHERE project_id = $1 AND metric_key = $2 AND source = $3
         AND form_factor = $4 AND scope = $5 LIMIT 1`,
      [current.project_id, current.metric_key, current.source, current.form_factor, current.scope],
    );
    const storedPolicy = policyResult.rows[0];
    if (storedPolicy && !storedPolicy.enabled) continue;
    const policy: RegressionPolicy | null = storedPolicy
      ? {
          direction: storedPolicy.direction,
          absoluteThreshold: Number(storedPolicy.absolute_threshold),
          relativeThresholdPercent: storedPolicy.relative_threshold_percent === null ? undefined : Number(storedPolicy.relative_threshold_percent),
        }
      : defaultRegressionPolicy(current.metric_key);
    if (!policy) continue;

    const previousResult = await pool.query<{ id: string; value: string }>(
      `SELECT previous.id, previous.value::text
       FROM metric_observation previous
       JOIN audit_run previous_run ON previous_run.id = previous.audit_run_id
       WHERE previous_run.monitored_url_id = $1
         AND previous_run.id <> $2
         AND previous_run.status IN ('succeeded', 'partial')
         AND previous_run.completed_at < $3
         AND previous.metric_key = $4 AND previous.source = $5
         AND previous.form_factor = $6 AND previous.scope = $7 AND previous.aggregation = $8
       ORDER BY previous_run.completed_at DESC
       LIMIT 1`,
      [current.monitored_url_id, auditRunId, current.completed_at, current.metric_key, current.source, current.form_factor, current.scope, current.aggregation],
    );
    const before = previousResult.rows[0];
    if (!before) continue;
    const decision = detectRegression(Number(before.value), Number(current.value), policy);
    if (!decision) continue;

    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const event = await client.query<{ id: string }>(
        `INSERT INTO regression_event
          (project_id, monitored_url_id, current_observation_id, previous_observation_id, policy_id, policy_version,
           metric_key, source, form_factor, scope, before_value, after_value, delta,
           relative_change_percent, severity)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
         ON CONFLICT (current_observation_id, previous_observation_id) DO NOTHING
         RETURNING id`,
        [current.project_id, current.monitored_url_id, current.id, before.id, storedPolicy?.id ?? null, storedPolicy?.version ?? 1,
          current.metric_key, current.source, current.form_factor, current.scope, Number(before.value), Number(current.value),
          decision.delta, decision.relativeChangePercent, decision.severity],
      );
      const eventId = event.rows[0]?.id;
      if (eventId) {
        await client.query(
          `INSERT INTO in_app_alert (organization_id, regression_event_id)
           VALUES ($1, $2) ON CONFLICT (regression_event_id) DO NOTHING`,
          [current.organization_id, eventId],
        );
        created += 1;
      }
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }
  return created;
}
