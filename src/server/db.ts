import { Pool } from "pg";
import { getServerEnv } from "@/server/env";

const globalForDb = globalThis as unknown as { pgPool?: Pool };

export function getPool(): Pool {
  if (!globalForDb.pgPool) {
    globalForDb.pgPool = new Pool({
      connectionString: getServerEnv().DATABASE_URL,
      max: 8,
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 5_000,
      application_name: "web-performance-intelligence",
    });
    globalForDb.pgPool.on("error", (error) => {
      console.error(JSON.stringify({ event: "db.idle_client_error", message: error.message }));
    });
  }
  return globalForDb.pgPool;
}
