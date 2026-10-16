import { readBoundedResponseText, ResponseTooLargeError } from "@/server/bounded-response";
import { decryptTokenBundle, encryptTokenBundle, type GitHubTokenBundle } from "@/server/github-crypto";
import { getServerEnv } from "@/server/env";
import type { WorkspaceContext } from "@/server/workspaces";
import { getPool } from "@/server/db";

const API_BASE = "https://api.github.com";
const MAX_RESPONSE_BYTES = 1024 * 1024;

export class GitHubApiError extends Error {
  constructor(message: string, readonly status: number | null, readonly code: string) { super(message); }
}

export async function githubJson<T>(path: string, token: string, init: RequestInit = {}): Promise<{ data: T; response: Response }> {
  if (!path.startsWith("/") || path.startsWith("//")) throw new Error("GitHub API path must be relative.");
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12_000);
  try {
    const response = await fetch(new URL(path, API_BASE), {
      ...init,
      headers: {
        accept: "application/vnd.github+json",
        authorization: `Bearer ${token}`,
        "x-github-api-version": "2022-11-28",
        "user-agent": "Pulseboard-Performance-Intelligence",
        ...(init.body ? { "content-type": "application/json" } : {}),
        ...init.headers,
      },
      signal: controller.signal,
      cache: "no-store",
    });
    if (!response.ok) throw new GitHubApiError(response.status === 403 ? "GitHub denied this operation." : `GitHub returned HTTP ${response.status}.`, response.status, response.status === 429 || response.status === 403 ? "github_rate_limited_or_forbidden" : `github_http_${response.status}`);
    try {
      const body = await readBoundedResponseText(response.clone(), MAX_RESPONSE_BYTES);
      return { data: body ? JSON.parse(body) as T : {} as T, response };
    } catch (error) {
      if (error instanceof ResponseTooLargeError) throw new GitHubApiError("GitHub response exceeded the size limit.", response.status, "github_response_too_large");
      throw new GitHubApiError("GitHub returned malformed JSON.", response.status, "github_invalid_response");
    }
  } catch (error) {
    if (error instanceof GitHubApiError) throw error;
    if (error instanceof Error && error.name === "AbortError") throw new GitHubApiError("GitHub request timed out.", null, "github_timeout");
    throw new GitHubApiError("GitHub is temporarily unavailable.", null, "github_unavailable");
  } finally {
    clearTimeout(timeout);
  }
}

export async function getGitHubAccessToken(workspace: WorkspaceContext): Promise<string> {
  const env = getServerEnv();
  if (!env.GITHUB_TOKEN_ENCRYPTION_KEY || !env.GITHUB_APP_CLIENT_ID || !env.GITHUB_APP_CLIENT_SECRET) throw new GitHubApiError("GitHub integration is not configured.", null, "github_not_configured");
  const pool = getPool();
  const result = await pool.query<{
    encrypted_token_bundle: string; encryption_iv: string; encryption_tag: string; key_version: string;
    access_expires_at: Date; refresh_expires_at: Date | null;
  }>(
    `SELECT encrypted_token_bundle, encryption_iv, encryption_tag, key_version, access_expires_at, refresh_expires_at
     FROM github_connection WHERE organization_id = $1 AND connected_by = $2`,
    [workspace.organizationId, workspace.userId],
  );
  const row = result.rows[0];
  if (!row) throw new GitHubApiError("Connect a GitHub App account first.", null, "github_not_connected");
  const bundle = decryptTokenBundle({ ciphertext: row.encrypted_token_bundle, iv: row.encryption_iv, tag: row.encryption_tag, keyVersion: row.key_version as "env-v1" }, env.GITHUB_TOKEN_ENCRYPTION_KEY);
  if (new Date(bundle.accessExpiresAt).getTime() > Date.now() + 60_000) return bundle.accessToken;
  if (!bundle.refreshToken || (bundle.refreshExpiresAt && new Date(bundle.refreshExpiresAt).getTime() <= Date.now())) throw new GitHubApiError("Reconnect GitHub to continue.", null, "github_reauthorization_required");

  const refreshed = await exchangeRefreshToken(bundle.refreshToken);
  const nextBundle = parseTokenBundle(refreshed);
  const encrypted = encryptTokenBundle(nextBundle, env.GITHUB_TOKEN_ENCRYPTION_KEY);
  await pool.query(
    `UPDATE github_connection SET encrypted_token_bundle = $3, encryption_iv = $4, encryption_tag = $5,
       key_version = $6, access_expires_at = $7, refresh_expires_at = $8, updated_at = now()
     WHERE organization_id = $1 AND connected_by = $2`,
    [workspace.organizationId, workspace.userId, encrypted.ciphertext, encrypted.iv, encrypted.tag, encrypted.keyVersion,
      nextBundle.accessExpiresAt, nextBundle.refreshExpiresAt],
  );
  return nextBundle.accessToken;
}

