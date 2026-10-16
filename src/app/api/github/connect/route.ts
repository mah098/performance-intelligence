import { createHash, randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { getPool } from "@/server/db";
import { getServerEnv } from "@/server/env";
import { getWorkspace } from "@/server/workspaces";
import { jsonError } from "@/server/http";
import { consumeRateLimit } from "@/server/rate-limit";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const workspace = await getWorkspace();
  if (!workspace) return NextResponse.redirect(new URL("/login", request.url));
  if (!await consumeRateLimit(workspace.organizationId, "github_connect", 5, 3600)) return jsonError("rate_limited", "GitHub connection attempts are temporarily rate limited.", 429);
  const env = getServerEnv();
  if (!env.GITHUB_APP_CLIENT_ID || !env.GITHUB_APP_CLIENT_SECRET || !env.GITHUB_TOKEN_ENCRYPTION_KEY) {
    return jsonError("github_not_configured", "Set GitHub App client credentials and the token encryption key on the server.", 503);
  }
  const state = randomBytes(32).toString("base64url");
  const verifier = randomBytes(48).toString("base64url");
  await getPool().query(
    `INSERT INTO github_oauth_state (state, user_id, organization_id, code_verifier, expires_at)
     VALUES ($1, $2, $3, $4, now() + interval '10 minutes')`,
    [state, workspace.userId, workspace.organizationId, verifier],
  );
  const baseUrl = env.APP_BASE_URL ?? new URL(request.url).origin;
  const redirectUri = new URL("/api/github/callback", baseUrl).toString();
  const challenge = createHash("sha256").update(verifier).digest("base64url");
  const authorization = new URL("https://github.com/login/oauth/authorize");
  authorization.searchParams.set("client_id", env.GITHUB_APP_CLIENT_ID);
  authorization.searchParams.set("redirect_uri", redirectUri);
  authorization.searchParams.set("state", state);
  authorization.searchParams.set("code_challenge", challenge);
  authorization.searchParams.set("code_challenge_method", "S256");
  return NextResponse.redirect(authorization);
}
