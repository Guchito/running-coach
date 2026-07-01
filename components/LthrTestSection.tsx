"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Card, Button } from "@/components/ui";
import type { LthrTest } from "@/lib/types";
import { formatDate } from "@/lib/parseRun";

const inputCls =
  "rounded-lg border border-border px-3 py-2 text-sm outline-none focus:border-accent bg-card tabular-nums";

function weeksSince(iso: string): number {
  return Math.floor((Date.now() - Date.parse(iso)) / (7 * 86400000));
}

export function LthrTestSection({
  initialTests,
  initialIntervalWeeks,
  currentLthr,
}: {
  initialTests: LthrTest[];
  initialIntervalWeeks: number | null;
  currentLthr: number | null;
}) {
  const router = useRouter();
  const today = new Date().toISOString().slice(0, 10);

  const [interval, setIntervalWeeks] = useState(
    initialIntervalWeeks ? String(initialIntervalWeeks) : ""
  );
  const [testedOn, setTestedOn] = useState(today);
  const [lthr, setLthr] = useState("");
  const [maxHr, setMaxHr] = useState("");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const tests = initialTests;
  const latest = tests[0];

  // Due status from the latest test + cadence.
  let dueBadge: { text: string; overdue: boolean } | null = null;
  if (initialIntervalWeeks && latest) {
    const due = initialIntervalWeeks - weeksSince(latest.testedOn);
    dueBadge =
      due <= 0
        ? { text: "Re-test due", overdue: true }
        : { text: `Next test in ~${due} week${due === 1 ? "" : "s"}`, overdue: false };
  } else if (initialIntervalWeeks && !latest) {
    dueBadge = { text: "No test logged yet", overdue: true };
  }

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

  async function saveCadence() {
    await call("/api/lthr-tests", "PUT", { intervalWeeks: interval ? Number(interval) : null });
  }

  async function logTest() {
    if (!lthr) {
      setError("Enter your LTHR result.");
      return;
    }
    const ok = await call("/api/lthr-tests", "POST", {
      testedOn,
      lthr: Number(lthr),
      maxHr: maxHr ? Number(maxHr) : null,
      notes: notes.trim() || null,
    });
    if (ok) {
      setLthr("");
      setMaxHr("");
      setNotes("");
      setTestedOn(today);
    }
  }

  return (
    <Card className="p-6 max-w-xl">
      <p className="text-sm text-muted mb-4">
        Log your lactate-threshold HR tests so your zones stay accurate as you get fitter. The latest
        result becomes your current LTHR
        {currentLthr ? <> (now <strong>{currentLthr} bpm</strong>)</> : null} — regenerate your zones
        from it in <span className="font-medium">Heart-rate zones</span> below.
      </p>

      {/* Cadence */}
      <div className="flex items-end gap-3 mb-2">
        <label className="block text-sm">
          <span className="text-muted">Re-test every (weeks)</span>
          <input
            value={interval}
            onChange={(e) => setIntervalWeeks(e.target.value)}
            type="number"
            min={1}
            max={52}
            placeholder="e.g. 6"
            className={`mt-1 w-32 ${inputCls}`}
          />
        </label>
        <Button variant="ghost" onClick={saveCadence} disabled={busy}>
          Save cadence
        </Button>
        {dueBadge && (
          <span
            className={`text-xs px-2 py-1 rounded-full ${
              dueBadge.overdue ? "bg-red-100 text-red-700" : "bg-accent-soft text-accent"
            }`}
          >
            {dueBadge.text}
          </span>
        )}
      </div>
      <p className="text-xs text-muted mb-5">
        Your coach will remind you to re-test when one is due. Leave blank for no schedule.
      </p>

      {/* Log a result */}
      <div className="text-xs uppercase tracking-wide text-muted mb-2">Log a test result</div>
      <div className="grid sm:grid-cols-3 gap-3">
        <label className="block text-sm">
          <span className="text-muted">Date</span>
          <input
            value={testedOn}
            onChange={(e) => setTestedOn(e.target.value)}
            type="date"
            max={today}
            className={`mt-1 w-full ${inputCls}`}
          />
        </label>
        <label className="block text-sm">
          <span className="text-muted">LTHR (bpm)</span>
          <input
            value={lthr}
            onChange={(e) => setLthr(e.target.value)}
            type="number"
            min={100}
            max={220}
            placeholder="e.g. 170"
            className={`mt-1 w-full ${inputCls}`}
          />
        </label>
        <label className="block text-sm">
          <span className="text-muted">Max HR (optional)</span>
          <input
            value={maxHr}
            onChange={(e) => setMaxHr(e.target.value)}
            type="number"
            min={120}
            max={230}
            placeholder="e.g. 190"
            className={`mt-1 w-full ${inputCls}`}
          />
        </label>
      </div>
      <label className="block text-sm mt-3">
        <span className="text-muted">Notes (optional)</span>
        <input
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Protocol, conditions, how it felt…"
          className={`mt-1 w-full ${inputCls}`}
        />
      </label>

      {error && <div className="text-sm text-red-600 mt-3">{error}</div>}

      <div className="mt-4">
        <Button onClick={logTest} disabled={busy}>
          {busy ? "Saving…" : "Log result"}
        </Button>
      </div>

      {/* History */}
      {tests.length > 0 && (
        <>
          <div className="text-xs uppercase tracking-wide text-muted mt-6 mb-2">History</div>
          <div className="divide-y divide-border border border-border rounded-xl">
            {tests.map((t, i) => {
              const older = tests[i + 1]; // chronologically previous
              const delta = older ? t.lthr - older.lthr : null;
              return (
                <div key={t.id} className="flex items-center gap-3 px-3 py-2.5 text-sm">
                  <div className="w-24 shrink-0 text-muted">{formatDate(t.testedOn)}</div>
                  <div className="flex-1 min-w-0">
                    <span className="font-medium tabular-nums">{t.lthr} bpm</span>
                    {delta != null && delta !== 0 && (
                      <span
                        className={`ml-2 text-xs tabular-nums ${
                          delta > 0 ? "text-good" : "text-muted"
                        }`}
                      >
                        {delta > 0 ? "+" : ""}
                        {delta}
                      </span>
                    )}
                    {t.maxHr ? <span className="text-xs text-muted ml-2">max {t.maxHr}</span> : null}
                    {t.notes ? <div className="text-xs text-muted truncate">{t.notes}</div> : null}
                  </div>
                  <button
                    onClick={() => call(`/api/lthr-tests/${t.id}`, "DELETE")}
                    disabled={busy}
                    className="text-xs text-muted hover:text-red-600 shrink-0"
                    aria-label="Delete test"
                  >
                    Delete
                  </button>
                </div>
              );
            })}
          </div>
        </>
      )}
    </Card>
  );
}
