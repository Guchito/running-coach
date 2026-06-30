"use client";

import { useState } from "react";
import type { Split, LapSplit } from "@/lib/types";
import { formatPace, formatDuration, formatDistance } from "@/lib/parseRun";
import { SplitsChart, LapsChart, intensityColor } from "@/components/Charts";

export function SplitsSection({
  splits,
  laps,
}: {
  splits: Split[];
  laps: LapSplit[];
}) {
  // Only offer the Intervals view when the run actually has more than one lap —
  // a single-lap (or lap-less) run has no interval structure to show.
  const hasIntervals = laps.length > 1;
  // Default to intervals when the workout also has structure (more than one
  // distinct intensity, e.g. warmup/active/recovery), else kilometers.
  const hasStructure = new Set(laps.map((l) => l.intensity)).size > 1;
  const [view, setView] = useState<"km" | "lap">(
    hasIntervals && hasStructure ? "lap" : "km"
  );

  return (
    <div className="bg-card border border-border rounded-2xl p-5">
      <div className="flex items-center justify-between mb-3 gap-3">
        <h2 className="font-medium">Splits</h2>
        {hasIntervals && (
          <div className="flex bg-black/4 rounded-lg p-0.5 text-sm">
            <button
              onClick={() => setView("km")}
              className={`px-3 py-1 rounded-md transition-colors ${
                view === "km" ? "bg-card shadow-sm font-medium" : "text-muted"
              }`}
            >
              Kilometers
            </button>
            <button
              onClick={() => setView("lap")}
              className={`px-3 py-1 rounded-md transition-colors ${
                view === "lap" ? "bg-card shadow-sm font-medium" : "text-muted"
              }`}
            >
              Intervals
            </button>
          </div>
        )}
      </div>

      {view === "km" ? (
        <>
          <SplitsChart splits={splits} />
          <div className="mt-3 max-h-56 overflow-auto text-sm">
            <table className="w-full">
              <tbody className="divide-y divide-border">
                {splits.map((sp) => (
                  <tr key={sp.km} className="tabular-nums">
                    <td className="py-1.5 text-muted">
                      Km {sp.km}
                      {sp.distanceM < 1000 ? ` (${sp.distanceM}m)` : ""}
                    </td>
                    <td className="py-1.5 font-medium">
                      {formatPace(sp.paceSecPerKm)}
                    </td>
                    <td className="py-1.5 text-muted whitespace-nowrap">
                      {sp.avgCadence ? `${Math.round(sp.avgCadence * 2)} spm` : "—"}
                    </td>
                    <td className="py-1.5 text-right text-muted">
                      {sp.avgHr ? `${sp.avgHr} bpm` : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      ) : laps.length > 0 ? (
        <>
          <LapsChart laps={laps} />
          <div className="mt-3 max-h-72 overflow-auto text-sm -mx-1">
            <table className="w-full">
              <tbody className="divide-y divide-border">
                {laps.map((l) => (
                  <tr key={l.lap} className="tabular-nums align-middle">
                    <td className="py-2 pl-1 pr-2 w-8 text-muted">{l.lap}</td>
                    <td className="py-2 pr-2">
                      <span
                        className="inline-flex items-center gap-1.5 text-xs font-medium capitalize px-2 py-0.5 rounded-full"
                        style={{
                          color: intensityColor(l.intensity),
                          backgroundColor: intensityColor(l.intensity) + "1a",
                        }}
                      >
                        <span
                          className="w-1.5 h-1.5 rounded-full"
                          style={{
                            backgroundColor: intensityColor(l.intensity),
                          }}
                        />
                        {l.intensity}
                      </span>
                    </td>
                    <td className="py-2 pr-2 font-medium whitespace-nowrap">
                      {formatPace(l.paceSecPerKm)}
                    </td>
                    <td className="py-2 pr-2 text-muted whitespace-nowrap">
                      {formatDistance(l.distanceM)}
                    </td>
                    <td className="py-2 pr-2 text-muted whitespace-nowrap hidden sm:table-cell">
                      {formatDuration(l.durationSec)}
                    </td>
                    <td className="py-2 pr-2 text-muted whitespace-nowrap hidden md:table-cell">
                      {l.avgCadence
                        ? `${Math.round(l.avgCadence * 2)} spm`
                        : "—"}
                    </td>
                    <td className="py-2 pr-1 text-right text-muted whitespace-nowrap">
                      {l.avgHr ? `${l.avgHr} bpm` : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-xs text-muted mt-3">
            Intervals come from the laps set in your watch workout.
          </p>
        </>
      ) : (
        <div className="py-10 text-center text-sm text-muted">
          This run has no interval/lap structure — it was recorded as one
          continuous effort. Switch to <strong>Kilometers</strong> for splits.
        </div>
      )}
    </div>
  );
}
