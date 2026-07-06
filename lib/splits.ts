import type { Split } from "./types";

// Shared helpers for manually entered per-km splits (the upload form's manual
// entry and the add-splits-later flow on a run page). Client-safe, pure.

// One split row per full km, plus a partial last km when the leftover is
// ≥ 50 m. The UI renders inputs from this; the server derives distances the
// same way, so the row counts always agree.
export function splitRows(km: number): { label: string; distanceM: number }[] {
  if (!Number.isFinite(km) || km <= 0) return [];
  const full = Math.floor(km);
  const remM = Math.round((km - full) * 1000);
  const rows = Array.from({ length: full }, (_, i) => ({
    label: `Km ${i + 1}`,
    distanceM: 1000,
  }));
  if (remM >= 50) rows.push({ label: `Last ${(remM / 1000).toFixed(2)} km`, distanceM: remM });
  return rows;
}

// Build Split[] from a run's total distance plus per-row durations (and
// optional per-row avg HR). Returns an error string when the input doesn't
// line up with the distance.
export function buildSplitsFromDurations(
  distanceM: number,
  durations: (number | null)[],
  hrs: unknown[] = []
): { splits: Split[] } | { error: string } {
  if (durations.some((d) => !d || d <= 0)) {
    return { error: "Every split needs a time (e.g. 5:30)." };
  }
  const fullKms = Math.floor(distanceM / 1000);
  const remM = Math.round(distanceM - fullKms * 1000);
  const expected = fullKms + (remM >= 50 ? 1 : 0);
  if (durations.length !== expected) {
    return { error: "The number of splits doesn't match the distance." };
  }
  const hrAt = (i: number): number | null => {
    const n = Number(hrs[i]);
    return Number.isFinite(n) && n >= 30 && n <= 250 ? Math.round(n) : null;
  };
  return {
    splits: durations.map((d, i) => {
      const dist = i < fullKms ? 1000 : remM;
      return {
        km: i + 1,
        distanceM: dist,
        durationSec: d!,
        paceSecPerKm: (d! / dist) * 1000,
        avgHr: hrAt(i),
        avgCadence: null,
        elevGainM: 0,
      };
    }),
  };
}

// Splits must roughly agree with the run's recorded duration: within 3% or
// 10 seconds, whichever is larger.
export function splitsMatchDuration(sumSec: number, durationSec: number): boolean {
  return Math.abs(sumSec - durationSec) <= Math.max(10, durationSec * 0.03);
}
