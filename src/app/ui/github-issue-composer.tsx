"use client";

import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";

type Repository = { id: number; fullName: string; url: string; installationId: number; account: string };

export function GitHubIssueComposer({ eventId, recommendationIndex, initialTitle, initialBody }: { eventId: string; recommendationIndex: number; initialTitle: string; initialBody: string }) {
  const [repositories, setRepositories] = useState<Repository[]>([]);
  const [repositoryId, setRepositoryId] = useState("");
  const [title, setTitle] = useState(initialTitle);
  const [body, setBody] = useState(initialBody);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [issueUrl, setIssueUrl] = useState("");
  const [uncertain, setUncertain] = useState(false);

  useEffect(() => {
    void fetch("/api/github/repositories", { cache: "no-store" }).then(async (response) => {
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error?.message ?? "Could not load repositories.");
      const list = payload.repositories as Repository[];
      setRepositories(list);
      if (list[0]) setRepositoryId(String(list[0].id));
    }).catch((caught: unknown) => setError(caught instanceof Error ? caught.message : "Could not load repositories."))
      .finally(() => setLoading(false));
  }, []);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const selected = repositories.find((repository) => String(repository.id) === repositoryId);
    if (!selected) { setError("Choose an authorized repository."); return; }
    setBusy(true); setError("");
    try {
      const [owner, repository] = selected.fullName.split("/", 2);
      const response = await fetch("/api/github/issues", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ eventId, recommendationIndex, installationId: selected.installationId, repositoryId: selected.id, owner, repository, title, body, idempotencyKey: crypto.randomUUID() }),
      });
      const payload = await response.json();
      if (!response.ok) {
        if (payload.error?.code === "github_submission_unknown") setUncertain(true);
        throw new Error(payload.error?.message ?? "Could not create issue.");
      }
      setIssueUrl(payload.issueUrl);
    } catch (caught) {
      if (!(caught instanceof Error) || caught.message === "Failed to fetch") setUncertain(true);
      setError(caught instanceof Error ? caught.message : "Submission outcome may be uncertain. Check GitHub before retrying.");
    } finally { setBusy(false); }
  }

  return <>
    <form className="issue-review-form" onSubmit={submit}>
      <label><span>AUTHORIZED REPOSITORY</span><select required value={repositoryId} onChange={(event) => setRepositoryId(event.target.value)} disabled={loading || repositories.length === 0}>{repositories.map((repository) => <option key={`${repository.installationId}-${repository.id}`} value={repository.id}>{repository.fullName} · {repository.account}</option>)}</select></label>
      <label><span>ISSUE TITLE · REVIEW AND EDIT</span><input required maxLength={200} value={title} onChange={(event) => setTitle(event.target.value)} /></label>
      <label><span>ISSUE DESCRIPTION · REVIEW AND EDIT</span><textarea required maxLength={20_000} rows={16} value={body} onChange={(event) => setBody(event.target.value)} /></label>
      <p className="issue-confirm-note">Review the repository, title, and full description. The issue is created only after you press the confirmation button below.</p>
      {error ? <p className="github-message error" role="alert">{error}</p> : null}
      {uncertain ? <p className="github-message error" role="alert">Do not submit again until you check the selected repository’s issue list; GitHub may have created the issue despite a lost response.</p> : null}
      {issueUrl ? <p className="github-message success" role="status">Issue created. <a href={issueUrl} target="_blank" rel="noreferrer">Open GitHub issue ↗</a></p> : null}
      {!loading && repositories.length === 0 && !error ? <p className="github-message">No repositories with the required app access were returned. Check the GitHub App installation and Issues permission.</p> : null}
      <div className="issue-review-actions"><Link className="text-button" href="/regressions">Cancel</Link><button className="new-audit-link" disabled={busy || loading || repositories.length === 0 || uncertain || Boolean(issueUrl)}>{busy ? "Creating…" : "Confirm and create issue"}</button></div>
    </form>
  </>;
}
