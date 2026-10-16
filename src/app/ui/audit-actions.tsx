"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function AuditActions({ urlId, latestAuditId }: { urlId: string; latestAuditId: string | null }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function run(strategy: "mobile" | "desktop") {
    setBusy(true);
    setError("");
    const key = crypto.randomUUID();
    try {
      const response = await fetch(`/api/urls/${urlId}/audits`, {
        method: "POST",
        headers: { "content-type": "application/json", "idempotency-key": key },
        body: JSON.stringify({ strategy }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error?.message ?? "Could not queue this audit.");
      router.push(`/audits/${payload.auditRunId}`);
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not queue this audit.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="audit-actions">
      <div className="audit-action-buttons">
        <button className="run-audit-button" disabled={busy} onClick={() => run("mobile")} title="Run mobile PageSpeed audit">{busy ? <span className="button-spinner" /> : <span className="play-icon">▶</span>} Run audit</button>
        <select aria-label="Audit device" disabled={busy} defaultValue="mobile" onChange={(event) => { if (event.target.value === "desktop") run("desktop"); }}>
          <option value="mobile">Mobile</option><option value="desktop">Desktop</option>
        </select>
      </div>
      {latestAuditId ? <a className="audit-history-link" href={`/audits/${latestAuditId}`} title="View latest audit">↗</a> : null}
      {error ? <span className="inline-error" role="alert">{error}</span> : null}
    </div>
  );
}
