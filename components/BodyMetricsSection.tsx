"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Card, Button } from "@/components/ui";
import type { BodyMetric } from "@/lib/types";
import { formatDate } from "@/lib/parseRun";

const inputCls =
  "rounded-lg border border-border px-3 py-2 text-sm outline-none focus:border-accent bg-card tabular-nums";

export function BodyMetricsSection({ initialMetrics }: { initialMetrics: BodyMetric[] }) {
  const router = useRouter();
  const today = new Date().toISOString().slice(0, 10);

  const [recordedOn, setRecordedOn] = useState(today);
  const [restingHr, setRestingHr] = useState("");
  const [weightKg, setWeightKg] = useState("");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const metrics = initialMetrics;

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
    if (!restingHr && !weightKg) {
      setError("Enter a resting HR or a weight.");
      return;
    }
    const ok = await call("/api/body-metrics", "POST", {
      recordedOn,
      restingHr: restingHr ? Number(restingHr) : null,
      weightKg: weightKg ? Number(weightKg) : null,
      notes: notes.trim() || null,
    });
    if (ok) {
      setRestingHr("");
      setWeightKg("");
      setNotes("");
      setRecordedOn(today);
    }
  }

  return (
    <Card className="p-6">
      <p className="text-sm text-muted mb-4">
        Log your morning resting heart rate and body weight. A creeping resting HR is an early
        fatigue signal — your coach watches the latest reading.
      </p>

      <div className="grid sm:grid-cols-3 gap-3">
        <label className="block text-sm">
          <span className="text-muted">Date</span>
          <input
            value={recordedOn}
            onChange={(e) => setRecordedOn(e.target.value)}
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

      {metrics.length > 0 && (
        <>
          <div className="text-xs uppercase tracking-wide text-muted mt-6 mb-2">History</div>
          <div className="divide-y divide-border border border-border rounded-xl">
            {metrics.map((m) => (
              <div key={m.id} className="flex items-center gap-3 px-3 py-2.5 text-sm">
                <div className="w-24 shrink-0 text-muted">{formatDate(m.recordedOn)}</div>
                <div className="flex-1 min-w-0">
                  <span className="font-medium tabular-nums">
                    {m.restingHr != null ? `${m.restingHr} bpm` : ""}
                    {m.restingHr != null && m.weightKg != null ? " · " : ""}
                    {m.weightKg != null ? `${m.weightKg} kg` : ""}
                  </span>
                  {m.notes ? <div className="text-xs text-muted truncate">{m.notes}</div> : null}
                </div>
                <button
                  onClick={() => call(`/api/body-metrics/${m.id}`, "DELETE")}
                  disabled={busy}
                  className="text-xs text-muted hover:text-red-600 shrink-0"
                  aria-label="Delete entry"
                >
                  Delete
                </button>
              </div>
            ))}
          </div>
        </>
      )}
    </Card>
  );
}
