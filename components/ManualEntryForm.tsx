"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Card, Button } from "@/components/ui";
import { parseRaceTime, formatDuration } from "@/lib/parseRun";
import { splitRows } from "@/lib/splits";
import { GYM_TYPES } from "@/lib/gym";
import type { GymType } from "@/lib/types";

const inputCls =
  "w-full rounded-lg border border-border bg-card px-3 py-2 text-sm outline-none transition-[border-color] duration-150 focus:border-accent";
// Split-grid inputs size themselves (flex-1 / w-16) — no w-full, it would
// fight the fixed widths.
const splitInputCls =
  "rounded-lg border border-border bg-card px-2 py-1.5 text-sm font-mono tabular-nums outline-none transition-[border-color] duration-150 focus:border-accent";
const labelCls = "block text-sm";
const labelTextCls = "text-muted";

// Local "now", minute precision, for the datetime-local default.
function nowLocal(): string {
  const d = new Date();
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 16);
}


export function ManualEntryForm() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState<"run" | "gym">("run");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Shared fields
  const [name, setName] = useState("");
  const [startedAt, setStartedAt] = useState(nowLocal);
  const [duration, setDuration] = useState("");
  const [avgHr, setAvgHr] = useState("");
  // Run fields
  const [distanceKm, setDistanceKm] = useState("");
  const [elevGain, setElevGain] = useState("");
  const [showSplits, setShowSplits] = useState(false);
  const [splitTimes, setSplitTimes] = useState<string[]>([]);
  const [splitHrs, setSplitHrs] = useState<string[]>([]);

  const km = Number(distanceKm);
  const rows = useMemo(() => splitRows(km), [km]);
  // Even-pace estimate from the overall duration: shown as each split's
  // placeholder, and used as its value when the field is left empty — so the
  // runner only types the kms that differed.
  const paceEstimate = (() => {
    const d = parseRaceTime(duration);
    return d && km > 0 ? d / km : null; // sec per km
  })();
  const estimateSec = (distanceM: number) =>
    paceEstimate ? Math.round((paceEstimate * distanceM) / 1000) : null;

  // Keep one input pair per row as the distance changes, preserving what's typed.
  useEffect(() => {
    const resize = (prev: string[]) => {
      const next = prev.slice(0, rows.length);
      while (next.length < rows.length) next.push("");
      return next;
    };
    setSplitTimes(resize);
    setSplitHrs(resize);
  }, [rows.length]);

  // Empty fields resolve to their placeholder (the estimate); typed fields
  // must parse. null = unresolvable (bad input, or empty with no estimate).
  const resolvedSplits = rows.map((r, i) => {
    const t = splitTimes[i]?.trim() ?? "";
    return t ? parseRaceTime(t) : estimateSec(r.distanceM);
  });
  const anySplitFilled = splitTimes.some((t) => t.trim() !== "");
  const allSplitsResolved =
    rows.length > 0 && resolvedSplits.every((p) => p && p > 0);
  const splitsSum = allSplitsResolved
    ? (resolvedSplits as number[]).reduce((a, b) => a + b, 0)
    : null;
  // Gym fields
  const [type, setType] = useState<GymType>("full_body");
  const [rpe, setRpe] = useState("");
  const [calories, setCalories] = useState("");
  const [notes, setNotes] = useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    let durationSec = parseRaceTime(duration);
    if (kind === "run" && (!distanceKm.trim() || Number(distanceKm) <= 0)) {
      setError("Enter the distance in km.");
      return;
    }

    // Splits: empty rows take their placeholder (average pace / avg HR). A
    // complete set can stand in for the duration; if both are given they have
    // to roughly agree.
    let splitDurations: number[] | null = null;
    let splitHrValues: (number | null)[] | null = null;
    if (kind === "run" && showSplits && (anySplitFilled || allSplitsResolved)) {
      if (!allSplitsResolved) {
        setError(
          "Fill in every split (e.g. 5:30) — or enter the duration first so empty splits can use your average pace."
        );
        return;
      }
      splitDurations = resolvedSplits as number[];
      splitHrValues = splitHrs.map((h) => {
        const filled = h.trim() ? Number(h) : Number(avgHr);
        return Number.isFinite(filled) && filled > 0 ? Math.round(filled) : null;
      });
      const sum = splitsSum as number;
      if (!durationSec) {
        durationSec = sum;
      } else if (Math.abs(sum - durationSec) > Math.max(10, durationSec * 0.03)) {
        setError(
          `Your splits add up to ${formatDuration(sum)}, but the duration says ${formatDuration(
            durationSec
          )}. Fix one of them (or clear the duration to use the splits total).`
        );
        return;
      }
    }

    if (!durationSec) {
      setError(
        kind === "run"
          ? "Enter the duration (e.g. 45:30), or fill in all the splits."
          : "Enter the duration as minutes:seconds, e.g. 45:30 (or 1:20:07)."
      );
      return;
    }

    setBusy(true);
    try {
      const res = await fetch("/api/sessions/manual", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kind,
          name: name.trim(),
          startedAt,
          durationSec,
          avgHr: avgHr.trim() ? Number(avgHr) : null,
          ...(kind === "run"
            ? {
                distanceM: Number(distanceKm) * 1000,
                elevGainM: elevGain.trim() ? Number(elevGain) : null,
                splitDurations,
                splitHrs: splitHrValues,
              }
            : {
                type,
                rpe: rpe.trim() ? Number(rpe) : null,
                calories: calories.trim() ? Number(calories) : null,
                notes,
              }),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not save the session.");
      router.push(data.kind === "gym" ? `/gym/${data.id}` : `/runs/${data.id}?new=1`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save the session.");
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <div className="mt-6 flex items-center gap-3 text-sm text-muted">
        <span>No file?</span>
        <Button variant="ghost" onClick={() => setOpen(true)}>
          Log a session manually
        </Button>
      </div>
    );
  }

  const kindChip = (k: "run" | "gym", label: string) => (
    <button
      type="button"
      onClick={() => setKind(k)}
      aria-pressed={kind === k}
      className={`rounded-full border px-3 py-1.5 text-sm transition-[background-color,border-color,color,transform] duration-150 ease-out active:scale-[0.96] ${
        kind === k
          ? "border-accent bg-accent-soft text-accent font-medium"
          : "border-border text-foreground/70 hover:bg-black/4"
      }`}
    >
      {label}
    </button>
  );

  return (
    <Card className="p-5 mt-6 animate-in">
      <div className="flex items-center justify-between gap-3 mb-4">
        <h2 className="font-medium">Log a session manually</h2>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="text-muted hover:text-foreground text-lg leading-none"
          aria-label="Close manual entry"
        >
          ×
        </button>
      </div>

      <div className="flex gap-2 mb-4">
        {kindChip("run", "Run")}
        {kindChip("gym", "Gym session")}
      </div>

      <form onSubmit={submit} className="grid sm:grid-cols-2 gap-4">
        <label className={`${labelCls} sm:col-span-2`}>
          <span className={labelTextCls}>Name (optional)</span>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={kind === "run" ? "e.g. Easy 8K along the harbor" : "e.g. Push day"}
            className={`${inputCls} mt-1`}
          />
        </label>

        <label className={labelCls}>
          <span className={labelTextCls}>Date &amp; start time</span>
          <input
            type="datetime-local"
            required
            value={startedAt}
            onChange={(e) => setStartedAt(e.target.value)}
            className={`${inputCls} mt-1`}
          />
        </label>

        <label className={labelCls}>
          <span className={labelTextCls}>Duration</span>
          <input
            inputMode="numeric"
            value={duration}
            onChange={(e) => setDuration(e.target.value)}
            placeholder="45:30"
            className={`${inputCls} mt-1`}
          />
        </label>

        {kind === "run" ? (
          <>
            <label className={labelCls}>
              <span className={labelTextCls}>Distance (km)</span>
              <input
                required
                type="number"
                min="0.1"
                step="0.01"
                value={distanceKm}
                onChange={(e) => setDistanceKm(e.target.value)}
                placeholder="8.0"
                className={`${inputCls} mt-1`}
              />
            </label>
            <label className={labelCls}>
              <span className={labelTextCls}>Elevation gain (m, optional)</span>
              <input
                type="number"
                min="0"
                value={elevGain}
                onChange={(e) => setElevGain(e.target.value)}
                placeholder="40"
                className={`${inputCls} mt-1`}
              />
            </label>
            <label className={labelCls}>
              <span className={labelTextCls}>Avg heart rate (optional)</span>
              <input
                type="number"
                min="40"
                max="230"
                value={avgHr}
                onChange={(e) => setAvgHr(e.target.value)}
                placeholder="152"
                className={`${inputCls} mt-1`}
              />
            </label>

            {/* Per-km splits: offered once a distance exists. */}
            {rows.length > 0 &&
              (showSplits ? (
                <div className="sm:col-span-2 animate-in">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-sm text-muted">
                      Per-km splits · time and avg HR. Empty fields use your average.
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        setShowSplits(false);
                        setSplitTimes(rows.map(() => ""));
                        setSplitHrs(rows.map(() => ""));
                      }}
                      className="text-sm text-muted hover:text-foreground shrink-0"
                    >
                      Remove splits
                    </button>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2 mt-2">
                    {rows.map((r, i) => {
                      const est = estimateSec(r.distanceM);
                      return (
                        <div key={r.label} className="flex items-center gap-2">
                          <span className="w-16 shrink-0 text-xs text-muted">{r.label}</span>
                          <input
                            inputMode="numeric"
                            value={splitTimes[i] ?? ""}
                            onChange={(e) =>
                              setSplitTimes((prev) => {
                                const next = [...prev];
                                next[i] = e.target.value;
                                return next;
                              })
                            }
                            placeholder={est ? formatDuration(est) : "5:30"}
                            aria-label={`${r.label} time`}
                            className={`${splitInputCls} flex-1 min-w-0`}
                          />
                          <input
                            type="number"
                            min="40"
                            max="230"
                            value={splitHrs[i] ?? ""}
                            onChange={(e) =>
                              setSplitHrs((prev) => {
                                const next = [...prev];
                                next[i] = e.target.value;
                                return next;
                              })
                            }
                            placeholder={avgHr.trim() || "HR"}
                            aria-label={`${r.label} average heart rate`}
                            className={`${splitInputCls} w-16 shrink-0`}
                          />
                        </div>
                      );
                    })}
                  </div>
                  {splitsSum != null && (
                    <div className="text-xs text-muted mt-2 font-mono tabular-nums">
                      Splits total {formatDuration(splitsSum)}
                      {!duration.trim() ? " · will be used as the duration" : ""}
                    </div>
                  )}
                </div>
              ) : (
                <div className="sm:col-span-2">
                  <Button type="button" variant="soft" onClick={() => setShowSplits(true)}>
                    Want to add your splits?
                  </Button>
                  {paceEstimate == null && (
                    <p className="text-xs text-muted mt-1.5">
                      Tip: enter the duration first and each split defaults to your average
                      pace.
                    </p>
                  )}
                </div>
              ))}
          </>
        ) : (
          <>
            <label className={labelCls}>
              <span className={labelTextCls}>Type</span>
              <select
                value={type}
                onChange={(e) => setType(e.target.value as GymType)}
                className={`${inputCls} mt-1`}
              >
                {GYM_TYPES.map((t) => (
                  <option key={t.value} value={t.value}>
                    {t.label}
                  </option>
                ))}
              </select>
            </label>
            <label className={labelCls}>
              <span className={labelTextCls}>RPE 1-10 (optional)</span>
              <input
                type="number"
                min="1"
                max="10"
                value={rpe}
                onChange={(e) => setRpe(e.target.value)}
                placeholder="7"
                className={`${inputCls} mt-1`}
              />
            </label>
            <label className={labelCls}>
              <span className={labelTextCls}>Avg heart rate (optional)</span>
              <input
                type="number"
                min="40"
                max="230"
                value={avgHr}
                onChange={(e) => setAvgHr(e.target.value)}
                placeholder="121"
                className={`${inputCls} mt-1`}
              />
            </label>
            <label className={labelCls}>
              <span className={labelTextCls}>Calories (optional)</span>
              <input
                type="number"
                min="0"
                value={calories}
                onChange={(e) => setCalories(e.target.value)}
                placeholder="350"
                className={`${inputCls} mt-1`}
              />
            </label>
            <label className={`${labelCls} sm:col-span-2`}>
              <span className={labelTextCls}>Notes (optional)</span>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={2}
                placeholder="How it went, PRs, anything worth remembering"
                className={`${inputCls} mt-1 resize-none`}
              />
            </label>
          </>
        )}

        {error && (
          <div className="sm:col-span-2 animate-in text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-4 py-3">
            {error}
          </div>
        )}

        <div className="sm:col-span-2 flex gap-2">
          <Button type="submit" disabled={busy}>
            {busy ? "Saving…" : kind === "run" ? "Save run" : "Save gym session"}
          </Button>
          <Button type="button" variant="ghost" onClick={() => setOpen(false)} disabled={busy}>
            Cancel
          </Button>
        </div>
      </form>
    </Card>
  );
}
