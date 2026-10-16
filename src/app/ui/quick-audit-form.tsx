"use client";

import { useRouter } from "next/navigation";
import { type FormEvent, useState } from "react";

export function QuickAuditForm() {
  const router = useRouter();
  const [url, setUrl] = useState("");
  const [strategy, setStrategy] = useState<"mobile" | "desktop">("mobile");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch("/api/quick-audits", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url, strategy }),
      });
      const payload = await response.json() as { auditId?: string; token?: string; error?: { message?: string } };
      if (!response.ok || !payload.auditId || !payload.token) {
        setMessage(payload.error?.message ?? "Could not start the audit. Check the URL and try again.");
        return;
      }
      sessionStorage.setItem(`pulseboard-quick-audit:${payload.auditId}`, payload.token);
      router.push(`/quick-audits/${payload.auditId}`);
    } catch {
      setMessage("Could not reach the audit service. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="quick-audit-section" aria-labelledby="quick-audit-title">
      <div className="login-divider"><span>or try a one-time audit</span></div>
      <h2 id="quick-audit-title">Check a page without signing in</h2>
      <p className="quick-audit-description">Enter a public HTTPS URL for a single Lighthouse audit. Quick results are private to this browser and expire after 24 hours.</p>
      <form className="quick-audit-form" onSubmit={submit}>
        <label htmlFor="quick-audit-url">Website URL</label>
        <input id="quick-audit-url" type="url" inputMode="url" autoComplete="url" placeholder="https://example.com" value={url} onChange={(event) => setUrl(event.target.value)} required maxLength={2048} />
        <div className="quick-audit-actions">
          <label className="quick-audit-device" htmlFor="quick-audit-device">Device
            <select id="quick-audit-device" value={strategy} onChange={(event) => setStrategy(event.target.value as "mobile" | "desktop")}>
              <option value="mobile">Mobile</option>
              <option value="desktop">Desktop</option>
            </select>
          </label>
          <button className="quick-audit-button" type="submit" disabled={busy}>{busy ? "Starting…" : "Run quick audit"}<span aria-hidden="true">→</span></button>
        </div>
      </form>
      {message && <p className="quick-audit-message error" role="alert">{message}</p>}
      <p className="quick-audit-limit">Limited to 3 quick audits per hour. URL must use HTTPS and point to a public site.</p>
    </section>
  );
}
