"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

type Audit = {
  id: string;
  status: string;
  requested_strategy: string;
  requested_url: string;
  final_url: string | null;
  queued_at: string;
  started_at: string | null;
  completed_at: string | null;
  lighthouse_version: string | null;
  lab_categories: Record<string, number | null>;
  lab_metrics: Record<string, { value: number; unit: string; auditId: string }>;
  evidence: { id: string; title: string; description: string; score: number | null; scoreDisplayMode: string; numericValue?: number; numericUnit?: string }[];
  warnings: string[];
  field_data_status: "available" | "no_data" | "not_configured" | "unavailable";
  field_data: {
    status: "available" | "no_data" | "not_configured" | "unavailable";
    formFactor: "PHONE" | "DESKTOP";
    page: { scope: "page" | "origin"; collectionPeriod: { firstDate: string; lastDate: string } | null; metrics: Record<string, { p75: number; unit: string }> } | null;
    originFallback: { scope: "page" | "origin"; identifier: string; collectionPeriod: { firstDate: string; lastDate: string } | null; metrics: Record<string, { p75: number; unit: string }> } | null;
    errorCode?: string;
  };
  error_code: string | null;
  error_message: string | null;
  monitored_url_id: string;
  label: string | null;
};

export function AuditLiveStatus({ initialAudit }: { initialAudit: Audit }) {
  const [audit, setAudit] = useState(initialAudit);
  const router = useRouter();
  useEffect(() => {
    if (!(["queued", "running"].includes(audit.status))) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      try {
        const response = await fetch(`/api/audits/${audit.id}`, { cache: "no-store" });
        if (response.ok) {
          const payload = await response.json();
          if (!cancelled) {
            setAudit(payload.audit);
            if (!["queued", "running"].includes(payload.audit.status)) router.refresh();
          }
        }
      } catch {
        // Status can be checked again on the next poll; the persisted run remains intact.
      }
      if (!cancelled) timer = setTimeout(poll, 2500);
    };
    timer = setTimeout(poll, 1200);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [audit.id, audit.status, router]);

  return <AuditResult audit={audit} />;
}

function AuditResult({ audit }: { audit: Audit }) {
  const categoryLabels: Record<string, string> = { performance: "Performance", accessibility: "Accessibility", "best-practices": "Best practices", seo: "SEO" };
  const metricLabels: Record<string, string> = { "largest-contentful-paint": "Largest contentful paint", "first-contentful-paint": "First contentful paint", "cumulative-layout-shift": "Cumulative layout shift", "time-to-first-byte": "Time to first byte" };
  const pending = audit.status === "queued" || audit.status === "running";
  return (
    <>
      {pending ? <section className="audit-progress-card"><div className="progress-ring"><span /></div><div><div className="eyebrow"><span className="eyebrow-line" /> GOOGLE PAGESPEED INSIGHTS</div><h2>{audit.status === "queued" ? "Your audit is in the queue." : "Reading your page signals."}</h2><p>{audit.status === "queued" ? "A worker will pick up this request shortly." : "Lighthouse is measuring the selected device profile. This may take a minute."}</p><div className="progress-track"><span /></div></div><span className="strategy-pill">{audit.requested_strategy}</span></section> : null}
      {audit.error_message ? <div className="audit-error" role="alert"><span>!</span><div><strong>Audit could not complete</strong><p>{audit.error_message}</p><small>Reference: {audit.error_code}</small></div></div> : null}
      {audit.status === "succeeded" || audit.status === "partial" ? <>
        <section className="result-summary"><div><div className="eyebrow"><span className="eyebrow-line" /> LIGHTHOUSE LAB RESULTS</div><h2>{audit.status === "partial" ? "Audit complete with partial data." : "Your audit is ready."}</h2><p>Controlled Lighthouse measurements for a {audit.requested_strategy} device profile. Results can vary between runs.</p></div><div className="result-context"><span className="context-label">LIGHTHOUSE VERSION</span><strong>{audit.lighthouse_version ?? "Unavailable"}</strong><span className="context-label">COMPLETED</span><strong>{audit.completed_at ? new Date(audit.completed_at).toLocaleString() : "—"}</strong></div></section>
        <section className="result-section"><div className="result-section-title"><div><div className="eyebrow"><span className="eyebrow-line" /> CATEGORY SCORES</div><h3>How the page performed</h3></div><span className="lab-tag"><i /> SYNTHETIC LAB DATA</span></div><div className="category-grid">{Object.entries(audit.lab_categories ?? {}).map(([key, score]) => <article className="category-card" key={key}><span>{categoryLabels[key] ?? key}</span>{typeof score === "number" ? <strong className={score >= 90 ? "score-good" : score >= 50 ? "score-mid" : "score-low"}>{score}<small>/100</small></strong> : <strong className="unavailable">—</strong>}<div className={`category-meter ${typeof score === "number" && score >= 90 ? "meter-good" : typeof score === "number" && score >= 50 ? "meter-mid" : "meter-low"}`}><i style={{ width: `${typeof score === "number" ? score : 0}%` }} /></div></article>)}</div></section>
        <section className="result-section"><div className="result-section-title"><div><div className="eyebrow"><span className="eyebrow-line" /> LAB METRICS</div><h3>Page experience signals</h3></div><span className="provenance-note">Lab results ≠ real-user field data</span></div><div className="metric-grid">{Object.entries(audit.lab_metrics ?? {}).length ? Object.entries(audit.lab_metrics).map(([key, metric]) => <article className="metric-card" key={key}><span>{metricLabels[key] ?? key}</span><strong>{formatMetric(metric.value, metric.unit)}</strong><small>Measured by Lighthouse · {metric.auditId}</small></article>) : <div className="no-metrics">No numeric lab metrics were returned for this run.</div>}</div></section>
        <FieldDataSection fieldData={audit.field_data} />
        <section className="result-section evidence-section"><div className="result-section-title"><div><div className="eyebrow"><span className="eyebrow-line" /> AUDIT EVIDENCE</div><h3>Findings worth a closer look <span className="section-count">{audit.evidence?.length ?? 0}</span></h3></div><span className="provenance-note">Up to 40 findings retained</span></div>{audit.evidence?.length ? <div className="evidence-list">{audit.evidence.map((item) => <details className="evidence-item" key={item.id}><summary><span className={`evidence-score ${item.score === null ? "score-neutral" : item.score >= 0.5 ? "score-mid" : "score-low"}`}>{item.score === null ? "i" : Math.round(item.score * 100)}</span><span className="evidence-title">{item.title}</span><code>{item.id}</code><span className="evidence-chevron">⌄</span></summary><div className="evidence-description">{item.description ? <p>{item.description.replace(/\[[^\]]+\]\([^)]*\)/g, "").replace(/<[^>]+>/g, " ")}</p> : <p>Additional audit details are available from the original PageSpeed result.</p>}{typeof item.numericValue === "number" ? <small>Measured value: {formatMetric(item.numericValue, item.numericUnit ?? "")}</small> : null}</div></details>)}</div> : <p className="no-metrics">No failed or informative findings were returned.</p>}</section>
      </> : null}
    </>
  );
}

