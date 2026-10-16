import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { z } from "zod";
import { analysisSchema } from "@/domain/ai/analysis";
import { getPool } from "@/server/db";
import { getServerEnv } from "@/server/env";
import { getWorkspace } from "@/server/workspaces";
import { signOutAction } from "@/app/logout/actions";
import { GitHubIssueComposer } from "@/app/ui/github-issue-composer";

export const dynamic = "force-dynamic";

export default async function NewGitHubIssuePage({ searchParams }: { searchParams: Promise<{ eventId?: string; recommendation?: string }> }) {
  const workspace = await getWorkspace();
  if (!workspace) redirect("/login");
  const params = z.object({ eventId: z.string().uuid(), recommendation: z.coerce.number().int().nonnegative().max(4) }).safeParse(await searchParams);
  if (!params.success) notFound();
  const result = await getPool().query<{
    result: unknown; metric_key: string; before_value: string; after_value: string; delta: string; source: string; form_factor: string; scope: string;
    url: string; current_audit_id: string; previous_audit_id: string;
  }>(
    `SELECT analysis.result, event.metric_key, event.before_value::text, event.after_value::text, event.delta::text,
            event.source, event.form_factor, event.scope, url.url, current_observation.audit_run_id AS current_audit_id,
            previous_observation.audit_run_id AS previous_audit_id
     FROM regression_event event JOIN project ON project.id = event.project_id AND project.organization_id = $2
     JOIN regression_analysis analysis ON analysis.regression_event_id = event.id AND analysis.status = 'succeeded'
     JOIN monitored_url url ON url.id = event.monitored_url_id
     JOIN metric_observation current_observation ON current_observation.id = event.current_observation_id
     JOIN metric_observation previous_observation ON previous_observation.id = event.previous_observation_id
     WHERE event.id = $1`,
    [params.data.eventId, workspace.organizationId],
  );
  const row = result.rows[0];
  if (!row) notFound();
  const parsedAnalysis = analysisSchema.safeParse(row.result);
  if (!parsedAnalysis.success) notFound();
  const analysis = parsedAnalysis.data;
  const recommendation = analysis.recommendations[params.data.recommendation];
  if (!recommendation) notFound();
  const affectedUrl = new URL(row.url);
  affectedUrl.search = "";
  affectedUrl.hash = "";
  const baseUrl = getServerEnv().APP_BASE_URL ?? "http://localhost:3000";
  const title = `[Performance] ${recommendation.title}`.slice(0, 200);
  const body = [
    `## Recommendation\n${recommendation.title}\n\n${recommendation.rationale}`,
    `## Expected impact\n${recommendation.expectedImpact}`,
    `## Supporting evidence\n${recommendation.evidenceIds.map((id) => `- \`${id}\``).join("\n")}`,
    `## Uncertainty\n${recommendation.uncertainty}\n\n${analysis.overallUncertainty}`,
    `## Measured change\n- Metric: ${row.metric_key}\n- Before: ${row.before_value}\n- After: ${row.after_value}\n- Delta: ${row.delta}\n- Source/device/scope: ${row.source} / ${row.form_factor} / ${row.scope}`,
    `## Affected page\n${affectedUrl.toString()}`,
    `## Pulseboard evidence\n- [Previous audit](${new URL(`/audits/${row.previous_audit_id}`, baseUrl).toString()})\n- [Current audit](${new URL(`/audits/${row.current_audit_id}`, baseUrl).toString()})`,
  ].join("\n\n");
  return <main className="audit-shell">
    <header className="audit-topbar"><Link className="brand-mark" href="/"><span className="brand-symbol">p</span><span>pulseboard<span className="brand-dot">.</span></span></Link><div className="audit-top-right"><span className="user-chip"><span className="user-chip-dot">{workspace.userName.slice(0, 1).toUpperCase()}</span>{workspace.userName}</span><form action={signOutAction}><button className="text-button" type="submit">Sign out</button></form></div></header>
    <div className="audit-content"><Link className="back-link" href="/regressions">← <span>Back to regression inbox</span></Link>
      <section className="audit-page-heading"><div><div className="eyebrow"><span className="eyebrow-line" /> REVIEW BEFORE SUBMIT</div><h1>GitHub issue draft<span className="heading-period">.</span></h1><p className="regression-intro">This draft is based on a validated analysis recommendation. Edit it freely, then confirm to create the issue.</p></div></section>
      <section className="result-section"><div className="result-section-title"><div><div className="eyebrow"><span className="eyebrow-line" /> RECOMMENDATION</div><h3>{recommendation.title}</h3></div><span className="provenance-note">Evidence IDs: {recommendation.evidenceIds.join(", ")}</span></div><GitHubIssueComposer eventId={params.data.eventId} recommendationIndex={params.data.recommendation} initialTitle={title} initialBody={body} /></section>
      <footer className="audit-page-footer"><span>Submitting uses your GitHub App user access and rechecks repository access.</span><Link href="/github">GitHub settings →</Link></footer>
    </div>
  </main>;
}
