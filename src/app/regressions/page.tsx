import Link from "next/link";
import { redirect } from "next/navigation";
import { getPool } from "@/server/db";
import { getWorkspace } from "@/server/workspaces";
import { signOutAction } from "@/app/logout/actions";
import { AcknowledgeRegression, RegressionControls } from "@/app/ui/regression-controls";
import { RegressionAnalysis } from "@/app/ui/regression-analysis";

export const dynamic = "force-dynamic";

export default async function RegressionsPage() {
  const workspace = await getWorkspace();
  if (!workspace) redirect("/login");
  const pool = getPool();
  const result = await pool.query(
    `SELECT event.id, event.monitored_url_id, event.metric_key, event.source, event.form_factor, event.scope, event.policy_version,
            event.before_value::text, event.after_value::text, event.delta::text,
            event.relative_change_percent::text, event.severity, event.status, event.detected_at,
            url.url, url.label, alert.id AS alert_id, alert.read_at,
            previous.audit_run_id AS previous_audit_id, current.audit_run_id AS current_audit_id
     FROM regression_event event
     JOIN monitored_url url ON url.id = event.monitored_url_id
     JOIN project ON project.id = event.project_id AND project.organization_id = $1
     JOIN metric_observation previous ON previous.id = event.previous_observation_id
     JOIN metric_observation current ON current.id = event.current_observation_id
     LEFT JOIN in_app_alert alert ON alert.regression_event_id = event.id
     ORDER BY event.detected_at DESC LIMIT 100`,
    [workspace.organizationId],
  );
  const policies = await pool.query(
    `SELECT id, metric_key, source, form_factor, scope, absolute_threshold::text,
            relative_threshold_percent::text, enabled, version
     FROM regression_policy WHERE project_id = $1 ORDER BY updated_at DESC`,
    [workspace.projectId],
  );
  const openCount = result.rows.filter((row) => row.status === "open").length;

  return (
    <main className="audit-shell">
      <header className="audit-topbar"><Link className="brand-mark" href="/"><span className="brand-symbol">p</span><span>pulseboard<span className="brand-dot">.</span></span></Link><div className="audit-top-right"><span className="user-chip"><span className="user-chip-dot">{workspace.userName.slice(0, 1).toUpperCase()}</span>{workspace.userName}</span><form action={signOutAction}><button className="text-button" type="submit">Sign out</button></form></div></header>
      <div className="audit-content">
        <Link className="back-link" href="/">← <span>Back to overview</span></Link>
        <section className="audit-page-heading"><div><div className="eyebrow"><span className="eyebrow-line" /> MEASURED CHANGES</div><h1>Regression inbox<span className="heading-period">.</span></h1><p className="regression-intro">Rule-based changes across compatible successful runs. Every alert carries its measured before and after values.</p></div><span className="open-count-chip">{openCount} OPEN</span></section>

        <section className="result-section regression-policy-section"><div className="result-section-title"><div><div className="eyebrow"><span className="eyebrow-line" /> DETECTION RULES</div><h3>Threshold policies</h3></div><span className="provenance-note">Defaults suppress small movements</span></div>
          <div className="default-threshold-note">Default rules require a meaningful absolute change and, where applicable, a relative change. CLS uses an absolute threshold because percentages near zero are misleading.</div>
          <RegressionControls policies={policies.rows} />
        </section>

        <section className="result-section"><div className="result-section-title"><div><div className="eyebrow"><span className="eyebrow-line" /> IN-APP ALERTS</div><h3>Recent regressions <span className="section-count">{result.rows.length}</span></h3></div><span className="provenance-note">Up to 100 events · newest first</span></div>
          {result.rows.length ? <div className="regression-list">{result.rows.map((event) => <article className={`regression-card ${event.severity}`} key={event.id}>
            <div className="regression-card-top"><div className="regression-title-row"><span className={`severity-tag ${event.severity}`}>{event.severity}</span><h4>{metricLabel(event.metric_key)} worsened</h4></div><span className="regression-state">{event.status === "acknowledged" ? "Acknowledged" : event.status}</span></div>
            <div className="regression-context"><Link href={`/pages/${event.monitored_url_id}`}>{event.label || new URL(event.url).hostname}</Link><span>·</span><span>{event.source === "lighthouse_lab" ? "Lighthouse lab" : "CrUX field"}</span><span>·</span><span>{event.form_factor}</span><span>·</span><span>{event.scope} data</span></div>
            <div className="regression-values"><div><small>BEFORE</small><strong>{formatValue(Number(event.before_value), event.metric_key)}</strong><a href={`/audits/${event.previous_audit_id}`}>Previous run ↗</a></div><span className="delta-arrow">→</span><div><small>AFTER</small><strong className="score-low">{formatValue(Number(event.after_value), event.metric_key)}</strong><a href={`/audits/${event.current_audit_id}`}>Current run ↗</a></div><div className="delta-summary"><small>CHANGE</small><strong>{formatDelta(Number(event.delta), event.metric_key)}</strong>{event.relative_change_percent !== null ? <span>{Number(event.relative_change_percent).toFixed(1)}%</span> : null}</div></div>
            <RegressionAnalysis eventId={event.id} />
            <div className="regression-card-foot"><span>Detected {formatDate(event.detected_at)} · rule v{event.policy_version}</span><span className="regression-causality">Run-to-run change · not proof of deployment causation</span><AcknowledgeRegression eventId={event.id} status={event.status} /></div>
          </article>)}</div> : <div className="history-empty regression-empty"><span className="empty-regression-icon">✓</span><strong>No regression events yet.</strong><p>After another compatible successful audit, Pulseboard will compare stored measurements against the prior run using these rules.</p></div>}
        </section>
        <footer className="audit-page-footer"><span>Regressions are calculated from measured observations. AI does not determine alert status.</span><Link href="/">Return to overview →</Link></footer>
      </div>
    </main>
  );
}

function metricLabel(key: string) {
  const labels: Record<string, string> = {
    lighthouse_performance_score: "Lighthouse performance score",
    lighthouse_accessibility_score: "Lighthouse accessibility score",
    lighthouse_best_practices_score: "Lighthouse best-practices score",
    lighthouse_seo_score: "Lighthouse SEO score",
    largest_contentful_paint: "Largest Contentful Paint",
    interaction_to_next_paint: "Interaction to Next Paint",
    cumulative_layout_shift: "Cumulative Layout Shift",
    first_contentful_paint: "First Contentful Paint",
    time_to_first_byte: "Time to First Byte",
  };
  return labels[key] ?? key;
}

function formatValue(value: number, key: string) {
  if (key.includes("_score")) return `${Math.round(value)} / 100`;
  if (key === "cumulative_layout_shift") return value.toFixed(3);
  return value >= 1000 ? `${(value / 1000).toFixed(2)} s` : `${Math.round(value)} ms`;
}

function formatDelta(value: number, key: string) {
  if (key.includes("_score")) return `${value > 0 ? "+" : ""}${value.toFixed(0)} points`;
  if (key === "cumulative_layout_shift") return `${value > 0 ? "+" : ""}${value.toFixed(3)}`;
  return `${value > 0 ? "+" : ""}${value >= 1000 ? `${(value / 1000).toFixed(2)} s` : `${Math.round(value)} ms`}`;
}

function formatDate(value: Date) {
  return new Intl.DateTimeFormat("en", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}
