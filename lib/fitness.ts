import type { GymSession, HrZone, RunRow, SeriesPoint, Split } from "./types";
import { isoDate } from "./trainingLoad";

// Strava-premium-style training metrics, all derived from data we already
// store: Relative Effort (HR load per session), Fitness & Freshness
// (long/short-term load and form), and Grade Adjusted Pace.

const DAY = 86400000;

// Relative Effort, fitted to Strava's scores for the same sessions and zones:
// each minute counts C·e^(B·(bpm − Z5 floor)), so load climbs exponentially
// with HR. Null without HR data.
// The watch logs HR only every few seconds, leaving many 1 s rows blank, so
// the histogram can cover as little as half the session. When `durationSec` is
// given, missing seconds count like the rest of the session (Strava fills the
// gaps too) — otherwise long runs score far too low.
// ponytail: fit on 9 sessions (5 runs incl. a half marathon, 4 lifts; RMS
// error ~19%, mostly one long run). Refit RE_B/RE_C as more Strava pairs come in.
const RE_B = 0.044;
const RE_C = 3.62;
export function relativeEffort(
  hrHistogram: Record<string, number> | undefined,
  zones: HrZone[],
  durationSec?: number,
): number | null {
  if (!hrHistogram || Object.keys(hrHistogram).length === 0) return null;
  const ref = zones[zones.length - 1].min;
  let load = 0;
  let covered = 0;
  for (const [bpm, sec] of Object.entries(hrHistogram)) {
    load += (sec / 60) * Math.exp(RE_B * (Number(bpm) - ref));
    covered += sec;
  }
  const fill = durationSec && covered > 0 && covered < durationSec ? durationSec / covered : 1;
  return Math.round(RE_C * load * fill);
}

// Any session with a Relative Effort score: runs/rides/walks and gym.
export type EffortSession = {
  id: number;
  kind: "run" | "gym";
  type: string; // Sport for runs, GymType for gym
  name: string;
  startedAt: string;
  durationSec: number;
  effort: number;
  href: string;
};

export function effortSessions(runs: RunRow[], gym: GymSession[], zones: HrZone[]): EffortSession[] {
  const out: EffortSession[] = [];
  for (const r of runs) {
    const effort = relativeEffort(r.summary?.hrHistogram, zones, r.durationSec);
    if (effort == null) continue;
    const { id, name, startedAt, durationSec } = r;
    out.push({ id, kind: "run", type: r.sport, name, startedAt, durationSec, effort, href: `/runs/${id}` });
  }
  for (const g of gym) {
    // ponytail: gym only stores avg HR, so the whole session counts at that HR.
    if (!g.avgHr || !g.durationSec) continue;
    const effort = relativeEffort({ [Math.round(g.avgHr)]: g.durationSec }, zones)!;
    const { id, name, startedAt, durationSec } = g;
    out.push({ id, kind: "gym", type: g.type, name, startedAt, durationSec, effort, href: `/gym/${id}` });
  }
  return out.sort((x, y) => Date.parse(x.startedAt) - Date.parse(y.startedAt));
}

export type FitnessDay = {
  date: string;
  fitness: number;
  fatigue: number;
  form: number;
  effort: number; // total Relative Effort that day
  sessionHref: string | null; // the day's hardest session, for the tooltip link
  sessionName: string | null;
};

// Fitness = 42-day exponentially weighted daily load, Fatigue = 7-day, Form =
// Fitness − Fatigue (the classic CTL/ATL/TSB model). Seeded from the first
// session so the returned window isn't artificially low. Returns the last
// `days` days, oldest → newest.
export function fitnessFreshness(sessions: EffortSession[], days = 90, now: number = Date.now()): FitnessDay[] {
  const load = new Map<string, number>();
  const top = new Map<string, EffortSession>();
  let first = now;
  for (const s of sessions) {
    const t = Date.parse(s.startedAt);
    const key = isoDate(new Date(t));
    load.set(key, (load.get(key) ?? 0) + s.effort);
    if (s.effort > (top.get(key)?.effort ?? -1)) top.set(key, s);
    if (t < first) first = t;
  }
  if (load.size === 0) return [];

  const out: FitnessDay[] = [];
  let ctl = 0;
  let atl = 0;
  const d = new Date(first);
  d.setHours(12, 0, 0, 0); // noon so DST shifts never skip/repeat a day
  const end = new Date(now);
  end.setHours(12, 0, 0, 0);
  for (; d <= end; d.setTime(d.getTime() + DAY)) {
    const key = isoDate(d);
    const effort = load.get(key) ?? 0;
    ctl += (effort - ctl) / 42;
    atl += (effort - atl) / 7;
    const t = top.get(key);
    out.push({
      date: key,
      fitness: Math.round(ctl),
      fatigue: Math.round(atl),
      form: Math.round(ctl - atl),
      effort,
      sessionHref: t?.href ?? null,
      sessionName: t?.name ?? null,
    });
  }
  return out.slice(-days);
}

