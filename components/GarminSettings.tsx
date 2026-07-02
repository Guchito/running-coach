"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Card, Button } from "@/components/ui";
import { formatDate } from "@/lib/parseRun";

type SyncResult = {
  imported?: { id: number; name: string; kind: "run" | "gym" }[];
  skipped?: number;
  errors?: { file: string; error: string }[];
  error?: string;
};

export function GarminSettings({
  connected,
  lastSync,
}: {
  connected: boolean;
  lastSync: string | null;
}) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState<null | "connect" | "sync" | "disconnect">(null);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<SyncResult | null>(null);

  async function connect(e: React.FormEvent) {
    e.preventDefault();
    setBusy("connect");
    setError(null);
    try {
      const res = await fetch("/api/garmin/connect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error || "Could not connect.");
      setPassword("");
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not connect.");
    } finally {
      setBusy(null);
    }
  }

  async function sync() {
    setBusy("sync");
    setError(null);
    setResult(null);
    try {
      const res = await fetch("/api/garmin/sync", { method: "POST" });
      const d = (await res.json()) as SyncResult;
      if (d.error) setError(d.error);
      setResult(d);
      router.refresh();
    } catch {
      setError("Sync failed.");
    } finally {
      setBusy(null);
    }
  }

  async function disconnect() {
    if (!confirm("Disconnect your Garmin account? Imported runs stay.")) return;
    setBusy("disconnect");
    try {
      await fetch("/api/garmin/disconnect", { method: "POST" });
      setResult(null);
      router.refresh();
    } finally {
      setBusy(null);
    }
  }

  if (!connected) {
    return (
      <Card className="p-5">
        <form onSubmit={connect} className="space-y-3">
          <p className="text-sm text-muted">
            Connect your Garmin account to import runs automatically. Your password is used only
            to sign in — only an encrypted session token is stored, never the password.
          </p>
          <div>
            <label className="text-xs text-muted">Garmin email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="username"
              className="mt-1 w-full rounded-lg border border-border px-3 py-2.5 text-sm outline-none focus:border-accent bg-card"
            />
          </div>
          <div>
            <label className="text-xs text-muted">Garmin password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              className="mt-1 w-full rounded-lg border border-border px-3 py-2.5 text-sm outline-none focus:border-accent bg-card"
            />
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <Button {...{ type: "submit" }} variant="primary">
            {busy === "connect" ? "Connecting…" : "Connect Garmin"}
          </Button>
          <p className="text-[11px] text-muted">
            Note: accounts with two-factor authentication aren&apos;t supported yet.
          </p>
        </form>
      </Card>
    );
  }

  return (
    <Card className="p-5 space-y-3">
      <div className="flex items-center justify-between gap-3">
        <div className="text-sm">
          <span className="text-good font-medium">✓ Connected</span>
          {lastSync && (
            <span className="text-muted"> · last synced {formatDate(lastSync)}</span>
          )}
        </div>
        <div className="flex gap-2">
          <Button onClick={sync} variant="soft">
            {busy === "sync" ? "Syncing…" : "Sync now"}
          </Button>
          <Button onClick={disconnect} variant="ghost">
            {busy === "disconnect" ? "…" : "Disconnect"}
          </Button>
        </div>
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      {result && !result.error && (
        <div className="text-sm text-muted">
          Imported {result.imported?.length ?? 0} new
          {result.skipped ? `, skipped ${result.skipped} already-imported` : ""}
          {result.errors?.length ? `, ${result.errors.length} failed` : ""}.
          {result.imported && result.imported.length > 0 && (
            <ul className="list-disc pl-5 mt-1">
              {result.imported.map((r) => (
                <li key={`${r.kind}-${r.id}`}>
                  {r.name}
                  {r.kind === "gym" ? " · gym" : ""}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </Card>
  );
}
