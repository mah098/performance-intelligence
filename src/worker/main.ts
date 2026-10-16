import { getPool } from "@/server/db";
import { runOneAudit } from "@/worker/audits";

const once = process.argv.includes("--once");
const idleMs = Math.max(500, Number(process.env.WORKER_POLL_INTERVAL_MS ?? 2500));
let stopping = false;

process.on("SIGTERM", () => { stopping = true; });
process.on("SIGINT", () => { stopping = true; });

console.log(JSON.stringify({ event: "worker.started", mode: once ? "once" : "poll", idleMs }));
try {
  do {
    const processed = await runOneAudit();
    if (once) break;
    if (!processed) await new Promise((resolve) => setTimeout(resolve, idleMs));
  } while (!stopping);
} catch (error) {
  console.error(JSON.stringify({ event: "worker.stopped_with_error", message: error instanceof Error ? error.message : "unknown" }));
  process.exitCode = 1;
} finally {
  await getPool().end();
}
