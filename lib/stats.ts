import type { RunRow, Goal } from "./types";
import { runningRecords } from "./prs";

export type DashboardStats = {
  totalRuns: number;
  totalKm: number;
  last7Km: number;
  last7Runs: number;
  avgPaceRecent: number | null; // avg pace over last 5 runs
  longestRunM: number;
  bestPace: number | null;
  // Rolling form: per-run averages over the last 5 vs the last 20 runs.
  form: {
    pace5: number | null;
    pace20: number | null;
    km5: number | null;
    km20: number | null;
  };
  trend: { date: string; km: number; paceSecPerKm: number; avgHr: number | null }[];
};

export function computeStats(runs: RunRow[]): DashboardStats {
  const now = Date.now();
  const weekAgo = now - 7 * 24 * 3600 * 1000;

  let totalKm = 0;
  let last7Km = 0;
  let last7Runs = 0;
  let longestRunM = 0;
  let bestPace: number | null = null;

  for (const r of runs) {
    totalKm += r.distanceM / 1000;
    const t = new Date(r.startedAt).getTime();
    if (t >= weekAgo) {
      last7Km += r.distanceM / 1000;
      last7Runs += 1;
    }
    if (r.distanceM > longestRunM) longestRunM = r.distanceM;
    // Only count "real" pace from runs of at least 1 km.
    if (r.distanceM >= 1000 && (bestPace === null || r.avgPaceSecPerKm < bestPace)) {
      bestPace = r.avgPaceSecPerKm;
    }
  }

  const avg = (xs: number[]) =>
    xs.length > 0 ? xs.reduce((a, b) => a + b, 0) / xs.length : null;
  const last5 = runs.slice(0, 5);
  const last20 = runs.slice(0, 20);
  const form = {
    pace5: avg(last5.map((r) => r.avgPaceSecPerKm)),
    pace20: avg(last20.map((r) => r.avgPaceSecPerKm)),
    km5: avg(last5.map((r) => r.distanceM / 1000)),
    km20: avg(last20.map((r) => r.distanceM / 1000)),
  };
  const avgPaceRecent = form.pace5;

  // Oldest -> newest for charting.
  const trend = [...runs]
    .reverse()
    .map((r) => ({
      date: r.startedAt.slice(0, 10),
      km: +(r.distanceM / 1000).toFixed(2),
      paceSecPerKm: Math.round(r.avgPaceSecPerKm),
      avgHr: r.avgHr ? Math.round(r.avgHr) : null,
    }));

  return {
    totalRuns: runs.length,
    totalKm: +totalKm.toFixed(1),
    last7Km: +last7Km.toFixed(1),
    last7Runs,
    avgPaceRecent,
    longestRunM,
    bestPace,
    form,
    trend,
  };
}

export function daysUntil(dateStr: string | null): number | null {
  if (!dateStr) return null;
  const target = new Date(dateStr + "T00:00:00").getTime();
  const today = new Date(new Date().toISOString().slice(0, 10) + "T00:00:00").getTime();
  return Math.round((target - today) / (24 * 3600 * 1000));
}

// Estimate the equivalent finish time for the goal distance from the best
// recent effort, using Riegel's formula T2 = T1 * (D2/D1)^1.06. Best efforts
// (fastest km stretches), not whole runs, so easy and long runs don't count as
// race fitness.
export function projectGoalTime(runs: RunRow[], goal: Goal | null): number | null {
  const target = goal?.targetDistanceM;
  if (!target) return null;
  const since = Date.now() - 42 * 24 * 3600 * 1000;
  const recent = runs.filter((r) => new Date(r.startedAt).getTime() >= since);
  // ponytail: 5K+ efforts only — Riegel from a 1K split overpredicts long races.
  const times = runningRecords(recent)
    .efforts.filter((e) => e.meters >= 5000)
    .map((e) => e.timeSec * Math.pow(target / e.meters, 1.06));
  return times.length ? Math.min(...times) : null;
}
