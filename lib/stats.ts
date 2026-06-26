import type { RunRow, Goal } from "./types";

export type DashboardStats = {
  totalRuns: number;
  totalKm: number;
  last7Km: number;
  last7Runs: number;
  avgPaceRecent: number | null; // avg pace over last 5 runs
  longestRunM: number;
  bestPace: number | null;
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

  const recent = runs.slice(0, 5);
  const avgPaceRecent =
    recent.length > 0
      ? recent.reduce((a, r) => a + r.avgPaceSecPerKm, 0) / recent.length
      : null;

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
    trend,
  };
}

export function daysUntil(dateStr: string | null): number | null {
  if (!dateStr) return null;
  const target = new Date(dateStr + "T00:00:00").getTime();
  const today = new Date(new Date().toISOString().slice(0, 10) + "T00:00:00").getTime();
  return Math.round((target - today) / (24 * 3600 * 1000));
}

// Estimate the equivalent finish time for the goal distance from a recent run,
// using Riegel's formula T2 = T1 * (D2/D1)^1.06.
export function projectGoalTime(runs: RunRow[], goal: Goal | null): number | null {
  if (!goal?.targetDistanceM) return null;
  // Use the longest of the last 5 runs as the basis.
  const basis = runs.slice(0, 5).sort((a, b) => b.distanceM - a.distanceM)[0];
  if (!basis || basis.distanceM < 1000) return null;
  return basis.durationSec * Math.pow(goal.targetDistanceM / basis.distanceM, 1.06);
}
