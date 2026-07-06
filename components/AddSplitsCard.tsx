"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui";
import { parseRaceTime, formatDuration } from "@/lib/parseRun";
import { splitRows, splitsMatchDuration } from "@/lib/splits";

// Sized by the layout (flex-1 / w-16), so no w-full here.
const inputCls =
  "rounded-lg border border-border bg-card px-2 py-1.5 text-sm font-mono tabular-nums outline-none transition-[border-color] duration-150 focus:border-accent";

// Shown in place of the Splits section when a run has none (manual entry,
// bulk activities.csv import): lets the runner add per-km splits after the
// fact. Every row starts pre-filled at the run's average pace and avg HR, so
// only the kms that differed need touching.
export function AddSplitsCard({
  runId,
  distanceM,
  durationSec,
  avgHr,
}: {
  runId: number;
  distanceM: number;
  durationSec: number;
  avgHr: number | null;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const rows = useMemo(() => splitRows(distanceM / 1000), [distanceM]);
  const paceSecPerKm = distanceM > 0 ? (durationSec / distanceM) * 1000 : 0;
  const estimateSec = (rowDistanceM: number) =>
    Math.round((paceSecPerKm * rowDistanceM) / 1000);

  const [times, setTimes] = useState<string[]>([]);
  const [hrs, setHrs] = useState<string[]>([]);

  function openEditor() {
    setTimes(rows.map(() => ""));
    setHrs(rows.map(() => ""));
    setOpen(true);
  }

  // Empty fields resolve to their placeholder: the even-pace estimate for
  // times, the run's avg HR for heart rate.
  const resolved = rows.map((r, i) => {
    const t = times[i]?.trim() ?? "";
    return t ? parseRaceTime(t) : estimateSec(r.distanceM);
  });
  const allResolved = rows.length > 0 && resolved.every((p) => p && p > 0);
  const sum = allResolved ? (resolved as number[]).reduce((a, b) => a + b, 0) : null;
  const mismatch = sum != null && !splitsMatchDuration(sum, durationSec);

  async function save() {
    setError(null);
    if (!allResolved) {
      setError("One of the splits isn't a valid time (use minutes:seconds, e.g. 5:30).");
      return;
    }
    if (mismatch) {
      setError(
        `Your splits add up to ${formatDuration(sum!)}, but this run took ${formatDuration(
          durationSec
        )}. Adjust them until they roughly match.`
      );
      return;
    }
    setBusy(true);
    try {
      const res = await fetch(`/api/runs/${runId}/splits`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          splitDurations: resolved,
          splitHrs: hrs.map((h) => (h.trim() ? Number(h) : avgHr)),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not save the splits.");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save the splits.");
      setBusy(false);
    }
  }

  if (rows.length === 0) return null;

  return (
    <div className="bg-card border border-border rounded-2xl p-5">
      <div className="flex items-center justify-between mb-1 gap-3">
        <h2 className="font-medium">Splits</h2>
        {open && (
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="text-sm text-muted hover:text-foreground"
            disabled={busy}
          >
            Cancel
          </button>
        )}
      </div>

      {!open ? (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-muted">
            No per-km splits were recorded for this run.
          </p>
          <Button variant="soft" onClick={openEditor}>
            Add splits
          </Button>
        </div>
      ) : (
        <div className="animate-in">
          <p className="text-sm text-muted mb-3">
            Fill in only the kms that differed — empty fields use your average pace (
            {formatDuration(Math.round(paceSecPerKm))}/km)
            {avgHr ? ` and average HR (${Math.round(avgHr)})` : ""}.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2">
            {rows.map((r, i) => (
              <div key={r.label} className="flex items-center gap-2">
                <span className="w-16 shrink-0 text-xs text-muted">{r.label}</span>
                <input
                  inputMode="numeric"
                  value={times[i] ?? ""}
                  onChange={(e) =>
                    setTimes((prev) => {
                      const next = [...prev];
                      next[i] = e.target.value;
                      return next;
                    })
                  }
                  placeholder={formatDuration(estimateSec(r.distanceM))}
                  aria-label={`${r.label} time`}
                  className={`${inputCls} flex-1 min-w-0`}
                />
                <input
                  type="number"
                  min="40"
                  max="230"
                  value={hrs[i] ?? ""}
                  onChange={(e) =>
                    setHrs((prev) => {
                      const next = [...prev];
                      next[i] = e.target.value;
                      return next;
                    })
                  }
                  placeholder={avgHr ? String(Math.round(avgHr)) : "HR"}
                  aria-label={`${r.label} average heart rate`}
                  className={`${inputCls} w-16 shrink-0`}
                />
              </div>
            ))}
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 mt-3">
            {sum != null && (
              <span
                className={`text-xs font-mono tabular-nums ${
                  mismatch ? "text-warn" : "text-muted"
                }`}
              >
                Splits total {formatDuration(sum)} · run duration {formatDuration(durationSec)}
              </span>
            )}
            <Button onClick={save} disabled={busy}>
              {busy ? "Saving…" : "Save splits"}
            </Button>
          </div>

          {error && (
            <div className="animate-in text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-4 py-3 mt-3">
              {error}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
