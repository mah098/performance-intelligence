"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function GitHubDisconnect() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  async function disconnect() {
    setBusy(true);
    const response = await fetch("/api/github/connection", { method: "DELETE" });
    const payload = await response.json();
    setBusy(false);
    if (response.ok) {
      if (!payload.revoked) setMessage("Connection removed here. GitHub may still show an authorization to revoke in your account settings.");
      router.refresh();
    }
  }
  return <span className="github-disconnect-wrap"><button className="text-button github-disconnect" type="button" disabled={busy} onClick={disconnect}>{busy ? "Disconnecting…" : "Disconnect"}</button>{message ? <small role="status">{message}</small> : null}</span>;
}
