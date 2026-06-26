import type { RunSummary, Split, SeriesPoint } from "./types";

// Parses Apple Watch "Outdoor Running" CSV exports.
// Format notes:
//  - Fields are separated by ';'
//  - Decimal separator is ',' (European). Note the Time/Timestamp fields also
//    use ',' for the millisecond part, so we parse positionally, not globally.
//  - Each row is roughly one sample per second.

const HEADER_ALIASES: Record<string, string> = {
  "time": "time",
  "timestamp": "timestamp",
  "iso8601": "iso",
  "heart rate (bpm)": "hr",
  "power (watt)": "power",
  "cadence (count/min)": "cadence",
  "latitude (°)": "lat",
  "longitude (°)": "lon",
  "elevation (meter)": "elev",
  "horizontal accuracy (meter)": "hacc",
  "vertical accuracy (meter)": "vacc",
  "distance (meter)": "dist",
  "speed (m/s)": "speed",
  "stride length (mm)": "stride",
  "vo (mm)": "vo",
  "gct (ms)": "gct",
  "lap": "lap",
  "intensity": "intensity",
  "since start (second)": "since",
};

type Row = {
  iso: string;
  hr: number | null;
  power: number | null;
  cadence: number | null;
  elev: number | null;
  dist: number | null;
  speed: number | null;
  stride: number | null;
  vo: number | null;
  gct: number | null;
  intensity: string;
  since: number;
};

