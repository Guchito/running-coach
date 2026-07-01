"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Card, Button } from "@/components/ui";
import { formatDate, formatDatesInText } from "@/lib/parseRun";

type Config = {
  configured: boolean;
  serviceAccountEmail: string | null;
  folderId: string | null;
  lastSync: string | null;
};

type SyncResult = {
  configured: boolean;
  folderSet: boolean;
  throttled?: boolean;
  imported: { id: number; name: string; kind: "run" | "gym" }[];
  skipped: number;
  errors: { file: string; error: string }[];
  error?: string;
};

export function DriveSettings({ initial }: { initial: Config }) {
  const router = useRouter();
  const [folder, setFolder] = useState(initial.folderId ?? "");
  const [savedFolder, setSavedFolder] = useState(initial.folderId);
  const [busy, setBusy] = useState<"save" | "sync" | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [result, setResult] = useState<SyncResult | null>(null);
  const [lastSync, setLastSync] = useState(initial.lastSync);

  async function saveFolder() {
    setBusy("save");
    setMsg(null);
    try {
      const res = await fetch("/api/drive/config", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ folder }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || "Could not save.");
      setSavedFolder(d.folderId);
      setMsg(d.folderId ? "✓ Folder saved." : "Folder cleared.");
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Could not save.");
    } finally {
      setBusy(null);
    }
  }

  async function syncNow() {
    setBusy("sync");
    setMsg(null);
    setResult(null);
    try {
      const res = await fetch("/api/drive/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ force: true }),
      });
      const d: SyncResult = await res.json();
      setResult(d);
      setLastSync(new Date().toISOString());
      if (d.imported?.length) router.refresh();
    } catch {
      setMsg("Sync failed.");
    } finally {
      setBusy(null);
    }
  }

  if (!initial.configured) {
    return (
      <Card className="p-6 max-w-xl">
        <p className="text-sm text-muted">
          Google Drive auto-import isn&apos;t configured on the server yet. Add
          a service-account key (
          <span className="font-mono text-xs">GOOGLE_SERVICE_ACCOUNT_JSON</span>{" "}
          or{" "}
          <span className="font-mono text-xs">
            GOOGLE_APPLICATION_CREDENTIALS
          </span>
          ) to <span className="font-mono text-xs">.env.local</span> and restart
          — see the README&apos;s &ldquo;Google Drive&rdquo; section. Then
          refresh this page.
        </p>
      </Card>
    );
  }

  return (
    <Card className="p-6 max-w-xl space-y-4">
      <div>
        <div className="text-sm font-medium mb-1">
          1. Share your HealthFit folder
        </div>
        <p className="text-sm text-muted">
          In Google Drive, share the folder that HealthFit syncs to with this
          service account (Viewer is enough):
        </p>
        <div className="mt-2 flex items-center gap-2">
          <code className="flex-1 text-xs bg-black/4 rounded-lg px-3 py-2 break-all">
            {initial.serviceAccountEmail}
          </code>
          <Button
            type="button"
            variant="ghost"
            onClick={() =>
              navigator.clipboard?.writeText(initial.serviceAccountEmail ?? "")
            }
          >
            Copy
          </Button>
        </div>
      </div>

      <div>
        <div className="text-sm font-medium mb-1">2. Point to the folder</div>
        <p className="text-sm text-muted mb-2">
          Paste the folder&apos;s share link or its ID.
        </p>
        <div className="flex items-center gap-2">
          <input
            value={folder}
            onChange={(e) => setFolder(e.target.value)}
            placeholder="https://drive.google.com/drive/folders/…"
            className="flex-1 rounded-lg border border-border px-3 py-2 text-sm outline-none focus:border-accent bg-card"
          />
          <Button type="button" onClick={saveFolder} disabled={busy !== null}>
            {busy === "save" ? "Saving…" : "Save"}
          </Button>
        </div>
      </div>

      <div className="flex items-center gap-3 pt-2 border-t border-border">
        <Button
          type="button"
          variant="soft"
          onClick={syncNow}
          disabled={busy !== null || !savedFolder}
        >
          {busy === "sync" ? "Syncing…" : "Sync now"}
        </Button>
        {lastSync && (
          <span className="text-xs text-muted">
            Last synced {formatDate(lastSync)}{" "}
            {new Date(lastSync).toLocaleTimeString("en-GB", {
              hour: "2-digit",
              minute: "2-digit",
            })}
          </span>
        )}
      </div>

      {msg && <div className="text-sm text-muted">{msg}</div>}

      {result && (
        <div className="text-sm rounded-lg bg-black/3 p-3">
          {result.error ? (
            <span className="text-red-600">⚠️ {result.error}</span>
          ) : result.imported.length ? (
            <div>
              <div className="text-good font-medium">
                ✓ Imported {result.imported.length} new activit
                {result.imported.length === 1 ? "y" : "ies"}
              </div>
              <ul className="list-disc pl-5 mt-1 text-muted">
                {result.imported.map((r) => (
                  <li key={`${r.kind}-${r.id}`}>
                    {formatDatesInText(r.name)}
                    {r.kind === "gym" ? " · gym" : ""}
                  </li>
                ))}
              </ul>
            </div>
          ) : (
            <span className="text-muted">
              No new activities found
              {result.skipped ? ` (${result.skipped} already imported)` : ""}.
            </span>
          )}
          {result.errors?.length > 0 && (
            <div className="text-warn mt-2">
              {result.errors.length} file(s) couldn&apos;t be read:{" "}
              {result.errors.map((e) => e.file).join(", ")}
            </div>
          )}
        </div>
      )}
    </Card>
  );
}
