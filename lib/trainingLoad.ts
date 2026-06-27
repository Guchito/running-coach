import type { RunRow } from "./types";

// Acute:chronic workload ratio (ACWR) and recent weekly volume, from run
// distance. A ratio in ~0.8–1.3 is the "sweet spot"; >1.5 flags a risky ramp.

export type WeekVolume = { weekStart: string; km: number };

export type TrainingLoad = {
  acuteKm: number; // last 7 days
  chronicKm: number; // average weekly volume over the last 28 days
  ratio: number | null; // acute / chronic
  status: "none" | "detraining" | "optimal" | "caution" | "high";
  weeks: WeekVolume[]; // last 6 weeks, oldest → newest
};

const DAY = 86400000;
const round1 = (n: number) => Math.round(n * 10) / 10;

function startOfWeek(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  x.setDate(x.getDate() - ((x.getDay() + 6) % 7)); // back to Monday
  return x;
}

function isoDate(d: Date): string {
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}

function lastNWeeks(runs: RunRow[], n: number, now: number): WeekVolume[] {
  const cur = startOfWeek(new Date(now));
  const buckets: WeekVolume[] = [];
  for (let i = n - 1; i >= 0; i--) {
    const ws = new Date(cur);
    ws.setDate(ws.getDate() - 7 * i);
    buckets.push({ weekStart: isoDate(ws), km: 0 });
  }
  const idxByKey = new Map(buckets.map((b, i) => [b.weekStart, i]));
  for (const r of runs) {
    const key = isoDate(startOfWeek(new Date(r.startedAt)));
    const i = idxByKey.get(key);
    if (i != null) buckets[i].km += r.distanceM / 1000;
  }
  return buckets.map((b) => ({ ...b, km: round1(b.km) }));
}

export function trainingLoad(runs: RunRow[], now: number = Date.now()): TrainingLoad {
  let acute = 0;
  let last28 = 0;
  for (const r of runs) {
    const ageDays = (now - Date.parse(r.startedAt)) / DAY;
    if (ageDays < 0) continue;
    const km = r.distanceM / 1000;
    if (ageDays <= 7) acute += km;
    if (ageDays <= 28) last28 += km;
  }
  const chronic = last28 / 4;
  const ratio = chronic > 0 ? acute / chronic : null;

  let status: TrainingLoad["status"] = "none";
  if (ratio != null) {
    if (ratio < 0.8) status = "detraining";
    else if (ratio <= 1.3) status = "optimal";
    else if (ratio <= 1.5) status = "caution";
    else status = "high";
  }

  return {
    acuteKm: round1(acute),
    chronicKm: round1(chronic),
    ratio: ratio != null ? Math.round(ratio * 100) / 100 : null,
    status,
    weeks: lastNWeeks(runs, 6, now),
  };
}

export const LOAD_STATUS_LABEL: Record<TrainingLoad["status"], string> = {
  none: "Not enough data",
  detraining: "Ramping down",
  optimal: "Optimal",
  caution: "Building fast",
  high: "Spike — injury risk",
};

export const LOAD_STATUS_COLOR: Record<TrainingLoad["status"], string> = {
  none: "#94a3b8",
  detraining: "#0ea5e9",
  optimal: "#10b981",
  caution: "#f59e0b",
  high: "#e11d48",
};
