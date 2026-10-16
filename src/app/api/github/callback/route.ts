import { NextResponse } from "next/server";
import { getPool } from "@/server/db";
import { getServerEnv } from "@/server/env";
import { getWorkspace } from "@/server/workspaces";
import { encryptTokenBundle } from "@/server/github-crypto";
import { githubJson, parseTokenBundle } from "@/server/github";
import { readBoundedResponseText } from "@/server/bounded-response";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const workspace = await getWorkspace();
  if (!workspace) return NextResponse.redirect(new URL("/login", request.url));
  const requestUrl = new URL(request.url);
  const state = requestUrl.searchParams.get("state") ?? "";
  const code = requestUrl.searchParams.get("code");
  if (!state || !code) return NextResponse.redirect(new URL("/github?error=authorization_cancelled", request.url));
  const pool = getPool();
  const stateResult = await pool.query<{ user_id: string; organization_id: string; code_verifier: string }>(
    `UPDATE github_oauth_state SET consumed_at = now()
     WHERE state = $1 AND user_id = $2 AND organization_id = $3 AND consumed_at IS NULL AND expires_at > now()
     RETURNING user_id, organization_id, code_verifier`,
    [state, workspace.userId, workspace.organizationId],
  );
  const oauthState = stateResult.rows[0];
  if (!oauthState) return NextResponse.redirect(new URL("/github?error=invalid_state", request.url));

  const env = getServerEnv();
  if (!env.GITHUB_APP_CLIENT_ID || !env.GITHUB_APP_CLIENT_SECRET || !env.GITHUB_TOKEN_ENCRYPTION_KEY) return NextResponse.redirect(new URL("/github?error=not_configured", request.url));
  const baseUrl = env.APP_BASE_URL ?? requestUrl.origin;
  const redirectUri = new URL("/api/github/callback", baseUrl).toString();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12_000);
  try {
    const tokenResponse = await fetch("https://github.com/login/oauth/access_token", {
      method: "POST",
      headers: { accept: "application/json", "content-type": "application/json" },
      body: JSON.stringify({ client_id: env.GITHUB_APP_CLIENT_ID, client_secret: env.GITHUB_APP_CLIENT_SECRET, code, redirect_uri: redirectUri, code_verifier: oauthState.code_verifier }),
      signal: controller.signal,
      cache: "no-store",
    });
    const tokenBody = JSON.parse(await readBoundedResponseText(tokenResponse, 64 * 1024)) as Record<string, unknown>;
    if (!tokenResponse.ok || typeof tokenBody.access_token !== "string") return NextResponse.redirect(new URL("/github?error=token_exchange_failed", request.url));
    const bundle = parseTokenBundle(tokenBody);
    const userResponse = await githubJson<{ id: number; login: string }>("/user", bundle.accessToken);
    const provider = await pool.query<{ provider_subject: string }>("SELECT provider_subject FROM app_user WHERE id = $1", [workspace.userId]);
    if (!provider.rows[0] || provider.rows[0].provider_subject !== String(userResponse.data.id)) return NextResponse.redirect(new URL("/github?error=account_mismatch", request.url));
    const encrypted = encryptTokenBundle(bundle, env.GITHUB_TOKEN_ENCRYPTION_KEY);
    await pool.query(
      `INSERT INTO github_connection
        (organization_id, connected_by, encrypted_token_bundle, encryption_iv, encryption_tag, key_version,
         access_expires_at, refresh_expires_at, github_user_id, github_login)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       ON CONFLICT (organization_id) DO UPDATE SET connected_by = EXCLUDED.connected_by,
         encrypted_token_bundle = EXCLUDED.encrypted_token_bundle, encryption_iv = EXCLUDED.encryption_iv,
         encryption_tag = EXCLUDED.encryption_tag, key_version = EXCLUDED.key_version,
         access_expires_at = EXCLUDED.access_expires_at, refresh_expires_at = EXCLUDED.refresh_expires_at,
         github_user_id = EXCLUDED.github_user_id, github_login = EXCLUDED.github_login, updated_at = now()`,
      [workspace.organizationId, workspace.userId, encrypted.ciphertext, encrypted.iv, encrypted.tag, encrypted.keyVersion,
        bundle.accessExpiresAt, bundle.refreshExpiresAt, userResponse.data.id, userResponse.data.login],
    );
    return NextResponse.redirect(new URL("/github?connected=1", request.url));
  } catch {
    return NextResponse.redirect(new URL("/github?error=authorization_failed", request.url));
  } finally {
    clearTimeout(timeout);
  }
}
