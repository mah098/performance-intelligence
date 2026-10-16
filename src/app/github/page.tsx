import Link from "next/link";
import { redirect } from "next/navigation";
import { getPool } from "@/server/db";
import { getWorkspace } from "@/server/workspaces";
import { getServerEnv } from "@/server/env";
import { signOutAction } from "@/app/logout/actions";
import { GitHubDisconnect } from "@/app/ui/github-disconnect";

export const dynamic = "force-dynamic";

export default async function GitHubPage({ searchParams }: { searchParams: Promise<{ connected?: string; error?: string }> }) {
  const workspace = await getWorkspace();
  if (!workspace) redirect("/login");
  const query = await searchParams;
  const env = getServerEnv();
  const connectionResult = await getPool().query<{ github_login: string; connected_at: Date; access_expires_at: Date }>(
    `SELECT github_login, connected_at, access_expires_at FROM github_connection
     WHERE organization_id = $1 AND connected_by = $2`,
    [workspace.organizationId, workspace.userId],
  );
  const issueResult = await getPool().query<{ status: string; repository_full_name: string; title: string; issue_url: string | null; error_code: string | null; created_at: Date }>(
    `SELECT status, repository_full_name, title, issue_url, error_code, created_at
     FROM github_issue_outcome WHERE organization_id = $1 ORDER BY created_at DESC LIMIT 30`,
    [workspace.organizationId],
  );
  const connection = connectionResult.rows[0];
  const errors: Record<string, string> = {
    authorization_cancelled: "GitHub authorization was cancelled.", invalid_state: "The GitHub authorization expired or could not be verified. Start again.",
    token_exchange_failed: "GitHub could not complete authorization. Start again.", account_mismatch: "Authorize the same GitHub account used to sign in to Pulseboard.",
    not_configured: "Configure the GitHub App client and encryption key on the server first.", authorization_failed: "GitHub authorization could not be completed. Start again.",
  };
  return <main className="audit-shell">
    <header className="audit-topbar"><Link className="brand-mark" href="/"><span className="brand-symbol">p</span><span>pulseboard<span className="brand-dot">.</span></span></Link><div className="audit-top-right"><span className="user-chip"><span className="user-chip-dot">{workspace.userName.slice(0, 1).toUpperCase()}</span>{workspace.userName}</span><form action={signOutAction}><button className="text-button" type="submit">Sign out</button></form></div></header>
    <div className="audit-content"><Link className="back-link" href="/">← <span>Back to overview</span></Link>
      <section className="audit-page-heading"><div><div className="eyebrow"><span className="eyebrow-line" /> ISSUE WORKFLOW</div><h1>GitHub connection<span className="heading-period">.</span></h1><p className="regression-intro">Connect a GitHub App user account. Repository access is limited by both the App’s Issues permission and your own access.</p></div></section>
      {query.connected ? <p className="github-message success" role="status">GitHub account connected.</p> : null}
      {query.error ? <p className="github-message error" role="alert">{errors[query.error] ?? "GitHub could not complete that operation."}</p> : null}
      <section className="result-section"><div className="result-section-title"><div><div className="eyebrow"><span className="eyebrow-line" /> AUTHORIZATION</div><h3>{connection ? `Connected as @${connection.github_login}` : "Connect GitHub"}</h3></div>{connection ? <GitHubDisconnect /> : null}</div>
        {connection ? <div className="github-connection-card"><span className="connection-dot" />Authorized for issue creation as <strong>@{connection.github_login}</strong><small>Token is encrypted at rest and refreshed server-side.</small><Link className="new-audit-link" href="/regressions">Return to regression inbox →</Link></div> : env.GITHUB_APP_CLIENT_ID && env.GITHUB_APP_CLIENT_SECRET && env.GITHUB_TOKEN_ENCRYPTION_KEY ? <div className="github-connection-card"><p>Authorize the GitHub App to choose a repository where you can create issues. Confirm every issue in the review form before it is sent.</p><a className="new-audit-link" href="/api/github/connect">Authorize GitHub App →</a></div> : <div className="github-connection-card"><p>GitHub integration is not configured on this server. Set GitHub App client credentials, an encryption key, and the public base URL to enable it.</p><span className="provenance-note">No personal access tokens are used.</span></div>}
      </section>
      <section className="result-section"><div className="result-section-title"><div><div className="eyebrow"><span className="eyebrow-line" /> AUDIT TRAIL</div><h3>Issue submissions <span className="section-count">{issueResult.rows.length}</span></h3></div><span className="provenance-note">Recent outcomes</span></div>
        {issueResult.rows.length ? <div className="release-list">{issueResult.rows.map((issue, index) => <article className="release-item" key={`${issue.created_at}-${index}`}><div><strong>{issue.title}</strong><span>{issue.repository_full_name}</span></div><div><span className={`issue-status ${issue.status}`}>{issue.status}</span>{issue.error_code ? <small>{issue.error_code}</small> : null}</div><div>{issue.issue_url ? <a href={issue.issue_url} target="_blank" rel="noreferrer">Open issue ↗</a> : <small>{formatDate(issue.created_at)}</small>}</div></article>)}</div> : <div className="history-empty">No issue submissions yet.</div>}
      </section>
      <footer className="audit-page-footer"><span>GitHub’s app permissions and your access are checked when the issue is submitted.</span><Link href="/">Return to overview →</Link></footer>
    </div>
  </main>;
}

function formatDate(value: Date) { return new Intl.DateTimeFormat("en", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value)); }
