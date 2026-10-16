import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { z } from "zod";
import { getPool } from "@/server/db";
import { getWorkspace } from "@/server/workspaces";
import { signOutAction } from "@/app/logout/actions";
import { ScheduleControls } from "@/app/ui/schedule-controls";

export const dynamic = "force-dynamic";

type Snapshot = {
  id: string;
  status: string;
  requested_strategy: "mobile" | "desktop";
  requested_url: string;
  queued_at: Date;
  completed_at: Date | null;
  lighthouse_version: string | null;
  lab_categories: Record<string, number | null>;
  lab_metrics: Record<string, { value: number; unit: string }>;
  field_data_status: string;
  field_data: {
    formFactor?: "PHONE" | "DESKTOP";
    page?: { collectionPeriod?: { firstDate: string; lastDate: string } | null; metrics?: Record<string, { p75: number; unit: string }> } | null;
    originFallback?: { collectionPeriod?: { firstDate: string; lastDate: string } | null; metrics?: Record<string, { p75: number; unit: string }> } | null;
  };
};

export default async function UrlHistoryPage({ params }: { params: Promise<{ urlId: string }> }) {
  const workspace = await getWorkspace();
  if (!workspace) redirect("/login");
  const parsed = z.object({ urlId: z.string().uuid() }).safeParse(await params);
  if (!parsed.success) notFound();
  const pool = getPool();
  const urlResult = await pool.query<{ id: string; url: string; label: string | null; created_at: Date; schedule_enabled: boolean | null; schedule_frequency_hours: number | null; schedule_strategy: "mobile" | "desktop" | null }>(
    `SELECT u.id, u.url, u.label, u.created_at, schedule.enabled AS schedule_enabled,
            schedule.frequency_hours AS schedule_frequency_hours, schedule.strategy AS schedule_strategy
     FROM monitored_url u JOIN project p ON p.id = u.project_id
     LEFT JOIN audit_schedule schedule ON schedule.monitored_url_id = u.id
     WHERE u.id = $1 AND p.organization_id = $2`,
    [parsed.data.urlId, workspace.organizationId],
  );
  const url = urlResult.rows[0];
  if (!url) notFound();
  const historyResult = await pool.query<Snapshot>(
    `SELECT a.id, a.status, a.requested_strategy, a.requested_url, a.queued_at, a.completed_at,
            a.lighthouse_version, a.lab_categories, a.lab_metrics, a.field_data_status, a.field_data
     FROM audit_run a WHERE a.monitored_url_id = $1
     ORDER BY a.queued_at DESC LIMIT 25`,
    [url.id],
  );
  const history = historyResult.rows;
  const chronological = [...history].reverse();
  const labPoints = chronological.flatMap((run) => {
    const value = run.lab_categories?.performance;
    return run.status === "succeeded" && typeof value === "number" ? [{ date: run.completed_at ?? run.queued_at, value, href: `/audits/${run.id}` }] : [];
  });
  const cruxPoints = chronological.flatMap((run) => {
    const fieldData = run.field_data;
    const record = fieldData?.page?.metrics?.largest_contentful_paint
      ? fieldData.page
      : fieldData?.originFallback;
    const value = record?.metrics?.largest_contentful_paint?.p75;
    return run.field_data_status === "available" && typeof value === "number"
      ? [{ date: run.completed_at ?? run.queued_at, value, href: `/audits/${run.id}` }]
      : [];
  });
  const latest = history[0];
  const schedule = url.schedule_enabled === null ? null : { enabled: url.schedule_enabled, frequency_hours: url.schedule_frequency_hours ?? 168, strategy: url.schedule_strategy ?? "mobile" };

  return (
    <main className="audit-shell">
      <header className="audit-topbar"><Link className="brand-mark" href="/"><span className="brand-symbol">p</span><span>pulseboard<span className="brand-dot">.</span></span></Link><div className="audit-top-right"><span className="user-chip"><span className="user-chip-dot">{workspace.userName.slice(0, 1).toUpperCase()}</span>{workspace.userName}</span><form action={signOutAction}><button className="text-button" type="submit">Sign out</button></form></div></header>
      <div className="audit-content">
        <Link className="back-link" href="/">← <span>Back to monitored pages</span></Link>
        <section className="audit-page-heading"><div><div className="eyebrow"><span className="eyebrow-line" /> URL PERFORMANCE HISTORY</div><h1>{url.label || new URL(url.url).hostname}<span className="heading-period">.</span></h1><a className="audit-target-link" href={url.url} target="_blank" rel="noreferrer">{url.url}<span>↗</span></a></div>{latest ? <Link className="new-audit-link" href={`/audits/${latest.id}`}>Latest audit →</Link> : null}</section>
        <section className="trend-grid">
          <TrendCard title="Lighthouse performance" subtitle="Synthetic lab score · /100" unit="score" points={labPoints} color="#66a980" />
          <TrendCard title="Largest Contentful Paint" subtitle="CrUX real-user p75 · 28-day window" unit="ms" points={cruxPoints} color="#8d83bf" />
        </section>
        <section className="result-section schedule-section"><div className="result-section-title"><div><div className="eyebrow"><span className="eyebrow-line" /> RECURRING CHECKS</div><h3>Audit schedule</h3></div><span className="provenance-note">One device per scheduled run</span></div><ScheduleControls urlId={url.id} schedule={schedule} /></section>
        <div className="history-disclaimer">Trends use the latest {history.length} runs. Lighthouse lab and CrUX field data are separate. CrUX values are rolling 28-day aggregates and may overlap between snapshots.</div>
        <section className="result-section history-section"><div className="result-section-title"><div><div className="eyebrow"><span className="eyebrow-line" /> RECENT RUNS</div><h3>Audit history <span className="section-count">{history.length}</span></h3></div><span className="provenance-note">Newest first · up to 25 results</span></div>
          {history.length ? <div className="history-list">{history.map((run) => <Link className="history-row" href={`/audits/${run.id}`} key={run.id}><span className={`run-status ${run.status}`}><i />{run.status}</span><span className="history-strategy">{run.requested_strategy}</span><span className="history-score">{typeof run.lab_categories?.performance === "number" ? <><b>{run.lab_categories.performance}</b><small>/100</small></> : <small>No score</small>}</span><span className="history-field">{run.field_data_status === "available" ? <><i /> CrUX available</> : run.field_data_status === "no_data" ? "No field data" : run.field_data_status === "not_configured" ? "CrUX not configured" : "CrUX unavailable"}</span><time>{formatDate(run.completed_at ?? run.queued_at)}</time><span className="history-arrow">↗</span></Link>)}</div> : <div className="history-empty">No audit runs yet. Return to the overview and run your first mobile or desktop audit.</div>}
        </section>
        <footer className="audit-page-footer"><span>Showing a bounded history for this monitored URL.</span><Link href="/">Return to overview →</Link></footer>
      </div>
    </main>
  );
}

