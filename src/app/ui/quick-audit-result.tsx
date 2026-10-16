"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { CSSProperties } from "react";

type QuickAudit = {
  status: string;
  requested_strategy: "mobile" | "desktop";
  requested_url: string;
  completed_at: string | null;
  lab_categories: Record<string, number | null>;
  lab_metrics: Record<string, { value: number; unit: string }>;
  field_data: {
    status: "available" | "no_data" | "not_configured" | "unavailable";
    formFactor: string | null;
    scope: "page" | "origin" | null;
    collectionPeriod: { firstDate?: string; lastDate?: string } | null;
    inp: { p75: number; unit: string } | null;
  };
  error_message: string | null;
};

const labels: Record<string, string> = {
  performance: "Performance",
  accessibility: "Accessibility",
  "best-practices": "Best Practices",
  seo: "SEO",
};

function gaugeColor(score: number | null) {
  if (score === null) return "#cbd4ce";
  if (score < 50) return "#e34c2b";
  if (score < 90) return "#ff9f2f";
  return "#00bf63";
}

function fieldStatus(status: QuickAudit["field_data"]["status"], hasInp: boolean) {
  if (hasInp) return "Available";
  if (status === "not_configured") return "CrUX is not configured";
  if (status === "no_data") return "No eligible field data";
  if (status === "unavailable") return "CrUX unavailable";
  return "INP unavailable";
}

