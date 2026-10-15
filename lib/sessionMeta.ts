import type { GymType, SeriesPoint, Sport } from "./types";
import { gymTypeLabel } from "./gym";

// Client-safe colour + label helpers shared by the history list and the calendar.
// Each sport and each gym type gets its own colour.

export const RUN_COLOR = "#2563eb"; // electric blue
export const RACE_COLOR = "#7c3aed"; // violet — a race is not another training run

export const SPORT_LABEL: Record<Sport, string> = {
  running: "Run",
  walking: "Walk",
  cycling: "Bike",
  swimming: "Swim",
  rowing: "Rowing",
};

export const SPORT_COLOR: Record<Sport, string> = {
  running: RUN_COLOR,
  walking: "#84cc16", // lime
  cycling: "#f97316", // orange
  swimming: "#06b6d4", // cyan
  rowing: "#6366f1", // indigo
};

// Map a raw FIT/TCX sport tag ("walking", "Outdoor Walking", "cycling", ...)
// onto our Sport. Anything unrecognised — including no tag at all — is a run.
export function sportFromTag(tag: string | null | undefined): Sport {
  const s = (tag ?? "").toLowerCase();
  if (s.includes("walk") || s.includes("hik")) return "walking";
  if (s.includes("cycl") || s.includes("bik")) return "cycling";
  if (s.includes("swim")) return "swimming";
  if (s.includes("row")) return "rowing";
  return "running";
}

export const GYM_TYPE_COLOR: Record<GymType, string> = {
  push: "#e11d48", // rose
  pull: "#0ea5e9", // sky
  legs: "#d97706", // amber
  upper: "#8b5cf6", // violet
  lower: "#f59e0b", // orange
  full_body: "#10b981", // emerald
  core: "#ec4899", // pink
  cardio: "#14b8a6", // teal
  other: "#94a3b8", // slate
};

export function sessionColor(
  kind: "run" | "gym",
  type?: string | null,
  isRace = false
): string {
  if (kind === "run") return isRace ? RACE_COLOR : SPORT_COLOR[type as Sport] ?? RUN_COLOR;
  return GYM_TYPE_COLOR[type as GymType] ?? GYM_TYPE_COLOR.other;
}

export function sessionTypeLabel(
  kind: "run" | "gym",
  type?: string | null,
  isRace = false
): string {
  if (kind === "run") return isRace ? "Race" : SPORT_LABEL[type as Sport] ?? "Run";
  return gymTypeLabel(type ?? "other");
}

// Races group and filter on their own, so one race in the list can't repaint
// the "Run" chip violet (the chip list takes its colour from the first match).
export function sessionFilterKey(s: Pick<SessionLite, "kind" | "type" | "isRace">): string {
  if (s.kind !== "run") return s.type;
  return s.isRace ? "race" : s.type;
}

// Flat, serialisable shape passed from the server page into client components.
export type SessionLite = {
  id: number;
  kind: "run" | "gym";
  type: string; // the Sport for runs, the GymType for gym sessions
  typeLabel: string;
  color: string;
  name: string;
  startedAt: string; // ISO
  href: string; // detail page
  meta: string; // secondary line, e.g. "5.0 km · 24:30 · 4:54 /km"
  // Runs only — the run a goal was raced on. Shown in violet with a medal.
  isRace?: boolean;
  distanceM?: number; // runs only — for distance filtering
  paceSecPerKm?: number; // runs only — for pace filtering
};

// Local-time YYYY-MM-DD key for grouping sessions by day.
export function dayKey(iso: string): string {
  const d = new Date(iso);
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}

export type LatLng = [number, number];

// The GPS points of a run's series, for maps. Empty when it was stored without GPS.
export function trackOf(series: SeriesPoint[]): LatLng[] {
  return series.filter((p) => p.lat != null && p.lng != null).map((p) => [p.lat!, p.lng!]);
}

// The runs that start near where most runs start (within ~25 km): the start
// with the most neighbours is "home". Trips to other cities fall away however
// many there are, so the heat map frames where you usually run.
// ponytail: O(n²) over starts; fine for thousands of runs.
export function homeTracks(tracks: LatLng[][], radiusDeg = 0.25): LatLng[][] {
  const near = (a: LatLng, b: LatLng) =>
    Math.abs(a[0] - b[0]) < radiusDeg && Math.abs(a[1] - b[1]) < radiusDeg;
  let home = tracks[0]?.[0];
  let best = -1;
  for (const t of tracks) {
    const n = tracks.filter((u) => near(t[0], u[0])).length;
    if (n > best) [best, home] = [n, t[0]];
  }
  return tracks.filter((t) => near(t[0], home));
}

// Southwest/northeast corners holding the middle `keep` share of all points,
// so one long outlier doesn't zoom the map out. keep=1 is the plain bounding box.
export function coreBounds(tracks: LatLng[][], keep = 1): [LatLng, LatLng] {
  const pts = tracks.flat();
  const lats = pts.map((p) => p[0]).sort((a, b) => a - b);
  const lngs = pts.map((p) => p[1]).sort((a, b) => a - b);
  const lo = Math.floor(((1 - keep) / 2) * (pts.length - 1));
  const hi = pts.length - 1 - lo;
  return [
    [lats[lo], lngs[lo]],
    [lats[hi], lngs[hi]],
  ];
}
