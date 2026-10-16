import { getPool } from "@/server/db";
import { runOneAnalysis } from "@/worker/analyses";

const once = process.argv.includes("--once");
const idleMs = Math.max(500, Number(process.env.ANALYSIS_POLL_INTERVAL_MS ?? 3000));
let stopping = false;

process.on("SIGTERM", () => { stopping = true; });
process.on("SIGINT", () => { stopping = true; });

console.log(JSON.stringify({ event: "analysis_worker.started", mode: once ? "once" : "poll", idleMs }));
try {
  do {
    const processed = await runOneAnalysis();
    if (once) break;
    if (!processed) await new Promise((resolve) => setTimeout(resolve, idleMs));
  } while (!stopping);
} catch (error) {
  console.error(JSON.stringify({ event: "analysis_worker.stopped_with_error", message: error instanceof Error ? error.message : "unknown" }));
  process.exitCode = 1;
} finally {
  await getPool().end();
}