export async function revokeGitHubAuthorization(workspace: WorkspaceContext): Promise<boolean> {
  const env = getServerEnv();
  if (!env.GITHUB_APP_CLIENT_ID || !env.GITHUB_APP_CLIENT_SECRET || !env.GITHUB_TOKEN_ENCRYPTION_KEY) return false;
  const result = await getPool().query<{ encrypted_token_bundle: string; encryption_iv: string; encryption_tag: string; key_version: string }>(
    `SELECT encrypted_token_bundle, encryption_iv, encryption_tag, key_version FROM github_connection
     WHERE organization_id = $1 AND connected_by = $2`,
    [workspace.organizationId, workspace.userId],
  );
  const row = result.rows[0];
  if (!row) return true;
  try {
    const bundle = decryptTokenBundle({ ciphertext: row.encrypted_token_bundle, iv: row.encryption_iv, tag: row.encryption_tag, keyVersion: row.key_version as "env-v1" }, env.GITHUB_TOKEN_ENCRYPTION_KEY);
    const authorization = Buffer.from(`${env.GITHUB_APP_CLIENT_ID}:${env.GITHUB_APP_CLIENT_SECRET}`).toString("base64");
    const response = await fetch(`https://api.github.com/applications/${encodeURIComponent(env.GITHUB_APP_CLIENT_ID)}/grant`, {
      method: "DELETE",
      headers: { accept: "application/vnd.github+json", authorization: `Basic ${authorization}`, "content-type": "application/json", "x-github-api-version": "2022-11-28" },
      body: JSON.stringify({ access_token: bundle.accessToken }),
      cache: "no-store",
      signal: AbortSignal.timeout(12_000),
    });
    return response.status === 204 || response.status === 404;
  } catch {
    return false;
  }
}

export function parseTokenBundle(value: Record<string, unknown>): GitHubTokenBundle {
  if (typeof value.access_token !== "string") throw new GitHubApiError("GitHub returned an invalid authorization response.", null, "github_invalid_token_response");
  const expiresIn = typeof value.expires_in === "number" ? value.expires_in : 8 * 60 * 60;
  const accessExpiresAt = new Date(Date.now() + expiresIn * 1000).toISOString();
  const refreshToken = typeof value.refresh_token === "string" ? value.refresh_token : null;
  const refreshExpiresAt = typeof value.refresh_token_expires_in === "number" ? new Date(Date.now() + value.refresh_token_expires_in * 1000).toISOString() : null;
  return { accessToken: value.access_token, refreshToken, accessExpiresAt, refreshExpiresAt };
}

export async function exchangeRefreshToken(refreshToken: string): Promise<Record<string, unknown>> {
  const env = getServerEnv();
  if (!env.GITHUB_APP_CLIENT_ID || !env.GITHUB_APP_CLIENT_SECRET) throw new GitHubApiError("GitHub integration is not configured.", null, "github_not_configured");
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12_000);
  try {
    const response = await fetch("https://github.com/login/oauth/access_token", {
      method: "POST",
      headers: { accept: "application/json", "content-type": "application/json" },
      body: JSON.stringify({ client_id: env.GITHUB_APP_CLIENT_ID, client_secret: env.GITHUB_APP_CLIENT_SECRET, grant_type: "refresh_token", refresh_token: refreshToken }),
      signal: controller.signal,
      cache: "no-store",
    });
    const text = await readBoundedResponseText(response, 64 * 1024);
    const payload = JSON.parse(text) as Record<string, unknown>;
    if (!response.ok || typeof payload.access_token !== "string") throw new GitHubApiError("GitHub could not refresh authorization. Reconnect the app.", response.status, "github_reauthorization_required");
    return payload;
  } catch (error) {
    if (error instanceof GitHubApiError) throw error;
    throw new GitHubApiError("GitHub authorization refresh failed. Reconnect the app.", null, "github_reauthorization_required");
  } finally {
    clearTimeout(timeout);
  }
}
