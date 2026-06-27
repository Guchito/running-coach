import type { RunRow } from "./types";

// Personal records (best efforts) at standard distances, plus Riegel race-time
// predictions for the distances you haven't actually raced.

export type StdDistance = { key: string; label: string; meters: number; km: number | null };

export const STD_DISTANCES: StdDistance[] = [
  { key: "1k", label: "1K", meters: 1000, km: 1 },
  { key: "5k", label: "5K", meters: 5000, km: 5 },
  { key: "10k", label: "10K", meters: 10000, km: 10 },
  { key: "half", label: "Half marathon", meters: 21097, km: null },
  { key: "marathon", label: "Marathon", meters: 42195, km: null },
];

export type BestEffort = {
  key: string;
  label: string;
  meters: number;
  timeSec: number;
  paceSecPerKm: number;
  date: string; // YYYY-MM-DD
  runId: number;
};

export type RacePrediction = { key: string; label: string; meters: number; timeSec: number };

export type RunningRecords = {
  efforts: BestEffort[];
  predictions: RacePrediction[]; // for standard distances with no actual PR
  basis: BestEffort | null; // the effort the predictions are derived from
};

const RIEGEL = 1.06;

// Fastest time for k consecutive full kilometres within one run, using its
// per-km splits. Returns null if the run lacks k full-km splits in a row.
function bestKmWindow(run: RunRow, k: number): number | null {
  const sp = run.summary?.splits;
  if (!sp || sp.length < k) return null;
  let best: number | null = null;
  for (let i = 0; i + k <= sp.length; i++) {
    let sum = 0;
    let full = true;
    for (let j = i; j < i + k; j++) {
      if (sp[j].distanceM < 950) {
        full = false;
        break;
      }
      sum += sp[j].durationSec;
    }
    if (full && (best === null || sum < best)) best = sum;
  }
  return best;
}

function bestKmEffort(runs: RunRow[], d: StdDistance): BestEffort | null {
  const k = d.km!;
  let best: { time: number; run: RunRow } | null = null;
  for (const r of runs) {
    const t = bestKmWindow(r, k);
    if (t != null && (best === null || t < best.time)) best = { time: t, run: r };
  }
  if (!best) return null;
  return {
    key: d.key,
    label: d.label,
    meters: d.meters,
    timeSec: Math.round(best.time),
    paceSecPerKm: best.time / (d.meters / 1000),
    date: best.run.startedAt.slice(0, 10),
    runId: best.run.id,
  };
}

// For non-integer-km distances (half, marathon): the fastest whole run within a
// tolerance band around the distance.
function bestWholeRunEffort(runs: RunRow[], d: StdDistance): BestEffort | null {
  const lo = d.meters * 0.97;
  const hi = d.meters * 1.05;
  let best: RunRow | null = null;
  for (const r of runs) {
    if (r.distanceM >= lo && r.distanceM <= hi && (best === null || r.durationSec < best.durationSec)) {
      best = r;
    }
  }
  if (!best) return null;
  return {
    key: d.key,
    label: d.label,
    meters: d.meters,
    timeSec: Math.round(best.durationSec),
    paceSecPerKm: best.avgPaceSecPerKm,
    date: best.startedAt.slice(0, 10),
    runId: best.id,
  };
}

export function runningRecords(runs: RunRow[]): RunningRecords {
  const efforts: BestEffort[] = [];
  for (const d of STD_DISTANCES) {
    const e = d.km != null ? bestKmEffort(runs, d) : bestWholeRunEffort(runs, d);
    if (e) efforts.push(e);
  }

  // Predict from the longest actual effort (most reliable basis).
  const basis = efforts.reduce<BestEffort | null>(
    (acc, e) => (acc === null || e.meters > acc.meters ? e : acc),
    null
  );

  const haveKeys = new Set(efforts.map((e) => e.key));
  const predictions: RacePrediction[] = [];
  if (basis) {
    for (const d of STD_DISTANCES) {
      if (haveKeys.has(d.key)) continue;
      predictions.push({
        key: d.key,
        label: d.label,
        meters: d.meters,
        timeSec: Math.round(basis.timeSec * Math.pow(d.meters / basis.meters, RIEGEL)),
      });
    }
  }

  return { efforts, predictions, basis };
}
