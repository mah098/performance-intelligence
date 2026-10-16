import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { z } from "zod";
import { getPool } from "@/server/db";
import { getWorkspace } from "@/server/workspaces";
import { AuditLiveStatus } from "@/app/ui/audit-live-status";
import { signOutAction } from "@/app/logout/actions";

export const dynamic = "force-dynamic";

export default async function AuditPage({ params }: { params: Promise<{ auditId: string }> }) {
  const workspace = await getWorkspace();
  if (!workspace) redirect("/login");
  const parsed = z.object({ auditId: z.string().uuid() }).safeParse(await params);
  if (!parsed.success) notFound();
  const result = await getPool().query(
    `SELECT a.id, a.status, a.requested_strategy, a.requested_url, a.final_url, a.queued_at,
            a.started_at, a.completed_at, a.lighthouse_version, a.lab_categories, a.lab_metrics,
            a.evidence, a.warnings, a.field_data_status, a.field_data, a.error_code, a.error_message,
            u.id AS monitored_url_id, u.label
     FROM audit_run a JOIN monitored_url u ON u.id = a.monitored_url_id
     JOIN project p ON p.id = u.project_id
     WHERE a.id = $1 AND p.organization_id = $2`,
    [parsed.data.auditId, workspace.organizationId],
  );
  const audit = result.rows[0];
  if (!audit) notFound();
  const hostname = new URL(audit.requested_url).hostname;

  return (
    <main className="audit-shell">
      <header className="audit-topbar"><Link className="brand-mark" href="/"><span className="brand-symbol">p</span><span>pulseboard<span className="brand-dot">.</span></span></Link><div className="audit-top-right"><span className="user-chip"><span className="user-chip-dot">{workspace.userName.slice(0, 1).toUpperCase()}</span>{workspace.userName}</span><form action={signOutAction}><button className="text-button" type="submit">Sign out</button></form></div></header>
      <div className="audit-content">
        <Link className="back-link" href="/">← <span>Back to monitored pages</span></Link>
        <section className="audit-page-heading"><div><div className="eyebrow"><span className="eyebrow-line" /> AUDIT RUN <span className="audit-id-short">#{audit.id.slice(0, 8)}</span></div><h1>{audit.label || hostname}<span className="heading-period">.</span></h1><a className="audit-target-link" href={audit.requested_url} target="_blank" rel="noreferrer">{audit.requested_url}<span>↗</span></a></div><div className="audit-device-chip"><span className="device-icon">{audit.requested_strategy === "mobile" ? "▯" : "▱"}</span><span>{audit.requested_strategy} audit</span></div></section>
        <AuditLiveStatus initialAudit={audit} />
        <footer className="audit-page-footer"><span>Pulseboard<span className="brand-dot">.</span> stores only normalized metrics and selected Lighthouse evidence.</span><Link href="/">Return to overview →</Link></footer>
      </div>
    </main>
  );
}
