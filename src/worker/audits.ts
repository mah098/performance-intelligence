import { getPool } from "@/server/db";
import { PageSpeedError, runPageSpeed } from "@/providers/pagespeed/client";
import { getCruxFieldData } from "@/providers/crux/client";
import { detectAndPersistRegressions } from "@/domain/regressions/service";

type ClaimedJob = { job_id: string; audit_id: string; url: string; strategy: "mobile" | "desktop"; attempts: number; max_attempts: number };

async function claimOne(): Promise<ClaimedJob | null> {
  const pool = getPool();
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const found = await client.query<ClaimedJob>(
      `SELECT j.id AS job_id, a.id AS audit_id, a.requested_url AS url,
              a.requested_strategy AS strategy, j.attempts, j.max_attempts
       FROM audit_job j JOIN audit_run a ON a.id = j.audit_run_id
       WHERE ((j.status = 'queued' AND j.available_at <= now())
          OR (j.status = 'running' AND j.lease_until < now()))
         AND j.attempts < j.max_attempts
       ORDER BY j.available_at, j.created_at
       FOR UPDATE OF j SKIP LOCKED LIMIT 1`,
    );
    const job = found.rows[0];
    if (!job) {
      await client.query("COMMIT");
      return null;
    }
    const updated = await client.query<{ attempts: number }>(
      `UPDATE audit_job SET status = 'running', attempts = attempts + 1,
       lease_until = now() + interval '5 minutes', updated_at = now()
       WHERE id = $1 RETURNING attempts`,
      [job.job_id],
    );
    await client.query(
      `UPDATE audit_run SET status = 'running', started_at = COALESCE(started_at, now()),
         error_code = NULL, error_message = NULL WHERE id = $1`,
      [job.audit_id],
    );
    await client.query("COMMIT");
    return { ...job, attempts: updated.rows[0]?.attempts ?? job.attempts + 1 };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

async function finishSuccess(
  job: ClaimedJob,
  result: Awaited<ReturnType<typeof runPageSpeed>>,
  fieldData: Awaited<ReturnType<typeof getCruxFieldData>>,
) {
  const missingCategories = Object.values(result.categories).filter((score) => score === null).length;
  const status = missingCategories > 0 ? "partial" : "succeeded";
  const metricNames: Record<string, string> = {
    "largest-contentful-paint": "largest_contentful_paint",
    "first-contentful-paint": "first_contentful_paint",
    "cumulative-layout-shift": "cumulative_layout_shift",
    "server-response-time": "time_to_first_byte",
  };
  const observations: {
    metricKey: string; value: number; unit: string; source: "lighthouse_lab" | "crux_field";
    formFactor: string; scope: "page" | "origin"; aggregation: "single_run" | "p75";
    collectionStart: string | null; collectionEnd: string | null; histogram: unknown; providerName: string; observedAt: string;
  }[] = Object.entries(result.metrics).map(([, metric]) => ({
    metricKey: metricNames[metric.auditId] ?? metric.auditId.replaceAll("-", "_"),
    value: metric.value,
    unit: metric.unit,
    source: "lighthouse_lab",
    formFactor: job.strategy,
    scope: "page",
    aggregation: "single_run",
    collectionStart: null,
    collectionEnd: null,
    histogram: [],
    providerName: metric.auditId,
    observedAt: result.fetchTime,
  }));

  for (const [category, score] of Object.entries(result.categories)) {
    if (score === null) continue;
    observations.push({
      metricKey: `lighthouse_${category.replaceAll("-", "_")}_score`,
      value: score,
      unit: "score",
      source: "lighthouse_lab",
      formFactor: job.strategy,
      scope: "page",
      aggregation: "single_run",
      collectionStart: null,
      collectionEnd: null,
      histogram: [],
      providerName: `${category}-category-score`,
      observedAt: result.fetchTime,
    });
  }

  for (const record of [fieldData.page, fieldData.originFallback]) {
    if (!record) continue;
    for (const [metricKey, metric] of Object.entries(record.metrics)) {
      observations.push({
        metricKey,
        value: metric.p75,
        unit: metric.unit,
        source: "crux_field",
        formFactor: record.formFactor,
        scope: record.scope,
        aggregation: "p75",
        collectionStart: record.collectionPeriod?.firstDate ?? null,
        collectionEnd: record.collectionPeriod?.lastDate ?? null,
        histogram: metric.histogram,
        providerName: metricKey,
        observedAt: new Date().toISOString(),
      });
    }
  }

  const pool = getPool();
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(
      `UPDATE audit_run SET status = $2, final_url = $3, completed_at = now(),
       lighthouse_version = $4, psi_version = $5, lab_categories = $6, lab_metrics = $7,
       evidence = $8, warnings = $9, field_data_status = $10, field_data = $11,
       error_code = NULL, error_message = NULL
     WHERE id = $1`,
      [job.audit_id, status, result.finalUrl, result.lighthouseVersion, result.psiVersion, JSON.stringify(result.categories), JSON.stringify(result.metrics), JSON.stringify(result.evidence), JSON.stringify(result.warnings), fieldData.status, JSON.stringify(fieldData)],
    );
    await client.query("DELETE FROM metric_observation WHERE audit_run_id = $1", [job.audit_id]);
    for (const observation of observations) {
      await client.query(
        `INSERT INTO metric_observation
          (audit_run_id, metric_key, value, unit, source, form_factor, scope, aggregation,
           collection_start, collection_end, histogram, provider_metric_name, observed_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)`,
        [job.audit_id, observation.metricKey, observation.value, observation.unit, observation.source, observation.formFactor,
          observation.scope, observation.aggregation, observation.collectionStart, observation.collectionEnd,
          JSON.stringify(observation.histogram), observation.providerName, observation.observedAt],
      );
    }
    await client.query(`UPDATE audit_job SET status = 'succeeded', lease_until = NULL, updated_at = now() WHERE id = $1`, [job.job_id]);
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
  console.log(JSON.stringify({ event: "audit.completed", auditId: job.audit_id, status, strategy: job.strategy }));
}

async function finishFailure(job: ClaimedJob, error: unknown) {
  const providerError = error instanceof PageSpeedError ? error : new PageSpeedError("The audit worker encountered an unexpected error.", "worker_error", true);
  const retry = providerError.retryable && job.attempts < job.max_attempts;
  const backoffSeconds = Math.min(300, 15 * 2 ** Math.max(0, job.attempts - 1));
  const delaySeconds = Math.max(backoffSeconds, Math.ceil((providerError.retryAfterMs ?? 0) / 1000));
  const auditStatus = retry ? "queued" : "failed";
  const jobStatus = retry ? "queued" : "failed";
  await getPool().query(
    `UPDATE audit_job SET status = $2, lease_until = NULL, available_at = CASE WHEN $2 = 'queued' THEN now() + ($3 * interval '1 second') ELSE available_at END,
       last_error_code = $4, updated_at = now() WHERE id = $1`,
    [job.job_id, jobStatus, delaySeconds, providerError.code],
  );
  await getPool().query(
    `UPDATE audit_run SET status = $2, completed_at = CASE WHEN $2 = 'failed' THEN now() ELSE NULL END,
       error_code = $3, error_message = $4 WHERE id = $1`,
    [job.audit_id, auditStatus, providerError.code, providerError.message.slice(0, 500)],
  );
  console.error(JSON.stringify({ event: "audit.failed", auditId: job.audit_id, code: providerError.code, retry, attempts: job.attempts }));
}

export async function runOneAudit(): Promise<boolean> {
  const job = await claimOne();
  if (!job) return false;
  try {
    const result = await runPageSpeed(job.url, job.strategy);
    const fieldData = await getCruxFieldData(job.url, job.strategy === "mobile" ? "PHONE" : "DESKTOP");
    await finishSuccess(job, result, fieldData);
    try {
      const count = await detectAndPersistRegressions(job.audit_id);
      if (count > 0) console.log(JSON.stringify({ event: "regression.detected", auditId: job.audit_id, count }));
    } catch (error) {
      console.error(JSON.stringify({ event: "regression.detection_failed", auditId: job.audit_id, message: error instanceof Error ? error.message : "unknown" }));
    }
  } catch (error) {
    await finishFailure(job, error);
  }
  return true;
}
