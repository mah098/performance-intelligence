"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";

type Schedule = { enabled: boolean; frequency_hours: number; strategy: "mobile" | "desktop" } | null;

export function ScheduleControls({ urlId, schedule }: { urlId: string; schedule: Schedule }) {
  const router = useRouter();
  const [enabled, setEnabled] = useState(schedule?.enabled ?? false);
  const [frequencyHours, setFrequencyHours] = useState(schedule?.frequency_hours ?? 168);
  const [strategy, setStrategy] = useState<"mobile" | "desktop">(schedule?.strategy ?? "mobile");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch(`/api/urls/${urlId}/schedule`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ enabled, frequencyHours, strategy }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error?.message ?? "Could not save schedule.");
      setMessage(enabled ? "Schedule saved. The next audit is due after the selected interval." : "Scheduled audits paused.");
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not save schedule.");
    } finally {
      setBusy(false);
    }
  }

  return <form className="schedule-controls" onSubmit={save}>
    <label className="schedule-toggle"><input type="checkbox" checked={enabled} onChange={(event) => setEnabled(event.target.checked)} /><span>Schedule enabled</span></label>
    <label><span>FREQUENCY</span><select value={frequencyHours} onChange={(event) => setFrequencyHours(Number(event.target.value))}><option value={24}>Daily</option><option value={168}>Weekly</option><option value={720}>Monthly</option></select></label>
    <label><span>DEVICE</span><select value={strategy} onChange={(event) => setStrategy(event.target.value as typeof strategy)}><option value="mobile">Mobile</option><option value="desktop">Desktop</option></select></label>
    <button className="new-audit-link" disabled={busy}>{busy ? "Saving…" : "Save schedule"}</button>
    {message ? <span className="schedule-message" role="status">{message}</span> : null}
  </form>;
}
