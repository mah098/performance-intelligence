import { getPool } from "@/server/db";
import { analyzePerformance, getAnalysisModel, type AnalysisInput } from "@/providers/openai/client";

type AnalysisJob = { id: string; regression_event_id: string; request_input: AnalysisInput };

async function claimOne(): Promise<AnalysisJob | null> {
  const client = await getPool().connect();
  try {
    await client.query("BEGIN");
    const result = await client.query<AnalysisJob>(
      `SELECT id, regression_event_id, request_input FROM regression_analysis
       WHERE status = 'queued' OR (status = 'running' AND updated_at < now() - interval '10 minutes')
       ORDER BY created_at FOR UPDATE SKIP LOCKED LIMIT 1`,
    );
    const job = result.rows[0];
    if (!job) {
      await client.query("COMMIT");
      return null;
    }
    await client.query("UPDATE regression_analysis SET status = 'running', model = $2, updated_at = now() WHERE id = $1", [job.id, getAnalysisModel()]);
    await client.query("COMMIT");
    return job;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function runOneAnalysis(): Promise<boolean> {
  const job = await claimOne();
  if (!job) return false;
  try {
    const result = await analyzePerformance(job.request_input);
    await getPool().query(
      `UPDATE regression_analysis SET status = 'succeeded', result = $2, error_code = NULL,
       completed_at = now(), updated_at = now() WHERE id = $1`,
      [job.id, JSON.stringify(result)],
    );
    console.log(JSON.stringify({ event: "analysis.completed", analysisId: job.id }));
  } catch (error) {
    const code = error instanceof Error && /^analysis_[a-z0-9_]+$/.test(error.message) ? error.message : "analysis_failed";
    await getPool().query(
      `UPDATE regression_analysis SET status = 'failed', error_code = $2,
       completed_at = now(), updated_at = now() WHERE id = $1`,
      [job.id, code],
    );
    console.error(JSON.stringify({ event: "analysis.failed", analysisId: job.id, code }));
  }
  return true;
}
