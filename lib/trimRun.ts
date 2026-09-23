import type { RunSummary, RunTrim, SeriesPoint } from "./types";
import { computeSplits, type Row } from "./parseRun";

// Trims GPS overshoot off a race: a 5K recorded as 5.06 km because the watch
// started in the crowd before the start line. Raw samples aren't stored, so
// this works off the downsampled series (~every 7 s), interpolating the time
// at each cut point.
//
// Only distance/time-derived fields are recomputed. HR, cadence, power and
// form averages keep the original full-resolution values — the cut is a few
// dozen meters, and re-averaging the sparse series would move them more than
// the trim does. startedAt is kept too: the Drive/Garmin importers dedupe on it.
// ponytail: laps are dropped on a trimmed run; the untrimmed copy keeps them.

type Pt = Pick<SeriesPoint, "t" | "distM">;

// Series plus a closing point at the run's true end (downsampling can stop a
// few samples short of it), so the end cut interpolates to the real finish.
function timeline(s: RunSummary): Pt[] {
  const pts: Pt[] = s.series.map((p) => ({ t: p.t, distM: p.distM }));
  const t0 = pts[0]?.t ?? 0;
  const last = pts[pts.length - 1];
  if (!last || last.distM < s.distanceM) pts.push({ t: t0 + s.durationSec, distM: s.distanceM });
  return pts;
}

// Time at a cumulative distance, linearly interpolated.
function timeAt(pts: Pt[], d: number): number {
  if (d <= pts[0].distM) return pts[0].t;
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1];
    const b = pts[i];
    if (b.distM >= d && b.distM > a.distM) {
      return a.t + ((d - a.distM) / (b.distM - a.distM)) * (b.t - a.t);
    }
  }
  return pts[pts.length - 1].t;
}

// Seconds spent covering [fromM, toM] of the original run.
export function segmentSec(s: RunSummary, fromM: number, toM: number): number {
  const pts = timeline(s);
  return timeAt(pts, toM) - timeAt(pts, fromM);
}

export function trimError(s: RunSummary, cut: RunTrim): string | null {
  if (s.series.length < 2) return "This run has no distance data to trim.";
  if (!(cut.startM >= 0 && cut.endM >= 0)) return "Trim amounts must be zero or more.";
  if (s.distanceM - cut.startM - cut.endM < 100) return "That would leave less than 100 m.";
  return null;
}

// `s` must be the untrimmed summary.
export function trimSummary(s: RunSummary, cut: RunTrim): RunSummary {
  const pts = timeline(s);
  const fromM = cut.startM;
  const toM = s.distanceM - cut.endM;
  const tFrom = timeAt(pts, fromM);
  const tTo = timeAt(pts, toM);
  const durationSec = tTo - tFrom;
  const distanceM = toM - fromM;

  const series: SeriesPoint[] = s.series
    .filter((p) => p.distM >= fromM && p.distM <= toM)
    .map((p) => ({ ...p, t: Math.round(p.t - tFrom), distM: p.distM - fromM }));

  // Splits from the series, with exact start/end points so the kms line up.
  const toRow = (p: Pick<SeriesPoint, "t" | "distM" | "hr" | "elevM" | "cadence">): Row => ({
    iso: "", hr: p.hr, power: null, cadence: p.cadence, elev: p.elevM, dist: p.distM,
    speed: null, stride: null, vo: null, gct: null, lap: null, intensity: "", since: p.t,
  });
  const edge = { hr: null, elevM: null, cadence: null };
  const rows = [
    toRow({ ...edge, t: 0, distM: 0 }),
    ...series.map(toRow),
    toRow({ ...edge, t: durationSec, distM: distanceM }),
  ];

  const movingSec = Math.max(0, s.movingSec - (s.durationSec - durationSec));
  const avgPaceSecPerKm = (durationSec / distanceM) * 1000;
  return {
    ...s,
    durationSec,
    distanceM,
    movingSec,
    avgPaceSecPerKm,
    avgMovingPaceSecPerKm: movingSec > 0 ? (movingSec / distanceM) * 1000 : avgPaceSecPerKm,
    avgSpeed: distanceM / durationSec,
    splits: computeSplits(rows),
    laps: [],
    series,
    trim: cut,
    untrimmed: s,
  };
}
