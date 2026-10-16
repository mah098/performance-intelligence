import Image from "next/image";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getWorkspace } from "@/server/workspaces";
import { getPool } from "@/server/db";
import { AddUrlForm } from "@/app/ui/add-url-form";
import { AuditActions } from "@/app/ui/audit-actions";
import { signOutAction } from "@/app/logout/actions";

export const dynamic = "force-dynamic";

type UrlRow = {
  id: string;
  url: string;
  label: string | null;
  created_at: Date;
  latest_audit_id: string | null;
  latest_status: string | null;
  latest_strategy: string | null;
  latest_completed_at: Date | null;
  latest_categories: Record<string, number | null> | null;
  latest_field_data_status: string | null;
  run_count: number;
};

export default async function HomePage() {
  const workspace = await getWorkspace();
  if (!workspace) redirect("/login");
  const result = await getPool().query<UrlRow>(
    `SELECT u.id, u.url, u.label, u.created_at,
            a.id AS latest_audit_id, a.status AS latest_status, a.requested_strategy AS latest_strategy,
            a.completed_at AS latest_completed_at, a.lab_categories AS latest_categories,
            a.field_data_status AS latest_field_data_status,
            (SELECT count(*)::int FROM audit_run history WHERE history.monitored_url_id = u.id) AS run_count
     FROM monitored_url u JOIN project p ON p.id = u.project_id AND p.organization_id = $1
     LEFT JOIN LATERAL (
       SELECT id, status, requested_strategy, completed_at, lab_categories, field_data_status FROM audit_run
       WHERE monitored_url_id = u.id ORDER BY queued_at DESC LIMIT 1
     ) a ON true
     WHERE u.enabled = true ORDER BY u.created_at DESC LIMIT 100`,
    [workspace.organizationId],
  );
  const urls = result.rows;
  const successfulRuns = urls.filter((url) => url.latest_status === "succeeded" || url.latest_status === "partial").length;
  const inFlightRuns = urls.filter((url) => url.latest_status === "queued" || url.latest_status === "running").length;
  const fieldDataPages = urls.filter((url) => url.latest_field_data_status === "available").length;

  return (
    <main className="app-shell">
      <aside className="sidebar">
        <Link className="brand-mark sidebar-brand" href="/"><span className="brand-symbol">p</span><span>pulseboard<span className="brand-dot">.</span></span></Link>
        <div className="workspace-label">WORKSPACE</div>
        <button className="workspace-switcher" type="button"><span className="workspace-avatar">{workspace.userName.slice(0, 1).toUpperCase()}</span><span className="workspace-name">{workspace.userName}&apos;s workspace</span><span className="chevron">⌄</span></button>
        <nav className="side-nav" aria-label="Main navigation">
          <a className="nav-item active" href="#overview"><span className="nav-icon">◫</span>Overview</a>
          <a className="nav-item" href="#monitored-sites"><span className="nav-icon">◎</span>Monitored URLs<span className="nav-count">{urls.length}</span></a>
          <Link className="nav-item" href="/regressions"><span className="nav-icon">⌁</span>Regressions</Link>
          <Link className="nav-item" href="/releases"><span className="nav-icon">↗</span>Releases</Link>
          <Link className="nav-item" href="/github"><span className="nav-icon">⌘</span>GitHub</Link>
        </nav>
        <div className="sidebar-bottom">
          <div className="plan-card"><div className="plan-kicker">YOUR WORKSPACE</div><strong>{urls.length} <span>of 100 URLs</span></strong><div className="plan-meter"><span style={{ width: `${Math.min(100, urls.length)}%` }} /></div><div className="plan-note">Manual audits are ready to run.</div></div>
          <div className="sidebar-user"><div className="user-avatar">{workspace.avatarUrl ? <Image src={workspace.avatarUrl} alt="" width={34} height={34} unoptimized /> : workspace.userName.slice(0, 1).toUpperCase()}</div><div className="user-meta"><strong>{workspace.userName}</strong><span>{workspace.userEmail ?? "Signed in with GitHub"}</span></div><form action={signOutAction}><button className="icon-button signout" aria-label="Sign out" title="Sign out">↗</button></form></div>
        </div>
      </aside>

      <section className="main-panel" id="overview">
        <header className="topbar"><div className="breadcrumb">Workspace <span>/</span> Overview</div><div className="topbar-right"><span className="system-status"><span className="live-dot" /> All systems ready</span><span className="topbar-divider" /><span className="today-label">WEB PERFORMANCE</span></div></header>
        <div className="page-content">
          <section className="welcome-row"><div><div className="eyebrow"><span className="eyebrow-line" /> YOUR PERFORMANCE DESK</div><h1>Good to see you, {workspace.userName.split(" ")[0]}<span className="heading-period">.</span></h1><p className="welcome-copy">Your pages, measured with evidence. Let&apos;s see how they&apos;re doing.</p></div><div className="date-chip"><span className="date-glyph">◷</span> Live workspace</div></section>

          <section className="stat-grid" aria-label="Workspace summary">
            <article className="stat-card"><div className="stat-heading">MONITORED URLS <span className="stat-icon lavender">◎</span></div><div className="stat-value">{String(urls.length).padStart(2, "0")}<span className="stat-unit"> / 100</span></div><div className="stat-foot"><span className="tiny-bar"><i style={{ width: `${Math.max(0, Math.min(100, urls.length))}%` }} /></span><span>Workspace limit</span></div></article>
            <article className="stat-card"><div className="stat-heading">LATEST AUDITS <span className="stat-icon mint">◷</span></div><div className="stat-value">{String(successfulRuns).padStart(2, "0")}<span className="stat-unit"> completed</span></div><div className="stat-foot"><span className={inFlightRuns ? "status-pulse" : "status-check"}>{inFlightRuns ? "●" : "✓"}</span>{inFlightRuns ? `${inFlightRuns} running or queued` : "Ready when you are"}</div></article>
            <article className="stat-card health-card"><div className="stat-heading">FIELD DATA <span className="stat-icon amber">⌁</span></div><div className="stat-value">{String(fieldDataPages).padStart(2, "0")}<span className="stat-unit"> pages with CrUX</span></div><div className="stat-foot">28-day real-user snapshots · kept separate from lab</div></article>
          </section>

          <section className="sites-section" id="monitored-sites">
            <div className="section-heading"><div><div className="eyebrow"><span className="eyebrow-line" /> YOUR INVENTORY</div><h2>Monitored pages <span className="section-count">{urls.length}</span></h2><p>Run Lighthouse audits on public pages and keep the latest evidence close.</p></div><span className="results-note">SHOWING {urls.length} {urls.length === 1 ? "PAGE" : "PAGES"}</span></div>
            <AddUrlForm />
            <div className="table-wrap">
              <div className="table-head"><span>PAGE</span><span>LATEST AUDIT</span><span>PERFORMANCE</span><span>RUNS</span><span>ACTION</span></div>
              {urls.length ? urls.map((url) => (
                <article className="site-row" key={url.id}>
                  <div className="site-cell"><div className="site-favicon">{url.url.replace(/^https:\/\//, "").charAt(0).toUpperCase()}</div><div className="site-meta"><strong><Link href={`/pages/${url.id}`}>{url.label || new URL(url.url).hostname}</Link></strong><a href={url.url} target="_blank" rel="noreferrer">{new URL(url.url).pathname === "/" ? url.url.replace(/\/$/, "") : new URL(url.url).hostname + new URL(url.url).pathname}<span>↗</span></a></div></div>
                  <div className="audit-cell"><span className={`run-status ${url.latest_status ?? "empty"}`}><i />{statusLabel(url.latest_status)}</span><small>{url.latest_strategy ? `${url.latest_strategy} · ` : ""}{formatDate(url.latest_completed_at)}</small></div>
                  <div className="score-cell">{typeof url.latest_categories?.performance === "number" ? <><span className={`score-number ${scoreTone(url.latest_categories.performance)}`}>{url.latest_categories.performance}</span><span className="score-denom">/ 100</span></> : <span className="unavailable">— <small>{url.latest_status === "queued" || url.latest_status === "running" ? "Audit pending" : "No score yet"}</small></span>}</div>
                  <div className="runs-cell"><span>{url.run_count}</span><small>{url.run_count === 1 ? "audit" : "audits"}</small></div>
                  <div className="action-cell"><AuditActions urlId={url.id} latestAuditId={url.latest_audit_id} /></div>
                </article>
              )) : <div className="empty-state"><div className="empty-art"><span>◎</span><i /><i /><i /></div><h3>Your first page is one URL away.</h3><p>Add a public HTTPS page above, then run a Lighthouse audit to start collecting evidence.</p><span className="empty-hint">No sample scores. Only real measurements.</span></div>}
            </div>
            <footer className="table-footer"><span>Showing {urls.length} of up to 100 monitored URLs</span><span className="lab-note"><i /> LAB DATA · GOOGLE PAGESPEED INSIGHTS</span></footer>
          </section>
          <footer className="app-footer"><span>pulseboard<span className="brand-dot">.</span></span><span>Built for better web experiences.</span></footer>
        </div>
      </section>
    </main>
  );
}

function statusLabel(status: string | null) {
  if (status === "queued") return "Queued";
  if (status === "running") return "Running";
  if (status === "succeeded") return "Complete";
  if (status === "partial") return "Partial data";
  if (status === "failed") return "Failed";
  return "Not run";
}

function formatDate(date: Date | null) {
  if (!date) return "Awaiting first audit";
  return new Intl.DateTimeFormat("en", { dateStyle: "medium", timeStyle: "short" }).format(new Date(date));
}

function scoreTone(score: number) {
  if (score >= 90) return "score-good";
  if (score >= 50) return "score-mid";
  return "score-low";
}
