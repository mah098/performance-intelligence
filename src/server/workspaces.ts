import { auth } from "../../auth";
import { getPool } from "@/server/db";

export type WorkspaceContext = {
  userId: string;
  organizationId: string;
  projectId: string;
  userName: string;
  userEmail: string | null;
  avatarUrl: string | null;
};

export async function getWorkspace(): Promise<WorkspaceContext | null> {
  const session = await auth();
  const subject = session?.user?.id;
  if (!subject) return null;

  const pool = getPool();
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1, 0))", [subject]);
    const userResult = await client.query<{ id: string; display_name: string | null; email: string | null; avatar_url: string | null }>(
      `INSERT INTO app_user (provider_subject, display_name, email, avatar_url)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (provider_subject) DO UPDATE SET
         display_name = EXCLUDED.display_name,
         email = EXCLUDED.email,
         avatar_url = EXCLUDED.avatar_url,
         updated_at = now()
       RETURNING id, display_name, email, avatar_url`,
      [subject, session.user?.name ?? null, session.user?.email ?? null, session.user?.image ?? null],
    );
    const user = userResult.rows[0];
    if (!user) throw new Error("Authenticated user could not be stored.");

    const organizationResult = await client.query<{ id: string }>(
      `INSERT INTO organization (name, personal_owner_user_id)
       VALUES ($1, $2)
       ON CONFLICT (personal_owner_user_id) DO UPDATE SET name = EXCLUDED.name
       RETURNING id`,
      [`${user.display_name ?? "My"}'s workspace`, user.id],
    );
    const organizationId = organizationResult.rows[0]?.id;
    if (!organizationId) throw new Error("Workspace could not be created.");

    await client.query(
      `INSERT INTO organization_membership (organization_id, user_id, role)
       VALUES ($1, $2, 'owner') ON CONFLICT (organization_id, user_id) DO NOTHING`,
      [organizationId, user.id],
    );
    const projectResult = await client.query<{ id: string }>(
      `SELECT id FROM project WHERE organization_id = $1 AND archived_at IS NULL ORDER BY created_at LIMIT 1`,
      [organizationId],
    );
    let projectId = projectResult.rows[0]?.id;
    if (!projectId) {
      const inserted = await client.query<{ id: string }>(
        `INSERT INTO project (organization_id, name) VALUES ($1, 'My first project') RETURNING id`,
        [organizationId],
      );
      projectId = inserted.rows[0]?.id;
    }
    if (!projectId) throw new Error("Project could not be created.");

    await client.query("COMMIT");
    return {
      userId: user.id,
      organizationId,
      projectId,
      userName: user.display_name ?? "Engineer",
      userEmail: user.email,
      avatarUrl: user.avatar_url,
    };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}
