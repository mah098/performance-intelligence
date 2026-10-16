import { NextResponse } from "next/server";
import { getPool } from "@/server/db";
import { jsonError, unexpectedError } from "@/server/http";
import { getWorkspace } from "@/server/workspaces";
import { getServerEnv } from "@/server/env";
import { revokeGitHubAuthorization } from "@/server/github";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const workspace = await getWorkspace();
    if (!workspace) return jsonError("unauthenticated", "Sign in to view GitHub connection.", 401);
    const result = await getPool().query(
      `SELECT github_login, connected_at, access_expires_at FROM github_connection
       WHERE organization_id = $1 AND connected_by = $2`,
      [workspace.organizationId, workspace.userId],
    );
    const env = getServerEnv();
    return NextResponse.json({
      configured: Boolean(env.GITHUB_APP_CLIENT_ID && env.GITHUB_APP_CLIENT_SECRET && env.GITHUB_TOKEN_ENCRYPTION_KEY),
      connection: result.rows[0] ?? null,
    });
  } catch {
    return unexpectedError();
  }
}

export async function DELETE() {
  try {
    const workspace = await getWorkspace();
    if (!workspace) return jsonError("unauthenticated", "Sign in to disconnect GitHub.", 401);
    const revoked = await revokeGitHubAuthorization(workspace);
    await getPool().query("DELETE FROM github_connection WHERE organization_id = $1 AND connected_by = $2", [workspace.organizationId, workspace.userId]);
    return NextResponse.json({ disconnected: true, revoked });
  } catch {
    return unexpectedError();
  }
}