function TrendCard({ title, subtitle, unit, points, color }: { title: string; subtitle: string; unit: "score" | "ms"; points: { date: Date; value: number; href: string }[]; color: string }) {
  const width = 520;
  const height = 150;
  const padding = { top: 15, right: 14, bottom: 24, left: 14 };
  const values = points.map((point) => point.value);
  const min = values.length ? Math.min(...values) : 0;
  const max = values.length ? Math.max(...values) : 1;
  const spread = max - min || Math.max(1, max * 0.08);
  const coordinates = points.map((point, index) => ({
    ...point,
    x: points.length === 1 ? width / 2 : padding.left + (index / (points.length - 1)) * (width - padding.left - padding.right),
    y: height - padding.bottom - ((point.value - min + spread * 0.08) / (spread * 1.16)) * (height - padding.top - padding.bottom),
  }));
  const path = coordinates.map((point, index) => `${index ? "L" : "M"}${point.x.toFixed(1)},${point.y.toFixed(1)}`).join(" ");
  const latest = points.at(-1);
  return (
    <article className="trend-card"><div className="trend-card-head"><div><span className="trend-kicker">{unit === "score" ? "LAB SERIES" : "FIELD SERIES"}</span><h2>{title}</h2><p>{subtitle}</p></div><div className="trend-latest">{latest ? <><strong style={{ color }}>{unit === "score" ? Math.round(latest.value) : latest.value >= 1000 ? `${(latest.value / 1000).toFixed(2)}s` : `${Math.round(latest.value)}ms`}</strong><small>LATEST</small></> : <><strong className="trend-no-data">—</strong><small>NO DATA</small></>}</div></div>
      <div className="trend-chart">{points.length > 0 ? <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label={`${title} trend from ${points.length} audit snapshots`}><line x1={padding.left} x2={width - padding.right} y1={height - padding.bottom} y2={height - padding.bottom} className="chart-axis" /><line x1={padding.left} x2={width - padding.right} y1={height / 2} y2={height / 2} className="chart-gridline" /><path d={path} fill="none" stroke={color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />{coordinates.map((point) => <a href={point.href} key={`${point.href}-${point.x}`}><circle cx={point.x} cy={point.y} r="4" fill="#fff" stroke={color} strokeWidth="2"/><title>{formatDate(point.date)}: {unit === "score" ? Math.round(point.value) : `${Math.round(point.value)}ms`}</title></a>)}<text x={padding.left} y={height - 5} className="chart-label">{formatShortDate(points[0]?.date)}</text><text x={width - padding.right} y={height - 5} textAnchor="end" className="chart-label">{formatShortDate(points.at(-1)?.date)}</text></svg> : <div className="chart-empty">{unit === "ms" ? "CrUX snapshots will appear when field data is configured and available." : "Run an audit to start this trend."}</div>}</div><div className="trend-foot"><span><i style={{ background: color }} />{unit === "score" ? "Performance score" : "p75 field metric"}</span><span>{points.length} data {points.length === 1 ? "point" : "points"}</span></div>
    </article>
  );
}

function formatDate(value: Date) {
  return new Intl.DateTimeFormat("en", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

function formatShortDate(value: Date | undefined) {
  return value ? new Intl.DateTimeFormat("en", { month: "short", day: "numeric" }).format(new Date(value)) : "";
}
