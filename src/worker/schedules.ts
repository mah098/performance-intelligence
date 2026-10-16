import { getPool } from "@/server/db";

const MAX_ACTIVE_JOBS_PER_ORGANIZATION = 20;

export async function enqueueOneDueSchedule(): Promise<boolean> {
  const client = await getPool().connect();
  try {
    await client.query("BEGIN");
    const dueResult = await client.query<{
      id: string;
      monitored_url_id: string;
      url: string;
      strategy: "mobile" | "desktop";
      frequency_hours: number;
      next_run_at: Date;
      organization_id: string;
    }>(
      `SELECT schedule.id, schedule.monitored_url_id, url.url, schedule.strategy,
              schedule.frequency_hours, schedule.next_run_at, project.organization_id
       FROM audit_schedule schedule
       JOIN monitored_url url ON url.id = schedule.monitored_url_id AND url.enabled = true
       JOIN project ON project.id = url.project_id
       WHERE schedule.enabled = true AND schedule.next_run_at <= now()
       ORDER BY schedule.next_run_at
       FOR UPDATE OF schedule SKIP LOCKED LIMIT 1`,
    );
    const due = dueResult.rows[0];
    if (!due) {
      await client.query("COMMIT");
      return false;
    }

    const activeJobs = await client.query<{ count: number }>(
      `SELECT count(*)::int AS count FROM audit_job job
       JOIN audit_run run ON run.id = job.audit_run_id
       JOIN monitored_url url ON url.id = run.monitored_url_id
       JOIN project ON project.id = url.project_id
       WHERE project.organization_id = $1 AND job.status IN ('queued', 'running')`,
      [due.organization_id],
    );
    if ((activeJobs.rows[0]?.count ?? 0) >= MAX_ACTIVE_JOBS_PER_ORGANIZATION) {
      await client.query(
        `UPDATE audit_schedule SET next_run_at = now() + interval '15 minutes', updated_at = now() WHERE id = $1`,
        [due.id],
      );
      await client.query("COMMIT");
      return true;
    }

    const dueSlot = new Date(due.next_run_at).toISOString();
    const inserted = await client.query<{ id: string }>(
      `INSERT INTO audit_run (monitored_url_id, requested_strategy, status, request_source, idempotency_key, requested_url)
       VALUES ($1, $2, 'queued', 'schedule', $3, $4)
       ON CONFLICT (monitored_url_id, idempotency_key) DO NOTHING
       RETURNING id`,
      [due.monitored_url_id, due.strategy, `schedule:${due.id}:${dueSlot}`, due.url],
    );
    if (inserted.rows[0]) {
      await client.query("INSERT INTO audit_job (audit_run_id, status) VALUES ($1, 'queued')", [inserted.rows[0].id]);
    }
    await client.query(
      `UPDATE audit_schedule SET last_enqueued_at = now(),
         next_run_at = GREATEST(next_run_at, now()) + make_interval(hours => frequency_hours), updated_at = now()
       WHERE id = $1`,
      [due.id],
    );
    await client.query("COMMIT");
    if (inserted.rows[0]) console.log(JSON.stringify({ event: "schedule.audit_enqueued", scheduleId: due.id, auditId: inserted.rows[0].id }));
    return true;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}
