"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { RevealOnView } from "@/components/RevealOnView";
import { interactiveRow } from "@/components/ui";
import {
  formatDate,
  formatDatesInText,
  formatDistance,
  formatDuration,
  formatPace,
} from "@/lib/parseRun";
import type { WeekVolume } from "@/lib/trainingLoad";

// Weekly volume bars for the Training load card. Hover shows the week's km;
// clicking a bar opens a modal with that week's stats and runs.
export function TrainingLoadBars({ weeks }: { weeks: WeekVolume[] }) {
  const [openIdx, setOpenIdx] = useState<number | null>(null);
  const max = Math.max(1, ...weeks.map((w) => w.km));

  useEffect(() => {
    if (openIdx == null) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpenIdx(null);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [openIdx]);

  return (
    <>
      <RevealOnView className="flex items-end gap-1.5 h-16 mt-4">
        {weeks.map((w, i) => (
          <button
            key={w.weekStart}
            type="button"
            onClick={() => setOpenIdx(i)}
            aria-label={`Week of ${formatDate(w.weekStart)}: ${w.km} km`}
            className="group relative flex-1 h-full flex items-end cursor-pointer"
          >
            <span
              className="w-full rounded-t bar-grow transition-[filter] duration-150 group-hover:brightness-90"
              style={{
                height: `${Math.max(4, (w.km / max) * 100)}%`,
                backgroundColor: i === weeks.length - 1 ? "#2563eb" : "#dbeafe",
                animationDelay: `${i * 40}ms`,
              }}
            />
            <span className="pointer-events-none absolute bottom-full left-1/2 -translate-x-1/2 mb-1 whitespace-nowrap rounded-md bg-ink px-2 py-1 text-[11px] text-white font-mono tabular-nums opacity-0 transition-opacity duration-150 group-hover:opacity-100 group-focus-visible:opacity-100 z-10">
              {w.km} km · {formatDate(w.weekStart)}
            </span>
          </button>
        ))}
      </RevealOnView>

      {openIdx != null && (
        <WeekModal
          week={weeks[openIdx]}
          prev={weeks[openIdx - 1]}
          onClose={() => setOpenIdx(null)}
        />
      )}
    </>
  );
}

function WeekModal({
  week,
  prev,
  onClose,
}: {
  week: WeekVolume;
  prev: WeekVolume | undefined;
  onClose: () => void;
}) {
  const runs = [...week.runs].sort((a, b) => a.startedAt.localeCompare(b.startedAt));
  const totalM = runs.reduce((s, r) => s + r.distanceM, 0);
  const totalSec = runs.reduce((s, r) => s + r.durationSec, 0);
  const longestM = Math.max(0, ...runs.map((r) => r.distanceM));
  const elevM = runs.reduce((s, r) => s + r.elevGainM, 0);
  // Duration-weighted, so a long easy run counts more than a short one.
  const hrRuns = runs.filter((r) => r.avgHr != null);
  const hrSec = hrRuns.reduce((s, r) => s + r.durationSec, 0);
  const avgHr = hrSec > 0 ? hrRuns.reduce((s, r) => s + r.avgHr! * r.durationSec, 0) / hrSec : null;
  const delta = prev && prev.km > 0 ? Math.round(((week.km - prev.km) / prev.km) * 100) : null;

  const end = new Date(`${week.weekStart}T00:00:00`);
  end.setDate(end.getDate() + 6);
  const endIso = `${end.getFullYear()}-${String(end.getMonth() + 1).padStart(2, "0")}-${String(end.getDate()).padStart(2, "0")}`;

  const stats: [string, string][] = [
    ["Runs", String(runs.length)],
    ["Distance", `${week.km} km`],
    ["Time", formatDuration(totalSec)],
    ["Avg pace", totalM > 0 ? formatPace(totalSec / (totalM / 1000)) : "—"],
    ["Avg per run", runs.length ? formatDistance(totalM / runs.length) : "—"],
    ["Longest run", formatDistance(longestM)],
    ["Elevation", `${Math.round(elevM)} m`],
    ["Avg HR", avgHr != null ? `${Math.round(avgHr)} bpm` : "—"],
  ];

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center p-4 bg-black/40 backdrop-blur-sm"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Week details"
    >
      <div
        className="w-full max-w-md rounded-2xl border border-border bg-card shadow-xl animate-in p-5"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 mb-1">
          <h2 className="font-medium">
            Week of {formatDate(week.weekStart)} – {formatDate(endIso)}
          </h2>
          <button
            onClick={onClose}
            aria-label="Close"
            className="text-muted hover:text-foreground text-xl leading-none"
          >
            ×
          </button>
        </div>
        {delta != null && (
          <p className={`text-xs mb-4 ${delta >= 0 ? "text-emerald-600" : "text-rose-600"}`}>
            {delta >= 0 ? "↑" : "↓"} {Math.abs(delta)}% vs previous week ({prev!.km} km)
          </p>
        )}

        {runs.length === 0 ? (
          <p className="text-sm text-muted mt-3">No runs this week.</p>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-x-4 gap-y-3 mt-3">
              {stats.map(([label, value]) => (
                <div key={label}>
                  <div className="text-xs text-muted">{label}</div>
                  <div className="font-mono font-medium tabular-nums">{value}</div>
                </div>
              ))}
            </div>
            <div className="mt-4 pt-3 border-t border-border divide-y divide-border">
              {runs.map((r) => (
                <Link
                  key={r.id}
                  href={`/runs/${r.id}`}
                  className={`flex items-center justify-between gap-3 py-2 -mx-2 px-2 rounded-lg text-sm ${interactiveRow}`}
                >
                  <div className="min-w-0">
                    <div className="truncate">{formatDatesInText(r.name)}</div>
                    <div className="text-xs text-muted">{formatDate(r.startedAt)}</div>
                  </div>
                  <div className="flex gap-4 font-mono tabular-nums shrink-0">
                    <span>{formatDistance(r.distanceM)}</span>
                    <span className="text-accent">{formatPace(r.avgPaceSecPerKm)}</span>
                  </div>
                </Link>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
