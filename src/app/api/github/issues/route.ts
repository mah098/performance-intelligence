import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { getPool } from "@/server/db";
import { jsonError, unexpectedError } from "@/server/http";
import { getWorkspace } from "@/server/workspaces";
import { getGitHubAccessToken, githubJson, GitHubApiError } from "@/server/github";
import { analysisSchema } from "@/domain/ai/analysis";
import { consumeRateLimit } from "@/server/rate-limit";

export const dynamic = "force-dynamic";

const issueSchema = z.object({
  eventId: z.string().uuid(),
  recommendationIndex: z.number().int().nonnegative().max(4),
  installationId: z.number().int().positive(),
  repositoryId: z.number().int().positive(),
  owner: z.string().regex(/^[A-Za-z0-9_.-]{1,100}$/),
  repository: z.string().regex(/^[A-Za-z0-9_.-]{1,100}$/),
  title: z.string().trim().min(1).max(200),
  body: z.string().trim().min(1).max(20_000),
  idempotencyKey: z.string().uuid(),
});

export async function POST(request: Request) {
  const workspace = await getWorkspace();
  if (!workspace) return jsonError("unauthenticated", "Sign in to create a GitHub issue.", 401);
  if (!await consumeRateLimit(workspace.organizationId, "github_issue_create", 10, 3600)) return jsonError("rate_limited", "Issue creation is temporarily rate limited for this workspace.", 429);
  let json: unknown;
  try { json = await request.json(); } catch { return jsonError("invalid_json", "Provide a reviewed issue draft.", 400); }
  const parsed = issueSchema.safeParse(json);
  if (!parsed.success) return jsonError("invalid_issue", "Check the issue title, body, repository, and idempotency key.", 400);
  const input = parsed.data;
  const pool = getPool();
  const authorizedEvent = await pool.query<{ id: string; result: unknown; url: string; current_audit_id: string; previous_audit_id: string }>(
    `SELECT event.id, analysis.result, url.url, current_observation.audit_run_id AS current_audit_id,
            previous_observation.audit_run_id AS previous_audit_id
     FROM regression_event event JOIN project ON project.id = event.project_id
     JOIN regression_analysis analysis ON analysis.regression_event_id = event.id AND analysis.status = 'succeeded'
     JOIN monitored_url url ON url.id = event.monitored_url_id
     JOIN metric_observation current_observation ON current_observation.id = event.current_observation_id
     JOIN metric_observation previous_observation ON previous_observation.id = event.previous_observation_id
     WHERE event.id = $1 AND project.organization_id = $2`,
    [input.eventId, workspace.organizationId],
  );
  if (!authorizedEvent.rows[0]) return jsonError("not_found", "The regression was not found.", 404);
  const checkedAnalysis = analysisSchema.safeParse(authorizedEvent.rows[0].result);
  const recommendation = checkedAnalysis.success ? checkedAnalysis.data.recommendations[input.recommendationIndex] : null;
  if (!recommendation) return jsonError("invalid_recommendation", "Select a validated recommendation from this regression.", 422);
  const affectedUrl = new URL(authorizedEvent.rows[0].url);
  affectedUrl.search = "";
  affectedUrl.hash = "";
  const requiredEvidence = [recommendation.title, ...recommendation.evidenceIds, affectedUrl.toString(), `/audits/${authorizedEvent.rows[0].previous_audit_id}`, `/audits/${authorizedEvent.rows[0].current_audit_id}`];
  if (requiredEvidence.some((fragment) => !input.body.includes(fragment))) return jsonError("incomplete_issue_draft", "Keep the recommendation, affected page, evidence references, and audit links in the reviewed issue body.", 422);
  const bodyDigest = createHash("sha256").update(input.body).digest("hex");
  const repositoryFullName = `${input.owner}/${input.repository}`;
  const inserted = await pool.query<{ id: string }>(
    `INSERT INTO github_issue_outcome
      (organization_id, regression_event_id, recommendation_index, idempotency_key, repository_id, repository_full_name, title, body_sha256, status, created_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'pending', $9)
     ON CONFLICT DO NOTHING RETURNING id`,
    [workspace.organizationId, input.eventId, input.recommendationIndex, input.idempotencyKey, input.repositoryId, repositoryFullName, input.title, bodyDigest, workspace.userId],
  );
  if (!inserted.rows[0]) {
    const prior = await pool.query<{ id: string; status: string; issue_url: string | null; issue_number: number | null; title: string; body_sha256: string; repository_id: string; regression_event_id: string }>(
      `SELECT id, status, issue_url, issue_number, title, body_sha256, repository_id::text, regression_event_id::text FROM github_issue_outcome
       WHERE organization_id = $1 AND (idempotency_key = $2 OR
         (regression_event_id = $3 AND repository_id = $4 AND title = $5 AND body_sha256 = $6))
       ORDER BY created_at LIMIT 1`,
      [workspace.organizationId, input.idempotencyKey, input.eventId, input.repositoryId, input.title, bodyDigest],
    );
    const row = prior.rows[0];
    if (!row || row.title !== input.title || row.body_sha256 !== bodyDigest || Number(row.repository_id) !== input.repositoryId || row.regression_event_id !== input.eventId) return jsonError("idempotency_conflict", "This confirmation key belongs to a different draft.", 409);
    if (row.status === "succeeded") return NextResponse.json({ status: row.status, issueUrl: row.issue_url, issueNumber: row.issue_number, idempotent: true });
    return jsonError("submission_already_recorded", "This submission is already recorded. Check its status in the GitHub issue history before retrying.", 409);
  }

  let issuePostStarted = false;
  try {
    const token = await getGitHubAccessToken(workspace);
    const installationList = await githubJson<{ installations?: { id: number; permissions?: { issues?: string } }[] }>("/user/installations?per_page=100", token);
    const installation = (installationList.data.installations ?? []).find((item) => item.id === input.installationId);
    if (installation?.permissions?.issues !== "write") throw new GitHubApiError("The selected GitHub App installation no longer has Issues write permission.", 403, "github_issue_permission_missing");
    let authorizedRepository: { id: number } | undefined;
    for (let page = 1; page <= 5 && !authorizedRepository; page += 1) {
      const pageResult = await githubJson<{ repositories?: { id: number }[] }>(`/user/installations/${input.installationId}/repositories?per_page=100&page=${page}`, token);
      authorizedRepository = pageResult.data.repositories?.find((repository) => repository.id === input.repositoryId);
      if ((pageResult.data.repositories?.length ?? 0) < 100) break;
    }
    if (!authorizedRepository) throw new GitHubApiError("The selected repository is no longer available to this GitHub account.", 404, "github_repository_access_revoked");
    const repositoryCheck = await githubJson<{ id: number }>(`/repos/${encodeURIComponent(input.owner)}/${encodeURIComponent(input.repository)}`, token);
    if (repositoryCheck.data.id !== input.repositoryId) throw new GitHubApiError("The repository identity changed. Refresh the repository list and review the draft again.", 409, "github_repository_mismatch");
    issuePostStarted = true;
    const created = await githubJson<{ number: number; html_url: string }>(`/repos/${encodeURIComponent(input.owner)}/${encodeURIComponent(input.repository)}/issues`, token, {
      method: "POST",
      body: JSON.stringify({ title: input.title, body: input.body }),
    });
    await pool.query(
      `UPDATE github_issue_outcome SET status = 'succeeded', issue_number = $2, issue_url = $3, updated_at = now() WHERE id = $1`,
      [inserted.rows[0].id, created.data.number, created.data.html_url],
    );
    return NextResponse.json({ status: "succeeded", issueUrl: created.data.html_url, issueNumber: created.data.number }, { status: 201 });
  } catch (error) {
    const unknown = issuePostStarted && (!(error instanceof GitHubApiError) || error.status === null || error.status >= 500);
    const code = error instanceof GitHubApiError ? error.code : "github_submission_unknown";
    await pool.query(`UPDATE github_issue_outcome SET status = $2, error_code = $3, updated_at = now() WHERE id = $1`, [inserted.rows[0].id, unknown ? "unknown" : "failed", code]);
    if (error instanceof GitHubApiError) return jsonError(unknown ? "github_submission_unknown" : code, unknown ? "GitHub’s response was ambiguous. Check the repository before submitting another issue." : error.message, unknown ? 502 : error.status === 401 ? 401 : 422);
    if (unknown) return jsonError("github_submission_unknown", "GitHub’s response was ambiguous. Check the repository before submitting another issue.", 502);
    return unexpectedError();
  }
}
