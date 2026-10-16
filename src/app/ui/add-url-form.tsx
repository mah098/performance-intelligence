"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";

export function AddUrlForm() {
  const router = useRouter();
  const [url, setUrl] = useState("");
  const [label, setLabel] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/urls", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ url, label: label || undefined }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error?.message ?? "Could not add this URL.");
      setUrl("");
      setLabel("");
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not add this URL.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="add-url-form" onSubmit={submit}>
      <div className="url-input-wrap"><span className="url-input-icon">＋</span><input aria-label="Public HTTPS URL" type="url" inputMode="url" placeholder="https://your-site.com/page" value={url} onChange={(event) => setUrl(event.target.value)} required maxLength={2048} /><span className="url-prefix">HTTPS ONLY</span></div>
      <input className="label-input" aria-label="Optional page label" type="text" placeholder="Page label (optional)" value={label} onChange={(event) => setLabel(event.target.value)} maxLength={80} />
      <button className="add-url-button" disabled={busy}>{busy ? <><span className="button-spinner" /> Adding</> : <>Add page <span>→</span></>}</button>
      {error ? <p className="form-error" role="alert">{error}</p> : null}
    </form>
  );
}
