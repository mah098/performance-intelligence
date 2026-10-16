"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

type Recommendation = { priority: "high" | "medium" | "low"; title: string; rationale: string; expectedImpact: string; evidenceIds: string[]; uncertainty: string };
type Analysis = { id: string; status: "queued" | "running" | "succeeded" | "failed"; result: { summary: string; recommendations: Recommendation[]; overallUncertainty: string } | null; error_code: string | null };

export function RegressionAnalysis({ eventId }: { eventId: string }) {
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [analysis, setAnalysis] = useState<Analysis | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function refresh() {
    const response = await fetch(`/api/regressions/${eventId}/analysis`, { cache: "no-store" });
    const payload = await response.json();
    if (response.ok) {
      setEnabled(payload.enabled === true);
      setAnalysis(payload.analysis ?? null);
    }
  }

  useEffect(() => { void refresh(); }, [eventId]);
  useEffect(() => {
    if (!analysis || !["queued", "running"].includes(analysis.status)) return;
    const timer = setTimeout(() => { void refresh(); }, 2500);
    return () => clearTimeout(timer);
  }, [analysis]);

  async function requestAnalysis() {
    setBusy(true);
    setError("");
    try {
      const response = await fetch(`/api/regressions/${eventId}/analysis`, { method: "POST" });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error?.message ?? "Could not request analysis.");
      setAnalysis(payload.analysis);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not request analysis.");
    } finally {
      setBusy(false);
    }
  }

  if (enabled === null) return <div className="analysis-panel"><span className="analysis-status">Checking optional AI…</span></div>;
  return <section className="analysis-panel" aria-label="AI root-cause analysis">
    <div className="analysis-panel-head"><div><small>EVIDENCE-GROUNDED ASSISTANCE</small><strong>Root-cause analysis</strong></div>
      {!enabled ? <span className="analysis-status">Unavailable · provider not configured</span> : analysis?.status === "queued" || analysis?.status === "running" ? <span className="analysis-status">Analysis {analysis.status}…</span> : analysis?.status === "succeeded" ? <span className="analysis-status analysis-ready">Analysis ready</span> : <button type="button" className="analysis-button" disabled={busy} onClick={requestAnalysis}>{busy ? "Queueing…" : analysis?.status === "failed" ? "Retry analysis" : "Explain with AI"}</button>}
    </div>
    {analysis?.status === "succeeded" && analysis.result ? <div className="analysis-result"><p>{analysis.result.summary}</p>{analysis.result.recommendations.map((recommendation, index) => <article className="recommendation-card" key={`${recommendation.title}-${index}`}><div><span className={`recommendation-priority ${recommendation.priority}`}>{recommendation.priority}</span><strong>{recommendation.title}</strong></div><p>{recommendation.rationale}</p><small>Expected impact: {recommendation.expectedImpact}</small><small>Evidence: {recommendation.evidenceIds.join(", ")}</small><small>Uncertainty: {recommendation.uncertainty}</small><Link className="issue-draft-link" href={`/github/issues/new?eventId=${eventId}&recommendation=${index}`}>Review GitHub issue draft →</Link></article>)}<small className="analysis-uncertainty">{analysis.result.overallUncertainty}</small></div> : null}
    {analysis?.status === "failed" ? <p className="analysis-error">Analysis could not be completed ({analysis.error_code ?? "unknown error"}).</p> : null}
    {error ? <p className="analysis-error" role="alert">{error}</p> : null}
    <small className="analysis-disclaimer">AI suggestions cite supplied audit evidence. They are hypotheses for investigation and cannot establish deployment causation.</small>
  </section>;
}
