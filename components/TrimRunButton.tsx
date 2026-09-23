"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui";
import { formatDistance, formatDuration, formatPace } from "@/lib/parseRun";
import { segmentSec, trimError, trimSummary } from "@/lib/trimRun";
import type { RunSummary, RunTrim } from "@/lib/types";

const inputCls =
  "w-20 rounded-lg border border-border bg-card px-2 py-1.5 text-sm font-mono tabular-nums outline-none transition-[border-color] duration-150 focus:border-accent";

// Cut GPS overshoot off a race (e.g. a 5K recorded as 5.06 km because the
// watch started in the crowd behind the line). A small header action that
// opens a modal; the modal shows the pace of each cut section so the runner
// can see which end holds the slow shuffle.
export function TrimRunButton({
  runId,
  original,
  trim,
}: {
  runId: number;
  original: RunSummary; // the untrimmed summary
  trim: RunTrim | null;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [startM, setStartM] = useState(trim?.startM ?? 0);
  const [endM, setEndM] = useState(trim?.endM ?? 0);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && !busy && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, busy]);

  if (original.series.length < 2) return null;

  // Opening always starts from what's saved, discarding an abandoned edit.
  function openModal() {
    setStartM(trim?.startM ?? 0);
    setEndM(trim?.endM ?? 0);
    setError(null);
    setOpen(true);
  }

  const cut = { startM, endM };
  const invalid = trimError(original, cut);
  const preview = invalid ? null : trimSummary(original, cut);
  const maxCut = Math.min(1000, Math.floor(original.distanceM / 2));

  async function save(next: RunTrim) {
    setError(null);
    setBusy(true);
    try {
      const res = await fetch(`/api/runs/${runId}/trim`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(next),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not trim the run.");
      setOpen(false);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not trim the run.");
    } finally {
      setBusy(false);
    }
  }

  const cutRow = (
    label: string,
    value: number,
    set: (n: number) => void,
    from: number,
    to: number
  ) => (
    <div>
      <div className="flex items-center gap-3">
        <span className="w-20 shrink-0 text-xs text-muted">{label}</span>
        <input
          type="range"
          min={0}
          max={maxCut}
          value={value}
          onChange={(e) => set(Number(e.target.value))}
          aria-label={`${label} (meters)`}
          className="flex-1 accent-accent"
        />
        <input
          type="number"
          min={0}
          max={maxCut}
          value={value}
          onChange={(e) => set(Math.max(0, Number(e.target.value) || 0))}
          aria-label={`${label} (meters)`}
          className={inputCls}
        />
        <span className="text-xs text-muted">m</span>
      </div>
      {value > 0 && (
        <p className="text-xs text-muted mt-1 ml-23 tabular-nums">
          cut section pace {formatPace((segmentSec(original, from, to) / value) * 1000)} vs avg{" "}
          {formatPace(original.avgPaceSecPerKm)}
        </p>
      )}
    </div>
  );

  return (
    <>
      <button
        type="button"
        onClick={openModal}
        title={trim ? "Edit the trim on this run" : "Trim extra distance off this run"}
        className={`rounded-md px-2 py-1 text-sm transition-colors duration-150 ${
          trim ? "text-accent hover:text-accent-strong" : "text-muted hover:text-foreground"
        }`}
      >
        {trim ? `Trimmed ${Math.round(trim.startM + trim.endM)} m` : "Trim"}
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 grid place-items-center p-4 bg-black/40 backdrop-blur-sm"
          onClick={() => !busy && setOpen(false)}
          role="dialog"
          aria-modal="true"
          aria-label="Trim run"
        >
          <div
            className="w-full max-w-md rounded-2xl border border-border bg-card shadow-xl animate-in p-5"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3 mb-1">
              <h2 className="font-medium">Trim run</h2>
              <button
                onClick={() => setOpen(false)}
                aria-label="Close"
                className="text-muted hover:text-foreground text-xl leading-none"
              >
                ×
              </button>
            </div>
            <p className="text-sm text-muted mb-4">
              Recorded {formatDistance(original.distanceM)} in{" "}
              {formatDuration(original.durationSec)}. Cut the extra meters off the start or end.
            </p>

            <div className="space-y-3">
              {cutRow("Off the start", startM, setStartM, 0, startM)}
              {cutRow("Off the end", endM, setEndM, original.distanceM - endM, original.distanceM)}
            </div>

            <p className="text-sm tabular-nums mt-4">
              {preview ? (
                <>
                  <strong>{formatDistance(preview.distanceM)}</strong> in{" "}
                  <strong>{formatDuration(preview.durationSec)}</strong> ·{" "}
                  {formatPace(preview.avgPaceSecPerKm)}
                </>
              ) : (
                <span className="text-red-600">{invalid}</span>
              )}
            </p>
            {error && <p className="text-sm text-red-600 mt-2">{error}</p>}

            <div className="flex items-center justify-between gap-2 mt-4">
              {trim ? (
                <Button
                  variant="ghost"
                  disabled={busy}
                  onClick={() => save({ startM: 0, endM: 0 })}
                >
                  Undo trim
                </Button>
              ) : (
                <span />
              )}
              <Button disabled={busy || !!invalid} onClick={() => save(cut)}>
                {busy ? "Saving…" : "Save"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