// ---- Weekly Effort ----

export type WeekEffort = {
  weekStart: string; // Monday, YYYY-MM-DD
  weekEnd: string; // Sunday
  total: number;
  days: number[]; // Mon..Sun
  sessions: EffortSession[]; // oldest first
  low: number | null; // recommended range, from the 3 weeks before
  high: number | null;
  status: "none" | "progress" | "recovery" | "steady" | "above" | "wayAbove";
};

// `weeks` weeks up to the current one (or up to the selected week, if that's
// older), oldest first; `selected` indexes the week containing `at`.
export type WeeklyEffort = { weeks: WeekEffort[]; selected: number };

const BAND = 0.35;
// More than 20% past the top of the range is "way above" rather than "above".
const WAY_ABOVE = 1.2;

function monday(t: number): Date {
  const d = new Date(t);
  d.setHours(12, 0, 0, 0);
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return d;
}

// Weekly Relative Effort around the week containing `at`, with Strava-style
// "recommended range": ±35% around the average of the previous 3 weeks
// (measured off Strava's chart for the same weeks).
// ponytail: fixed band read off two Strava screenshots; Strava doesn't publish it.
export function weeklyEffort(
  sessions: EffortSession[],
  at: number = Date.now(),
  weeks = 12,
  now: number = Date.now(),
): WeeklyEffort {
  const byWeek = new Map<string, EffortSession[]>();
  for (const s of sessions) {
    const key = isoDate(monday(Date.parse(s.startedAt)));
    byWeek.set(key, [...(byWeek.get(key) ?? []), s]);
  }
  const total = (key: string) => (byWeek.get(key) ?? []).reduce((a, s) => a + s.effort, 0);
  const thisWeek = monday(now);
  const end = Math.max(thisWeek.getTime(), monday(at).getTime());
  // Noon-anchored Mondays, so ±7 days never crosses a date line on DST.
  const mondayBack = (w: number) => monday(end - w * 7 * DAY);

  const out: WeekEffort[] = [];
  for (let w = weeks - 1; w >= 0; w--) {
    const start = mondayBack(w);
    const key = isoDate(start);
    const prev = [1, 2, 3].map((i) => total(isoDate(mondayBack(w + i))));
    const avg = prev.reduce((a, b) => a + b, 0) / 3;
    const low = avg > 0 ? Math.round(avg * (1 - BAND)) : null;
    const high = avg > 0 ? Math.round(avg * (1 + BAND)) : null;
    const inWeek = byWeek.get(key) ?? [];
    const days = [0, 0, 0, 0, 0, 0, 0];
    for (const s of inWeek) days[(new Date(s.startedAt).getDay() + 6) % 7] += s.effort;
    const t = total(key);
    const status: WeekEffort["status"] =
      low == null
        ? "none"
        : t > high! * WAY_ABOVE
          ? "wayAbove"
          : t > high!
            ? "above"
            : t >= low
            ? "steady"
            : key === isoDate(thisWeek) // an unfinished week isn't a recovery week yet
              ? "progress"
              : "recovery";
    out.push({
      weekStart: key,
      weekEnd: isoDate(new Date(start.getTime() + 6 * DAY)),
      total: t,
      days,
      sessions: inWeek,
      low,
      high,
      status,
    });
  }
  const selectedKey = isoDate(monday(at));
  return { weeks: out, selected: out.findIndex((w) => w.weekStart === selectedKey) };
}

