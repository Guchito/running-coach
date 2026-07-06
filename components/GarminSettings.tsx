"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Card, Button } from "@/components/ui";
import { HoldConfirmButton } from "@/components/HoldDeleteButton";
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
  const [modalOpen, setModalOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState<null | "connect" | "sync" | "disconnect">(null);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<SyncResult | null>(null);

  // Close the modal on Escape.
  useEffect(() => {
    if (!modalOpen) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setModalOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [modalOpen]);

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
      setModalOpen(false);
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
    setBusy("disconnect");
    try {
      await fetch("/api/garmin/disconnect", { method: "POST" });
      setResult(null);
      router.refresh();
    } finally {
      setBusy(null);
    }
  }

  // ---- Connected state ----
  if (connected) {
    return (
      <Card className="p-5 space-y-3">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="text-sm">
            <span className="text-good font-medium">✓ Connected</span>
            {lastSync && <span className="text-muted"> · last synced {formatDate(lastSync)}</span>}
          </div>
          <div className="flex gap-2">
            <Button onClick={sync} variant="soft">
              {busy === "sync" ? "Syncing…" : "Sync now"}
            </Button>
            <HoldConfirmButton
              label="Disconnect"
              busyLabel="Disconnecting…"
              title="Hold to disconnect Garmin"
              confirmText="Disconnect your Garmin account? Imported runs stay."
              onConfirm={disconnect}
              busy={busy === "disconnect"}
              className="border border-border rounded-lg"
            />
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

  // ---- Not connected: prompt + modal ----
  return (
    <Card className="p-5 flex items-center justify-between gap-4 flex-wrap">
      <p className="text-sm text-muted min-w-0">
        Import your runs automatically from Garmin Connect.
      </p>
      <Button onClick={() => setModalOpen(true)} variant="primary">
        Connect your Garmin
      </Button>

      {modalOpen && (
        <div
          className="fixed inset-0 z-50 grid place-items-center p-4 bg-black/40 backdrop-blur-sm"
          onClick={() => setModalOpen(false)}
          role="dialog"
          aria-modal="true"
          aria-label="Connect to Garmin Connect"
        >
          <div
            className="w-full max-w-md rounded-2xl border border-border bg-card shadow-xl animate-in"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header / branding */}
            <div className="relative px-6 pt-6 pb-5 border-b border-border">
              <button
                onClick={() => setModalOpen(false)}
                aria-label="Close"
                className="absolute top-3 right-4 text-muted hover:text-foreground text-xl leading-none"
              >
                ×
              </button>
              <div className="flex items-center justify-center gap-4 mb-4">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src="/garmin.png" alt="Garmin Connect" className="h-7 w-auto object-contain" />
                <span className="flex items-center text-accent">
                  <span className="block w-6 border-t-2 border-dashed border-current" />
                  <svg
                    className="w-4 h-4 -ml-1"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth={2}
                  >
                    <path d="M5 12h14M13 6l6 6-6 6" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </span>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src="/logo.png" alt="Your app" className="h-10 w-10 object-contain rounded-xl" />
              </div>
              <h3 className="text-center font-semibold text-lg">Connect to Garmin Connect</h3>
              <p className="text-center text-sm text-muted mt-1">
                Sign in with your Garmin account to import your activities.
              </p>
            </div>

            {/* Form */}
            <form onSubmit={connect} className="px-6 py-5 space-y-3">
              <div>
                <label className="text-xs text-muted">Garmin email</label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  autoComplete="username"
                  autoFocus
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

              <Button {...{ type: "submit" }} variant="primary" className="w-full">
                {busy === "connect" ? "Connecting…" : "Connect"}
              </Button>

              <div className="flex items-start gap-2 text-[11px] text-muted pt-1">
                <svg className="w-4 h-4 shrink-0 mt-px" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8}>
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
                  />
                </svg>
                <span>
                  Your password is used only to sign in — we store an encrypted session token, never
                  your password. Accounts with two-factor authentication aren&apos;t supported yet.
                </span>
              </div>
            </form>
          </div>
        </div>
      )}
    </Card>
  );
}
