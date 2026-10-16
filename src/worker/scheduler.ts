import { getPool } from "@/server/db";
import { enqueueOneDueSchedule } from "@/worker/schedules";

const once = process.argv.includes("--once");
const idleMs = Math.max(5_000, Number(process.env.SCHEDULER_POLL_INTERVAL_MS ?? 60_000));
let stopping = false;

process.on("SIGTERM", () => { stopping = true; });
process.on("SIGINT", () => { stopping = true; });

console.log(JSON.stringify({ event: "scheduler.started", mode: once ? "once" : "poll", idleMs }));
try {
  do {
    const processed = await enqueueOneDueSchedule();
    if (once) break;
    if (!processed) await new Promise((resolve) => setTimeout(resolve, idleMs));
  } while (!stopping);
} catch (error) {
  console.error(JSON.stringify({ event: "scheduler.stopped_with_error", message: error instanceof Error ? error.message : "unknown" }));
  process.exitCode = 1;
} finally {
  await getPool().end();
}
