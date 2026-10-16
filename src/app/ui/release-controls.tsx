"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";

type Release = { id: string; label: string; commit_sha: string | null; environment: string | null; released_at: Date; associated_audits: number };
type Audit = { id: string; requested_url: string; label: string | null; requested_strategy: string; completed_at: Date; status: string };

export function ReleaseControls({ releases, audits }: { releases: Release[]; audits: Audit[] }) {
  const router = useRouter();
  const [label, setLabel] = useState("");
  const [commitSha, setCommitSha] = useState("");
  const [environment, setEnvironment] = useState("");
  const [releaseId, setReleaseId] = useState(releases[0]?.id ?? "");
  const [auditRunId, setAuditRunId] = useState(audits[0]?.id ?? "");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch("/api/releases", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ label, commitSha, environment }) });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error?.message ?? "Could not record release.");
      setLabel(""); setCommitSha(""); setEnvironment(""); setMessage("Release marker recorded."); router.refresh();
    } catch (error) { setMessage(error instanceof Error ? error.message : "Could not record release."); }
    finally { setBusy(false); }
  }

  async function associate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch(`/api/releases/${releaseId}/associate`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ auditRunId }) });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error?.message ?? "Could not associate audit.");
      setMessage("Audit associated with the release marker."); router.refresh();
    } catch (error) { setMessage(error instanceof Error ? error.message : "Could not associate audit."); }
    finally { setBusy(false); }
  }

  return <>
    <form className="release-form" onSubmit={create}>
      <label><span>RELEASE LABEL</span><input required maxLength={120} value={label} onChange={(event) => setLabel(event.target.value)} placeholder="e.g. Checkout redesign" /></label>
      <label><span>COMMIT SHA (OPTIONAL)</span><input value={commitSha} onChange={(event) => setCommitSha(event.target.value)} pattern="[0-9a-fA-F]{7,40}" placeholder="7–40 hex characters" /></label>
      <label><span>ENVIRONMENT (OPTIONAL)</span><input maxLength={80} value={environment} onChange={(event) => setEnvironment(event.target.value)} placeholder="production" /></label>
      <button className="new-audit-link" disabled={busy}>{busy ? "Saving…" : "Record release"}</button>
    </form>
    {releases.length && audits.length ? <form className="release-associate-form" onSubmit={associate}>
      <label><span>RELEASE MARKER</span><select value={releaseId} onChange={(event) => setReleaseId(event.target.value)}>{releases.map((release) => <option key={release.id} value={release.id}>{release.label} · {formatDate(release.released_at)}</option>)}</select></label>
      <label><span>COMPLETED AUDIT</span><select value={auditRunId} onChange={(event) => setAuditRunId(event.target.value)}>{audits.map((audit) => <option key={audit.id} value={audit.id}>{audit.label || new URL(audit.requested_url).hostname} · {audit.requested_strategy} · {formatDate(audit.completed_at)}</option>)}</select></label>
      <button className="new-audit-link" disabled={busy}>{busy ? "Saving…" : "Associate audit"}</button>
    </form> : <p className="release-associate-note">Record a release and complete an audit to associate measured results with that marker.</p>}
    {message ? <p className="schedule-message" role="status">{message}</p> : null}
    <div className="release-list">{releases.map((release) => <article className="release-item" key={release.id}><div><strong>{release.label}</strong><span>{release.environment || "Environment not specified"}</span></div><div>{release.commit_sha ? <code>{release.commit_sha.slice(0, 12)}</code> : <small>No commit SHA</small>}<small>{formatDate(release.released_at)}</small></div><span className="release-count">{release.associated_audits} audits</span></article>)}</div>
  </>;
}

function formatDate(value: Date) { return new Intl.DateTimeFormat("en", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value)); }
