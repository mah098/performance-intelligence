import { readdir, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { getPool } from "../src/server/db";

const pool = getPool();
const directory = resolve(process.cwd(), "db/migrations");
const files = (await readdir(directory)).filter((file) => file.endsWith(".sql")).sort();

try {
  await pool.query(`CREATE TABLE IF NOT EXISTS schema_migrations (
    name text PRIMARY KEY,
    applied_at timestamptz NOT NULL DEFAULT now()
  )`);

  for (const name of files) {
    const { rowCount } = await pool.query("SELECT 1 FROM schema_migrations WHERE name = $1", [name]);
    if (rowCount) continue;

    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const sql = await readFile(resolve(directory, name), "utf8");
      await client.query(sql);
      await client.query("INSERT INTO schema_migrations (name) VALUES ($1)", [name]);
      await client.query("COMMIT");
      console.log(`Applied ${name}`);
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }
} finally {
  await pool.end();
}