// Color follows the range: red above it (darker when way above), green inside,
// blue below (or not there yet).
export const WEEK_STATUS: Record<WeekEffort["status"], { label: string; body: string; color: string }> = {
  none: { label: "Getting started", body: "Log a few weeks of training to see your recommended range.", color: "#2563eb" },
  progress: { label: "Week in progress", body: "Still building toward your recommended range.", color: "#2563eb" },
  recovery: { label: "Recovery week", body: "Below your recent range: good for absorbing training, or a sign of a dip.", color: "#2563eb" },
  steady: { label: "Steady progress", body: "A good level for building or maintaining fitness.", color: "#059669" },
  above: { label: "Above", body: "A bit above your recent range: a solid build. Keep an eye on recovery.", color: "#e11d48" },
  wayAbove: { label: "Way above", body: "Far above your recent range. Make sure to recover.", color: "#9f1239" },
};

// ---- Per-session Relative Effort verdict ----

export type EffortVerdict = {
  label: string;
  color: string;
  message: string;
  band: "higher" | "average" | "lower" | null; // vs your 3-week average; null without history
};

// Compares one session to the average effort of the same kind of session over
// the previous 3 weeks (Strava's "Your 3-week average").
export function effortVerdict(effort: number, sessions: EffortSession[], self: EffortSession): EffortVerdict {
  const t = Date.parse(self.startedAt);
  const past = sessions
    .filter((s) => s.kind === self.kind && s.type === self.type && s.id !== self.id)
    .filter((s) => {
      const age = t - Date.parse(s.startedAt);
      return age > 0 && age < 21 * DAY;
    })
    .map((s) => s.effort);
  const usual = past.length ? past.reduce((a, b) => a + b, 0) / past.length : null;
  const ratio = usual ? effort / usual : 1;
  const [label, color] =
    ratio < 0.6 ? ["Easy", "#10b981"] : ratio < 1 ? ["Moderate", "#0ea5e9"] : ratio < 1.6 ? ["Tough", "#e11d48"] : ["Max effort", "#9f1239"];
  const band = usual == null ? null : ratio > 1.15 ? "higher" : ratio < 0.85 ? "lower" : "average";
  const message =
    band == null
      ? "Not enough recent sessions to compare yet."
      : band === "higher"
        ? "Nicely done. This was a stronger effort than usual."
        : band === "lower"
          ? "A lighter effort than usual — good for recovery."
          : "Right around your usual effort.";
  return { label, color, message, band };
}

// Fitness on the session's day vs the day before, plus the 4 weeks leading up
// to it for a sparkline.
export type FitnessChange = { delta: number; fitness: number; trend: number[] };
export function fitnessChange(sessions: EffortSession[], at: number): FitnessChange | null {
  const days = fitnessFreshness(sessions, 29, at);
  if (days.length < 2) return null;
  const today = days[days.length - 1];
  return { delta: today.fitness - days[days.length - 2].fitness, fitness: today.fitness, trend: days.map((d) => d.fitness) };
}

// Energy cost of running on a grade relative to flat. Quadratic fit to
// Strava's published GAP curve: uphill costs more, gentle downhill less, steep
// downhill more again (braking).
// ponytail: curve fit, not Strava's exact model; swap in a lookup table if numbers drift.
export function gradeCostFactor(grade: number): number {
  const g = Math.max(-0.3, Math.min(0.3, grade));
  return 15.14 * g * g + 2.896 * g + 1;
}

// Grade Adjusted Pace (sec/km) over [fromM, toM) of a run's series: time over
// the "flat-equivalent" distance. Null without elevation data.
function gapBetween(series: SeriesPoint[], fromM: number, toM: number): number | null {
  let time = 0;
  let flat = 0;
  for (let i = 1; i < series.length; i++) {
    const a = series[i - 1];
    const b = series[i];
    if (b.distM <= fromM || a.distM >= toM) continue;
    const dist = b.distM - a.distM;
    if (dist <= 0 || a.elevM == null || b.elevM == null) continue;
    time += b.t - a.t;
    flat += dist * gradeCostFactor((b.elevM - a.elevM) / dist);
  }
  return flat > 0 && time > 0 ? time / (flat / 1000) : null;
}

export function runGap(series: SeriesPoint[]): number | null {
  return gapBetween(series, 0, Infinity);
}

// GAP for each km split, aligned with `splits`.
export function splitGaps(series: SeriesPoint[], splits: Split[]): (number | null)[] {
  let start = 0;
  return splits.map((sp) => {
    const gap = gapBetween(series, start, start + sp.distanceM);
    start += sp.distanceM;
    return gap;
  });
}
