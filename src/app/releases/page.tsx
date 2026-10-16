import Link from "next/link";
import { redirect } from "next/navigation";
import { getPool } from "@/server/db";
import { getWorkspace } from "@/server/workspaces";
import { signOutAction } from "@/app/logout/actions";
import { ReleaseControls } from "@/app/ui/release-controls";

export const dynamic = "force-dynamic";

export default async function ReleasesPage() {
  const workspace = await getWorkspace();
  if (!workspace) redirect("/login");
  const pool = getPool();
  const [releaseResult, auditResult] = await Promise.all([
    pool.query(`SELECT marker.id, marker.label, marker.commit_sha, marker.environment, marker.released_at,
                       count(association.audit_run_id)::int AS associated_audits
                FROM release_marker marker LEFT JOIN release_audit_association association ON association.release_marker_id = marker.id
                WHERE marker.project_id = $1 GROUP BY marker.id ORDER BY marker.released_at DESC LIMIT 100`, [workspace.projectId]),
    pool.query(`SELECT run.id, run.requested_url, url.label, run.requested_strategy, run.completed_at, run.status
                FROM audit_run run JOIN monitored_url url ON url.id = run.monitored_url_id
                WHERE url.project_id = $1 AND run.status IN ('succeeded', 'partial')
                ORDER BY run.completed_at DESC LIMIT 50`, [workspace.projectId]),
  ]);
  return <main className="audit-shell">
    <header className="audit-topbar"><Link className="brand-mark" href="/"><span className="brand-symbol">p</span><span>pulseboard<span className="brand-dot">.</span></span></Link><div className="audit-top-right"><span className="user-chip"><span className="user-chip-dot">{workspace.userName.slice(0, 1).toUpperCase()}</span>{workspace.userName}</span><form action={signOutAction}><button className="text-button" type="submit">Sign out</button></form></div></header>
    <div className="audit-content"><Link className="back-link" href="/">← <span>Back to overview</span></Link>
      <section className="audit-page-heading"><div><div className="eyebrow"><span className="eyebrow-line" /> DEPLOYMENT CONTEXT</div><h1>Release markers<span className="heading-period">.</span></h1><p className="regression-intro">Record a release label and optionally associate completed audits. These are user-provided links, not proof that a release caused a change.</p></div></section>
      <section className="result-section"><div className="result-section-title"><div><div className="eyebrow"><span className="eyebrow-line" /> MANUAL MARKER</div><h3>Record a release</h3></div><span className="provenance-note">Commit SHA and environment are optional</span></div><ReleaseControls releases={releaseResult.rows} audits={auditResult.rows} /></section>
      <footer className="audit-page-footer"><span>Release-to-audit associations are manual and auditable.</span><Link href="/">Return to overview →</Link></footer>
    </div>
  </main>;
}
