"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";

const metrics = [
  ["lighthouse_performance_score", "Lighthouse performance score"],
  ["lighthouse_accessibility_score", "Lighthouse accessibility score"],
  ["lighthouse_best_practices_score", "Lighthouse best-practices score"],
  ["lighthouse_seo_score", "Lighthouse SEO score"],
  ["largest_contentful_paint", "Largest Contentful Paint"],
  ["interaction_to_next_paint", "Interaction to Next Paint"],
  ["cumulative_layout_shift", "Cumulative Layout Shift"],
  ["first_contentful_paint", "First Contentful Paint"],
  ["time_to_first_byte", "Time to First Byte"],
] as const;

type Policy = { id: string; metric_key: string; source: string; form_factor: string; scope: string; absolute_threshold: string; relative_threshold_percent: string | null; enabled: boolean; version: number };

export function RegressionControls({ policies }: { policies: Policy[] }) {
  const router = useRouter();
  const [metricKey, setMetricKey] = useState("lighthouse_performance_score");
  const [source, setSource] = useState<"lighthouse_lab" | "crux_field">("lighthouse_lab");
  const [formFactor, setFormFactor] = useState("mobile");
  const [scope, setScope] = useState<"page" | "origin">("page");
  const [absoluteThreshold, setAbsoluteThreshold] = useState("5");
  const [relativeThreshold, setRelativeThreshold] = useState("7");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [busy, setBusy] = useState(false);

  function changeMetric(next: string) {
    setMetricKey(next);
    if (next === "cumulative_layout_shift") {
      setAbsoluteThreshold("0.02");
      setRelativeThreshold("");
    } else if (next.includes("_score")) {
      setAbsoluteThreshold("5");
      setRelativeThreshold("7");
    } else {
      setAbsoluteThreshold(next === "interaction_to_next_paint" ? "80" : next === "first_contentful_paint" ? "150" : "200");
      setRelativeThreshold("10");
    }
  }

  const availableMetrics = source === "crux_field" ? metrics.filter(([key]) => !key.includes("_score")) : metrics;

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setSuccess("");
    const apiFormFactor = source === "crux_field" ? formFactor === "mobile" ? "PHONE" : "DESKTOP" : formFactor;
    try {
      const response = await fetch("/api/regression-policies", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          metricKey, source, formFactor: apiFormFactor, scope,
          absoluteThreshold: Number(absoluteThreshold),
          relativeThresholdPercent: relativeThreshold === "" ? undefined : Number(relativeThreshold),
        }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error?.message ?? "Could not save this rule.");
      setSuccess("Threshold policy saved.");
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not save this rule.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <form className="policy-form" onSubmit={save}>
        <label><span>METRIC</span><select value={metricKey} onChange={(event) => changeMetric(event.target.value)}>{availableMetrics.map(([key, label]) => <option value={key} key={key}>{label}</option>)}</select></label>
        <label><span>SOURCE</span><select value={source} onChange={(event) => { const value = event.target.value as typeof source; setSource(value); setFormFactor("mobile"); if (value === "lighthouse_lab") setScope("page"); if (value === "crux_field" && metricKey.includes("_score")) changeMetric("largest_contentful_paint"); }}><option value="lighthouse_lab">Lighthouse lab</option><option value="crux_field">CrUX field</option></select></label>
        <label><span>DEVICE</span><select value={formFactor} onChange={(event) => setFormFactor(event.target.value)}><option value="mobile">{source === "crux_field" ? "Phone" : "Mobile"}</option><option value="desktop">Desktop</option></select></label>
        {source === "crux_field" ? <label><span>SCOPE</span><select value={scope} onChange={(event) => setScope(event.target.value as typeof scope)}><option value="page">Page</option><option value="origin">Origin</option></select></label> : null}
        <label><span>ABSOLUTE CHANGE</span><input type="number" min="0.0001" step="any" value={absoluteThreshold} onChange={(event) => setAbsoluteThreshold(event.target.value)} required /><small>{metricKey.includes("_score") ? "score points" : metricKey === "cumulative_layout_shift" ? "CLS units" : "milliseconds"}</small></label>
        <label><span>RELATIVE CHANGE %</span><input type="number" min="0.1" max="1000" step="any" placeholder="Not used" value={relativeThreshold} onChange={(event) => setRelativeThreshold(event.target.value)} /><small>Leave blank for absolute-only</small></label>
        <button className="add-url-button policy-save" type="submit" disabled={busy}>{busy ? "Saving…" : "Save rule →"}</button>
        {error ? <p className="policy-message error" role="alert">{error}</p> : null}{success ? <p className="policy-message success" role="status">{success}</p> : null}
      </form>
      {policies.length ? <div className="policy-list"><div className="policy-list-heading">CUSTOM RULES IN THIS PROJECT</div>{policies.map((policy) => <div className="policy-item" key={policy.id}><span>{metrics.find(([key]) => key === policy.metric_key)?.[1] ?? policy.metric_key}</span><small>{policy.source === "lighthouse_lab" ? "Lab" : "CrUX"} · {policy.form_factor} · {policy.scope}</small><strong>{policy.absolute_threshold}{policy.relative_threshold_percent ? ` + ${policy.relative_threshold_percent}%` : " absolute"}</strong><span className="policy-version">v{policy.version}</span></div>)}</div> : <p className="policy-default-note">No custom rules yet. Versioned defaults are active for supported metrics and sources.</p>}
    </>
  );
}

export function AcknowledgeRegression({ eventId, status }: { eventId: string; status: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  if (status !== "open") return null;
  async function acknowledge() {
    setBusy(true);
    try {
      const response = await fetch(`/api/regressions/${eventId}/acknowledge`, { method: "POST" });
      if (response.ok) router.refresh();
    } finally {
      setBusy(false);
    }
  }
  return <button className="acknowledge-button" type="button" disabled={busy} onClick={acknowledge}>{busy ? "Saving…" : "Acknowledge"}</button>;
}
