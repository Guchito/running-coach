import { homeTracks, trackOf, type LatLng } from "./sessionMeta";
import type { RunRow } from "./types";

// Route suggestions for a planned distance: reuse a past run near home when
// one is about the right length, otherwise score generated loops by how much
// of them runs along streets already run.

// ponytail: square cells in degrees (~55 m north-south, narrower east-west away
// from the equator). Good enough for "same street"; switch to metres if not.
const CELL = 0.0005;

// The grid cells a track passes through. Segments are walked in half-cell
// steps so sparse tracks (a router only emits points at bends) leave no gaps.
function cellsOf(track: LatLng[]): Set<string> {
  const out = new Set<string>();
  const add = (lat: number, lng: number) =>
    out.add(`${Math.round(lat / CELL)},${Math.round(lng / CELL)}`);
  track.forEach(([lat, lng], i) => {
    add(lat, lng);
    const next = track[i + 1];
    if (!next) return;
    const steps = Math.ceil(Math.max(Math.abs(next[0] - lat), Math.abs(next[1] - lng)) / (CELL / 2));
    for (let s = 1; s < steps; s++) {
      add(lat + ((next[0] - lat) * s) / steps, lng + ((next[1] - lng) * s) / steps);
    }
  });
  return out;
}

// How many runs pass through each cell.
export function cellCounts(tracks: LatLng[][]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const t of tracks) for (const c of cellsOf(t)) counts.set(c, (counts.get(c) ?? 0) + 1);
  return counts;
}

// Mean number of runs through the cells of a track: higher = more familiar streets.
export function familiarity(track: LatLng[], counts: Map<string, number>): number {
  const cs = [...cellsOf(track)];
  return cs.length ? cs.reduce((sum, c) => sum + (counts.get(c) ?? 0), 0) / cs.length : 0;
}

const median = (xs: number[]) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)];

// Where runs near home usually start.
export function homeStart(tracks: LatLng[][]): LatLng | null {
  const starts = homeTracks(tracks).map((t) => t[0]);
  return starts.length ? [median(starts.map((s) => s[0])), median(starts.map((s) => s[1]))] : null;
}

// The past run near home closest to "the usual streets" among those within
// max(300 m, 5%) of the target distance. `runs` is newest first, so ties go
// to the most recent. Null when nothing is close enough. With a `home` set by
// the runner, only runs starting within ~500 m of it count; otherwise any run
// from the area where most runs start.
export function pickPastRun(
  runs: RunRow[],
  targetM: number,
  home?: LatLng | null
): { run: RunRow; track: LatLng[] } | null {
  const withTrack = runs
    .map((run) => ({ run, track: trackOf(run.summary.series) }))
    .filter((r) => r.track.length > 1);
  const tracks = withTrack.map((r) => r.track);
  const usual = new Set(homeTracks(tracks));
  const fromHome = (t: LatLng[]) =>
    home
      ? Math.abs(t[0][0] - home[0]) < 0.005 && Math.abs(t[0][1] - home[1]) < 0.005
      : usual.has(t);
  const counts = cellCounts(tracks);
  const tol = Math.max(300, targetM * 0.05);

  let best: { run: RunRow; track: LatLng[] } | null = null;
  let bestScore = -1;
  for (const r of withTrack) {
    if (!fromHome(r.track) || Math.abs(r.run.distanceM - targetM) > tol) continue;
    const score = familiarity(r.track, counts);
    if (score > bestScore) [best, bestScore] = [r, score];
  }
  return best;
}

// The generated candidate that follows the most-run streets.
export function bestCandidate<T extends { track: LatLng[] }>(
  candidates: T[],
  counts: Map<string, number>
): T | null {
  let best: T | null = null;
  let bestScore = -1;
  for (const c of candidates) {
    const score = familiarity(c.track, counts);
    if (score > bestScore) [best, bestScore] = [c, score];
  }
  return best;
}

// A GPX track file, for apps that import routes (Apple Maps does not).
export function toGpx(track: LatLng[], name: string): string {
  const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const pts = track.map(([lat, lng]) => `<trkpt lat="${lat}" lon="${lng}"/>`).join("");
  return `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="running-coach" xmlns="http://www.topografix.com/GPX/1/1"><trk><name>${esc(name)}</name><trkseg>${pts}</trkseg></trk></gpx>`;
}