export function QuickAuditResult({ auditId }: { auditId: string }) {
  const [audit, setAudit] = useState<QuickAudit | null>(null);
  const [message, setMessage] = useState("");
  const [expired, setExpired] = useState(false);

  useEffect(() => {
    const token = sessionStorage.getItem(`pulseboard-quick-audit:${auditId}`);
    if (!token) {
      setExpired(true);
      return;
    }

    let stopped = false;
    let timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      try {
        const response = await fetch(`/api/quick-audits/${auditId}`, {
          cache: "no-store",
          headers: { Authorization: `Bearer ${token}` },
        });
        if (response.status === 404) {
          sessionStorage.removeItem(`pulseboard-quick-audit:${auditId}`);
          if (!stopped) setExpired(true);
          return;
        }
        const payload = await response.json() as { audit?: QuickAudit; error?: { message?: string } };
        if (!response.ok || !payload.audit) {
          if (!stopped) setMessage(payload.error?.message ?? "Could not load this audit.");
          return;
        }
        if (stopped) return;
        setAudit(payload.audit);
        setMessage("");
        if (["queued", "running"].includes(payload.audit.status)) timer = setTimeout(poll, 2500);
      } catch {
        if (!stopped) {
          setMessage("We could not refresh the audit status. Retrying…");
          timer = setTimeout(poll, 4000);
        }
      }
    };
    void poll();
    return () => { stopped = true; clearTimeout(timer); };
  }, [auditId]);

  const pending = !audit || ["queued", "running"].includes(audit.status);

  return (
    <main className="quick-result-shell">
      <header className="quick-result-topbar">
        <Link className="brand-mark" href="/"><span className="brand-symbol">p</span><span>pulseboard<span className="brand-dot">.</span></span></Link>
        <Link className="quick-result-signin" href="/login">Continue with Google <span aria-hidden="true">→</span></Link>
      </header>
      <div className="quick-result-content">
        <Link className="quick-result-back" href="/login">← Back to quick audit</Link>
        <div className="quick-result-heading">
          <div className="login-eyebrow"><span className="live-dot" /> LIGHTHOUSE LAB RESULTS</div>
          <h1>{expired ? "Quick result unavailable" : pending ? "Your audit is underway" : audit?.status === "failed" ? "Audit could not complete" : "Your page performance"}</h1>
          {audit?.requested_url && <a className="quick-result-url" href={audit.requested_url} target="_blank" rel="noreferrer">{audit.requested_url}<span aria-hidden="true">↗</span></a>}
          {audit && <p className="quick-result-context">{audit.requested_strategy} audit{audit.completed_at ? ` · Completed ${new Date(audit.completed_at).toLocaleString()}` : ""}</p>}
        </div>

        {expired ? <section className="quick-result-notice" role="status"><h2>This quick result is unavailable</h2><p>Quick audit access is limited to the browser tab that started it and expires after 24 hours.</p><Link className="quick-result-primary" href="/login">Start another audit</Link></section> : null}
        {message && <p className="quick-result-message" role="status">{message}</p>}
        {pending && !expired && <section className="quick-result-pending" aria-live="polite"><span className="quick-result-spinner" /><div><strong>{audit?.status === "running" ? "Lighthouse is measuring this page" : "Waiting for an audit worker"}</strong><p>Results will appear here when the audit finishes.</p></div></section>}
        {audit?.status === "failed" && <section className="quick-result-notice error" role="alert"><h2>We couldn’t finish the audit</h2><p>{audit.error_message || "The audit failed. Check the URL and try again."}</p></section>}
        {(audit?.status === "succeeded" || audit?.status === "partial") && <>
          <section className="quick-score-panel" aria-labelledby="quick-score-title">
            <div className="quick-score-panel-head"><div><div className="login-eyebrow"><span className="live-dot" /> CATEGORY SCORES</div><h2 id="quick-score-title">Lighthouse performance scores</h2></div><span className="quick-score-device">{audit.requested_strategy}</span></div>
            <div className="quick-score-grid">
              {Object.entries(labels).map(([key, label]) => {
                const rawScore = audit.lab_categories?.[key];
                const score = typeof rawScore === "number" && Number.isFinite(rawScore) ? Math.max(0, Math.min(100, Math.round(rawScore))) : null;
                const color = gaugeColor(score);
                const style = { "--gauge-fill": `${score ?? 0}%`, "--gauge-color": color } as CSSProperties;
                return <article className="quick-score-item" key={key}>
                  <div className="quick-score-gauge" style={style} aria-label={`${label}: ${score === null ? "unavailable" : `${score} out of 100`}`}><strong style={{ color }}>{score ?? "—"}</strong></div>
                  <h3>{label}</h3>
                </article>;
              })}
            </div>
            <p className="quick-score-disclaimer">Lab scores are Lighthouse measurements for this run. They are not field data from your visitors, and scores can vary between runs.</p>
          </section>
          {Object.keys(audit.lab_metrics ?? {}).length > 0 && <section className="quick-metrics-panel"><div className="login-eyebrow"><span className="eyebrow-line" /> LAB METRICS</div><div className="quick-metrics-grid">{Object.entries(audit.lab_metrics).map(([key, metric]) => <div key={key}><span>{key.replaceAll("-", " ")}</span><strong>{metric.value.toLocaleString(undefined, { maximumFractionDigits: 2 })} <small>{metric.unit}</small></strong></div>)}</div></section>}
          <section className="quick-inp-panel" aria-labelledby="quick-inp-title">
            <div className="quick-inp-heading"><div><div className="login-eyebrow"><span className="live-dot" /> REAL-USER FIELD DATA · CRUX</div><h2 id="quick-inp-title">Interaction to Next Paint (INP)</h2></div><span className="quick-inp-status">{fieldStatus(audit.field_data?.status ?? "unavailable", Boolean(audit.field_data?.inp))}</span></div>
            <div className="quick-inp-value">{audit.field_data?.inp ? <><strong>{Math.round(audit.field_data.inp.p75)}</strong><span>{audit.field_data.inp.unit}</span><small>75th percentile</small></> : <p>{audit.field_data?.status === "not_configured" ? "Add a CrUX API key to display real-user INP." : audit.field_data?.status === "no_data" ? "Chrome UX Report has no eligible real-user data for this page or origin." : audit.field_data?.status === "unavailable" ? "Chrome UX Report could not be reached for this audit." : "INP was not available in the returned CrUX record."}</p>}</div>
            {audit.field_data?.inp && <p className="quick-inp-context">{audit.field_data.scope === "origin" ? "Origin-level fallback" : "Page-level data"}{audit.field_data.formFactor ? ` · ${audit.field_data.formFactor === "PHONE" ? "phone" : "desktop"} users` : ""}{audit.field_data.collectionPeriod?.firstDate && audit.field_data.collectionPeriod.lastDate ? ` · ${audit.field_data.collectionPeriod.firstDate}–${audit.field_data.collectionPeriod.lastDate}` : ""}</p>}
            <p className="quick-inp-note">INP is a field metric from real Chrome users, not a Lighthouse lab score. Lower values are better.</p>
          </section>
        </>}
        {!expired && <p className="quick-result-footer">Want saved history, scheduled audits, and regression alerts? <Link href="/login">Continue with Google</Link>.</p>}
      </div>
    </main>
  );
}
