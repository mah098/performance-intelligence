import { NextResponse } from "next/server";
import { jsonError, unexpectedError } from "@/server/http";
import { getWorkspace } from "@/server/workspaces";
import { getGitHubAccessToken, githubJson, GitHubApiError } from "@/server/github";

export const dynamic = "force-dynamic";

type Installation = { id: number; account?: { login?: string }; permissions?: { issues?: string } };
type Repository = { id: number; name: string; full_name: string; html_url: string };

export async function GET() {
  try {
    const workspace = await getWorkspace();
    if (!workspace) return jsonError("unauthenticated", "Sign in to list GitHub repositories.", 401);
    const token = await getGitHubAccessToken(workspace);
    const installationPayload = await githubJson<{ installations?: Installation[] }>("/user/installations?per_page=100", token);
    const repositories: { id: number; name: string; fullName: string; url: string; installationId: number; account: string }[] = [];
    for (const installation of (installationPayload.data.installations ?? []).filter((item) => item.permissions?.issues === "write").slice(0, 20)) {
      for (let page = 1; page <= 5; page += 1) {
        const payload = await githubJson<{ repositories?: Repository[] }>(`/user/installations/${installation.id}/repositories?per_page=100&page=${page}`, token);
        const pageRepositories = payload.data.repositories ?? [];
        for (const repository of pageRepositories) {
          repositories.push({ id: repository.id, name: repository.name, fullName: repository.full_name, url: repository.html_url, installationId: installation.id, account: installation.account?.login ?? "GitHub account" });
        }
        if (pageRepositories.length < 100) break;
      }
    }
    return NextResponse.json({ repositories: repositories.slice(0, 500) });
  } catch (error) {
    if (error instanceof GitHubApiError) return jsonError(error.code, error.message, error.status === 401 ? 401 : error.code === "github_not_connected" ? 409 : 502);
    return unexpectedError();
  }
}