function FieldDataSection({ fieldData }: { fieldData: Audit["field_data"] }) {
  const pageHasMetrics = Boolean(fieldData?.page && Object.keys(fieldData.page.metrics).length);
  const activeRecord = pageHasMetrics ? fieldData?.page : fieldData?.originFallback;
  const metrics = activeRecord?.metrics ?? {};
  const labels: Record<string, string> = {
    largest_contentful_paint: "Largest contentful paint",
    interaction_to_next_paint: "Interaction to next paint",
    cumulative_layout_shift: "Cumulative layout shift",
    first_contentful_paint: "First contentful paint",
    experimental_time_to_first_byte: "Time to first byte · experimental",
  };
  return (
    <section className="result-section">
      <div className="result-section-title"><div><div className="eyebrow"><span className="eyebrow-line" /> REAL-USER FIELD DATA</div><h3>Chrome UX Report</h3></div><span className="field-tag"><i /> CRUX · 28-DAY ROLLING</span></div>
      {fieldData?.status === "not_configured" ? <div className="field-empty"><span className="field-empty-icon">⌁</span><div><strong>Field data is not configured yet.</strong><p>Set the server-side CRUX_API_KEY to query real-user metrics. Lighthouse lab results remain available.</p></div></div> : null}
      {fieldData?.status === "unavailable" ? <div className="field-empty"><span className="field-empty-icon">↗</span><div><strong>CrUX could not be reached.</strong><p>This does not affect the Lighthouse result. Reference: {fieldData.errorCode ?? "provider_unavailable"}</p></div></div> : null}
      {fieldData?.status === "no_data" ? <div className="field-empty"><span className="field-empty-icon">∅</span><div><strong>No CrUX data is available for this page or origin.</strong><p>CrUX requires sufficient eligible real-user samples. Missing field metrics are not treated as zero.</p></div></div> : null}
      {fieldData?.status === "available" ? <>
        <div className="field-context"><span className="form-factor-chip">{fieldData.formFactor === "PHONE" ? "Phone" : "Desktop"} users</span><span>{activeRecord?.scope === "origin" ? "Origin-level fallback" : "Page-level data"}</span>{activeRecord?.collectionPeriod ? <span>{activeRecord.collectionPeriod.firstDate} — {activeRecord.collectionPeriod.lastDate}</span> : <span>Collection window unavailable</span>}</div>
        <div className="metric-grid">{Object.keys(metrics).length ? Object.entries(metrics).map(([key, metric]) => <article className="metric-card field-metric-card" key={key}><span>{labels[key] ?? key}</span><strong>{metric.unit === "unitless" ? metric.p75.toFixed(2) : formatMetric(metric.p75, metric.unit)}</strong><small>75th percentile · real-user data</small></article>) : <div className="no-metrics">The CrUX record contained no supported p75 metrics.</div>}</div>
        {fieldData.originFallback ? <p className="origin-fallback-note">The page has no page-level record. The values above describe all pages on {new URL(fieldData.originFallback.identifier).hostname}.</p> : null}
      </> : null}
    </section>
  );
}

function formatMetric(value: number, unit: string) {
  if (unit === "unitless") return value.toFixed(3);
  const rounded = value >= 1000 ? (value / 1000).toFixed(2) : value.toFixed(value < 10 ? 2 : 0);
  return unit === "millisecond" || unit === "ms" ? `${rounded}${value >= 1000 ? " s" : " ms"}` : `${rounded} ${unit}`.trim();
}