function num(raw: string | undefined): number | null {
  if (raw === undefined) return null;
  const s = raw.trim().replace(",", ".");
  if (s === "") return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

function avg(values: (number | null)[]): number | null {
  const v = values.filter((x): x is number => x !== null);
  if (v.length === 0) return null;
  return v.reduce((a, b) => a + b, 0) / v.length;
}

export function parseRunCsv(text: string, refMaxHr = 190): RunSummary {
  const lines = text.split(/\r?\n/).filter((l) => l.trim() !== "");
  if (lines.length < 2) throw new Error("CSV appears to be empty.");

  const headerCells = lines[0].split(";").map((h) => h.trim().toLowerCase());
  const colIndex: Record<string, number> = {};
  headerCells.forEach((h, i) => {
    const key = HEADER_ALIASES[h];
    if (key) colIndex[key] = i;
  });

  if (colIndex.since === undefined || colIndex.dist === undefined) {
    throw new Error(
      "Unrecognized CSV format. Expected an Apple Watch Outdoor Running export with 'Distance (meter)' and 'Since start (second)' columns."
    );
  }

  const at = (cells: string[], key: string) =>
    colIndex[key] !== undefined ? cells[colIndex[key]] : undefined;

  const rows: Row[] = [];
  for (let i = 1; i < lines.length; i++) {
    const cells = lines[i].split(";");
    const since = num(at(cells, "since"));
    if (since === null) continue;
    rows.push({
      iso: (at(cells, "iso") ?? "").trim(),
      hr: num(at(cells, "hr")),
      power: num(at(cells, "power")),
      cadence: num(at(cells, "cadence")),
      elev: num(at(cells, "elev")),
      dist: num(at(cells, "dist")),
      speed: num(at(cells, "speed")),
      stride: num(at(cells, "stride")),
      vo: num(at(cells, "vo")),
      gct: num(at(cells, "gct")),
      intensity: (at(cells, "intensity") ?? "").trim() || "active",
      since,
    });
  }

  if (rows.length === 0) throw new Error("No data rows found in CSV.");

  const startedAt = rows.find((r) => r.iso)?.iso ?? new Date(0).toISOString();
  const durationSec = rows[rows.length - 1].since - rows[0].since;

  // Cumulative distance: take the max seen (handles any non-monotonic noise).
  let distanceM = 0;
  for (const r of rows) if (r.dist !== null && r.dist > distanceM) distanceM = r.dist;

  // Elevation gain/loss with light smoothing to avoid GPS jitter inflation.
  let elevGainM = 0;
  let elevLossM = 0;
  let prevElev: number | null = null;
  for (const r of rows) {
    if (r.elev === null) continue;
    if (prevElev !== null) {
      const d = r.elev - prevElev;
      if (d > 0.5) elevGainM += d;
      else if (d < -0.5) elevLossM += -d;
    }
    prevElev = r.elev;
  }

  // Moving time: seconds where speed indicates running/jogging (> 0.7 m/s).
  let movingSec = 0;
  for (const r of rows) if ((r.speed ?? 0) > 0.7) movingSec += 1;

  const avgSpeed = durationSec > 0 ? distanceM / durationSec : 0;
  const avgPaceSecPerKm =
    distanceM > 0 ? (durationSec / distanceM) * 1000 : 0;
  const avgMovingPaceSecPerKm =
    distanceM > 0 && movingSec > 0 ? (movingSec / distanceM) * 1000 : avgPaceSecPerKm;

  const hrValues = rows.map((r) => r.hr);
  const avgHr = avg(hrValues);
  const maxHr = hrValues.reduce<number | null>(
    (m, v) => (v !== null && (m === null || v > m) ? v : m),
    null
  );
  const cadValues = rows.map((r) => r.cadence);
  const maxCadence = cadValues.reduce<number | null>(
    (m, v) => (v !== null && (m === null || v > m) ? v : m),
    null
  );

  // Splits per kilometer using interpolation across the distance series.
  const splits = computeSplits(rows);

  // Intensity (warmup / active / cooldown / recovery) seconds.
  const intensityBreakdown: Record<string, number> = {};
  for (const r of rows) {
    intensityBreakdown[r.intensity] = (intensityBreakdown[r.intensity] ?? 0) + 1;
  }

  // Heart-rate zones (rough, based on % of an estimated max HR).
  let hrZones: Record<string, number> | null = null;
  if (avgHr) {
    hrZones = { "Z1 <60%": 0, "Z2 60-70%": 0, "Z3 70-80%": 0, "Z4 80-90%": 0, "Z5 >90%": 0 };
    for (const r of rows) {
      if (r.hr === null) continue;
      const pct = r.hr / refMaxHr;
      if (pct < 0.6) hrZones["Z1 <60%"] += 1;
      else if (pct < 0.7) hrZones["Z2 60-70%"] += 1;
      else if (pct < 0.8) hrZones["Z3 70-80%"] += 1;
      else if (pct < 0.9) hrZones["Z4 80-90%"] += 1;
      else hrZones["Z5 >90%"] += 1;
    }
  }

  // Downsample to ~200 points for charts; compute rolling pace from speed.
  const series = downsample(rows, 200);

  return {
    startedAt,
    durationSec,
    movingSec,
    distanceM,
    avgPaceSecPerKm,
    avgMovingPaceSecPerKm,
    avgSpeed,
    avgHr,
    maxHr,
    avgCadence: avg(cadValues),
    maxCadence,
    avgPower: avg(rows.map((r) => r.power)),
    avgStrideMm: avg(rows.map((r) => r.stride)),
    avgVoMm: avg(rows.map((r) => r.vo)),
    avgGctMs: avg(rows.map((r) => r.gct)),
    elevGainM,
    elevLossM,
    splits,
    intensityBreakdown,
    hrZones,
    sampleCount: rows.length,
    series,
  };
}

function computeSplits(rows: Row[]): Split[] {
  const splits: Split[] = [];
  // Build a clean (time, distance) list.
  const pts = rows
    .filter((r) => r.dist !== null)
    .map((r) => ({ t: r.since, d: r.dist as number, hr: r.hr, elev: r.elev }));
  if (pts.length < 2) return splits;

  const totalDist = pts[pts.length - 1].d;
  let boundary = 1000;
  let prevBoundaryTime = pts[0].t;
  let segHr: number[] = [];
  let segElevGain = 0;
  let prevElev: number | null = pts[0].elev;

  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1];
    const b = pts[i];
    if (b.hr !== null) segHr.push(b.hr);
    if (prevElev !== null && b.elev !== null) {
      const de = b.elev - prevElev;
      if (de > 0.5) segElevGain += de;
    }
    if (b.elev !== null) prevElev = b.elev;

    while (b.d >= boundary && b.d > a.d) {
      // Interpolate the time at which we crossed the km boundary.
      const frac = (boundary - a.d) / (b.d - a.d);
      const tCross = a.t + frac * (b.t - a.t);
      const durationSec = tCross - prevBoundaryTime;
      splits.push({
        km: boundary / 1000,
        distanceM: 1000,
        durationSec,
        paceSecPerKm: durationSec, // 1 km segment => pace == duration
        avgHr: segHr.length ? Math.round(segHr.reduce((x, y) => x + y, 0) / segHr.length) : null,
        elevGainM: Math.round(segElevGain),
      });
      prevBoundaryTime = tCross;
      segHr = [];
      segElevGain = 0;
      boundary += 1000;
    }
  }

  // Trailing partial kilometer.
  const last = pts[pts.length - 1];
  const lastDist = totalDist - (boundary - 1000);
  if (lastDist > 50) {
    const durationSec = last.t - prevBoundaryTime;
    splits.push({
      km: splits.length + 1,
      distanceM: Math.round(lastDist),
      durationSec,
      paceSecPerKm: lastDist > 0 ? (durationSec / lastDist) * 1000 : 0,
      avgHr: segHr.length ? Math.round(segHr.reduce((x, y) => x + y, 0) / segHr.length) : null,
      elevGainM: Math.round(segElevGain),
    });
  }

  return splits;
}

function downsample(rows: Row[], target: number): SeriesPoint[] {
  const step = Math.max(1, Math.floor(rows.length / target));
  const out: SeriesPoint[] = [];
  for (let i = 0; i < rows.length; i += step) {
    const r = rows[i];
    const speed = r.speed;
    out.push({
      t: Math.round(r.since),
      distM: r.dist ?? 0,
      paceSecPerKm: speed && speed > 0.3 ? 1000 / speed : null,
      hr: r.hr,
      elevM: r.elev,
      cadence: r.cadence,
      speed: r.speed,
    });
  }
  return out;
}

// --- formatting helpers shared by UI ---

export function formatPace(secPerKm: number | null | undefined): string {
  if (!secPerKm || !Number.isFinite(secPerKm) || secPerKm <= 0) return "—";
  const m = Math.floor(secPerKm / 60);
  const s = Math.round(secPerKm % 60);
  return `${m}:${s.toString().padStart(2, "0")}/km`;
}

export function formatDuration(sec: number | null | undefined): string {
  if (!sec || !Number.isFinite(sec) || sec < 0) return "—";
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = Math.round(sec % 60);
  if (h > 0) return `${h}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export function formatDistance(m: number | null | undefined): string {
  if (!m || !Number.isFinite(m)) return "—";
  return `${(m / 1000).toFixed(2)} km`;
}
