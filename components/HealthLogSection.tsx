"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Card, Button } from "@/components/ui";
import type { HealthMetric } from "@/lib/types";
import { formatDate } from "@/lib/parseRun";

const inputCls =
  "rounded-lg border border-border px-3 py-2 text-sm outline-none focus:border-accent bg-card tabular-nums";

// Manual daily log (resting HR / weight / note) writing straight into the
// same health_metrics day the HealthFit sheet syncs to. Manual values
// overwrite synced ones (you're correcting the record); the delete button
// clears only these manual fields, so synced data survives — and a value the
// sheet also has returns on the next sync.
export function HealthLogSection({ initialMetrics }: { initialMetrics: HealthMetric[] }) {
  const router = useRouter();
  const today = new Date().toISOString().slice(0, 10);

  const [date, setDate] = useState(today);
  const [restingHr, setRestingHr] = useState("");
  const [weightKg, setWeightKg] = useState("");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Only days with something loggable are listed — with the sheet synced
  // that's most days, so keep the list short.
  const entries = initialMetrics
    .filter((m) => m.restingHr != null || m.weightKg != null || m.notes)
    .slice(0, 14);

  async function call(url: string, method: string, body?: unknown): Promise<boolean> {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(url, {
        method,
        headers: body ? { "Content-Type": "application/json" } : undefined,
        body: body ? JSON.stringify(body) : undefined,
      });
      if (!res.ok) throw new Error((await res.json().catch(() => null))?.error ?? "Request failed.");
      router.refresh();
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Request failed.");
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function log() {
    if (!restingHr && !weightKg && !notes.trim()) {
      setError("Enter a resting HR, a weight, or a note.");
      return;
    }
    const ok = await call("/api/health-metrics", "POST", {
      date,
      restingHr: restingHr ? Number(restingHr) : null,
      weightKg: weightKg ? Number(weightKg) : null,
      notes: notes.trim() || null,
    });
    if (ok) {
      setRestingHr("");
      setWeightKg("");
      setNotes("");
      setDate(today);
    }
  }

  return (
    <Card className="p-5 sm:p-6">
      <p className="text-sm text-muted mb-4">
        Your resting HR, weight and the rest of your daily health data sync
        automatically from the Health Metrics sheet — log a value here to fill a
        gap or correct a day, or add a note (sleep, soreness, illness…) for your
        coach. Manual values overwrite synced ones.
      </p>

      <div className="grid sm:grid-cols-3 gap-3">
        <label className="block text-sm">
          <span className="text-muted">Date</span>
          <input
            value={date}
            onChange={(e) => setDate(e.target.value)}
            type="date"
            max={today}
            className={`mt-1 w-full ${inputCls}`}
          />
        </label>
        <label className="block text-sm">
          <span className="text-muted">Resting HR (bpm)</span>
          <input
            value={restingHr}
            onChange={(e) => setRestingHr(e.target.value)}
            type="number"
            min={25}
            max={120}
            placeholder="e.g. 48"
            className={`mt-1 w-full ${inputCls}`}
          />
        </label>
        <label className="block text-sm">
          <span className="text-muted">Weight (kg)</span>
          <input
            value={weightKg}
            onChange={(e) => setWeightKg(e.target.value)}
            type="number"
            min={30}
            max={250}
            step={0.1}
            placeholder="e.g. 72.5"
            className={`mt-1 w-full ${inputCls}`}
          />
        </label>
      </div>
      <label className="block text-sm mt-3">
        <span className="text-muted">Notes (optional)</span>
        <input
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Sleep, soreness, illness…"
          className={`mt-1 w-full ${inputCls}`}
        />
      </label>

      {error && <div className="text-sm text-red-600 mt-3">{error}</div>}

      <div className="mt-4">
        <Button onClick={log} disabled={busy}>
          {busy ? "Saving…" : "Log"}
        </Button>
      </div>

      {entries.length > 0 && (
        <>
          <div className="text-xs uppercase tracking-wide text-muted mt-6 mb-2">Recent days</div>
          <div className="divide-y divide-border border border-border rounded-xl">
            {entries.map((m) => (
              <div key={m.date} className="flex items-center gap-3 px-3 py-2.5 text-sm">
                <div className="w-24 shrink-0 text-muted">{formatDate(m.date)}</div>
                <div className="flex-1 min-w-0">
                  <span className="font-medium tabular-nums">
                    {m.restingHr != null ? `${m.restingHr} bpm` : ""}
                    {m.restingHr != null && m.weightKg != null ? " · " : ""}
                    {m.weightKg != null ? `${m.weightKg} kg` : ""}
                  </span>
                  {m.notes ? <div className="text-xs text-muted truncate">{m.notes}</div> : null}
                </div>
                <button
                  onClick={() => call(`/api/health-metrics/${m.date}`, "DELETE")}
                  disabled={busy}
                  className="text-xs text-muted hover:text-red-600 shrink-0"
                  title="Clears resting HR, weight and note for this day; sheet-synced values return on the next sync"
                  aria-label="Clear entry"
                >
                  Clear
                </button>
              </div>
            ))}
          </div>
        </>
      )}
    </Card>
  );
}
