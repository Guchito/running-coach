import type { RunSummary, Split, LapSplit, SeriesPoint } from "./types";

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

// One time-sample of a run. Both the CSV and FIT parsers produce these, then
// hand them to summarizeRows() for all the metric computation.
export type Row = {
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
  lap: number | null;
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

export function parseRunCsv(text: string): RunSummary {
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
      lap: num(at(cells, "lap")),
      intensity: (at(cells, "intensity") ?? "").trim(),
      since,
    });
  }

  return summarizeRows(rows);
}

// Apple Watch (and some optical/foot-pod sources) intermittently lose step
// detection mid-run: cadence collapses for a few seconds to ~120-140 spm while
// speed holds steady. That's physically impossible — the same speed at a far
// lower cadence would require an abrupt stride-length jump — so these are sensor
// dropouts, not real form changes. Left in, they drag down the average and
// per-km cadence and spike the chart. We repair them with a Hampel-style despike:
// replace each dropout with the local "true" cadence so the series stays
// continuous and every metric reads the corrected value.
//
// A sample is a dropout when, while CLEARLY RUNNING, its cadence falls well
// below the local baseline but its speed does NOT — a genuine slowdown (easy
// stretch, recovery jog, walk break) lowers both together, so those are
// preserved (this is what keeps interval workouts intact). Two robustness
// choices matter:
//   - The baseline is an UPPER percentile of the window, not the median: these
//     dropouts cluster (up to ~12 s at a time), so a plain median gets dragged
//     down and stops flagging them. The 65th percentile tracks the real cadence.
//   - It's all ratio-based, so it's correct whether cadence is stored per-leg or
//     as full steps/min.
function despikeCadence(rows: Row[]): void {
  const n = rows.length;
  const HALF = 30; // ±30 samples (~±30 s at 1 Hz) for the local baseline
  const PCTL = 0.65; // baseline = 65th-percentile cadence in the window (outlier-resistant)
  const MOVING = 1.8; // m/s — running, not walking (keeps deliberate walk breaks)
  const CAD_FRAC = 0.92; // cadence under 92% of the local baseline ...
  const SPD_FRAC = 0.85; // ... while speed stays at/above 85% of its local median

  const percentile = (xs: number[], p: number): number | null => {
    if (xs.length === 0) return null;
    const a = xs.slice().sort((x, y) => x - y);
    return a[Math.min(a.length - 1, Math.floor(a.length * p))];
  };
  const windowPct = (pick: (r: Row) => number | null, i: number, p: number): number | null => {
    const out: number[] = [];
    for (let j = Math.max(0, i - HALF); j <= Math.min(n - 1, i + HALF); j++) {
      const v = pick(rows[j]);
      if (v !== null) out.push(v);
    }
    return percentile(out, p);
  };

  // Flag against the RAW series first, then repair — so the baselines aren't
  // eroded by samples already corrected earlier in the same pass.
  const fixes: { i: number; value: number }[] = [];
  for (let i = 0; i < n; i++) {
    const r = rows[i];
    if (r.cadence === null || (r.speed ?? 0) <= MOVING) continue;
    const cb = windowPct((x) => x.cadence, i, PCTL);
    const sb = windowPct((x) => x.speed, i, 0.5);
    if (cb === null || sb === null) continue;
    if (r.cadence < cb * CAD_FRAC && (r.speed as number) >= sb * SPD_FRAC) {
      fixes.push({ i, value: Math.round(cb) });
    }
  }
  for (const { i, value } of fixes) rows[i].cadence = value;
}

// Compute all run metrics from a list of time-samples (format-agnostic).
export function summarizeRows(rows: Row[]): RunSummary {
  if (rows.length === 0) throw new Error("No data points found in the run file.");

  // Repair Apple-Watch cadence dropouts before any metric reads the series.
  despikeCadence(rows);

  // The Lap/Intensity columns are only populated on transition rows. Carry the
  // last seen values forward (and backfill the leading rows) so every sample
  // belongs to a lap and an intensity.
  let curLap: number | null = null;
  let curInt = "";
  for (const r of rows) {
    if (r.lap !== null) curLap = r.lap;
    if (r.intensity) curInt = r.intensity;
    r.lap = curLap;
    r.intensity = curInt;
  }
  const firstLap = rows.find((r) => r.lap !== null)?.lap ?? 1;
  const firstInt = rows.find((r) => r.intensity)?.intensity ?? "active";
  for (const r of rows) {
    if (r.lap === null) r.lap = firstLap;
    if (!r.intensity) r.intensity = firstInt;
  }

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

  // Splits per lap/interval as defined in the workout.
  const laps = computeLaps(rows);

  // Intensity (warmup / active / cooldown / recovery) seconds.
  const intensityBreakdown: Record<string, number> = {};
  for (const r of rows) {
    intensityBreakdown[r.intensity] = (intensityBreakdown[r.intensity] ?? 0) + 1;
  }

  // Heart-rate histogram: seconds spent at each integer bpm. Stored so we can
  // recompute zone time against the user's own (editable) HR zones later.
  const hrHistogram: Record<string, number> = {};
  for (const r of rows) {
    if (r.hr === null) continue;
    const bpm = Math.round(r.hr);
    hrHistogram[bpm] = (hrHistogram[bpm] ?? 0) + 1;
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
    laps,
    intensityBreakdown,
    hrHistogram,
    sampleCount: rows.length,
    series,
  };
}

function computeSplits(rows: Row[]): Split[] {
  const splits: Split[] = [];
  // Build a clean (time, distance) list.
  const pts = rows
    .filter((r) => r.dist !== null)
    .map((r) => ({ t: r.since, d: r.dist as number, hr: r.hr, elev: r.elev, cad: r.cadence }));
  if (pts.length < 2) return splits;

  const totalDist = pts[pts.length - 1].d;
  let boundary = 1000;
  let prevBoundaryTime = pts[0].t;
  let segHr: number[] = [];
  let segCad: number[] = [];
  let segElevGain = 0;
  let prevElev: number | null = pts[0].elev;
  const avgOrNull = (xs: number[]) =>
    xs.length ? Math.round(xs.reduce((x, y) => x + y, 0) / xs.length) : null;

  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1];
    const b = pts[i];
    if (b.hr !== null) segHr.push(b.hr);
    if (b.cad !== null) segCad.push(b.cad);
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
        avgHr: avgOrNull(segHr),
        avgCadence: avgOrNull(segCad),
        elevGainM: Math.round(segElevGain),
      });
      prevBoundaryTime = tCross;
      segHr = [];
      segCad = [];
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
      avgHr: avgOrNull(segHr),
      avgCadence: avgOrNull(segCad),
      elevGainM: Math.round(segElevGain),
    });
  }

  return splits;
}

// Group samples by the Lap column (already carried-forward) to produce the
// workout's intervals: warmup, work reps, recoveries, cooldown, etc.
function computeLaps(rows: Row[]): LapSplit[] {
  const laps: LapSplit[] = [];
  if (rows.length === 0) return laps;

  // Distance/time at the end of the previous lap, so laps are contiguous and
  // sum to the run total even where samples are sparse.
  let prevEndDist = rows.find((r) => r.dist !== null)?.dist ?? 0;
  let prevEndTime = rows[0].since;

  let i = 0;
  while (i < rows.length) {
    const lapNo = rows[i].lap as number;
    const start = i;
    while (i < rows.length && rows[i].lap === lapNo) i++;
    const segment = rows.slice(start, i);

    // End-of-lap cumulative distance/time (last known values in the segment).
    let endDist = prevEndDist;
    for (const r of segment) if (r.dist !== null) endDist = r.dist;
    const endTime = segment[segment.length - 1].since;

    const distanceM = Math.max(0, endDist - prevEndDist);
    const durationSec = Math.max(0, endTime - prevEndTime);

    const hr = segment.map((r) => r.hr).filter((x): x is number => x !== null);
    const cad = segment.map((r) => r.cadence).filter((x): x is number => x !== null);

    let elevGain = 0;
    let prevElev: number | null = null;
    for (const r of segment) {
      if (r.elev === null) continue;
      if (prevElev !== null && r.elev - prevElev > 0.5) elevGain += r.elev - prevElev;
      prevElev = r.elev;
    }

    // Pick the most representative intensity label in the segment.
    const intensity = segment.find((r) => r.intensity)?.intensity ?? "active";

    laps.push({
      lap: lapNo,
      intensity,
      distanceM: Math.round(distanceM),
      durationSec,
      paceSecPerKm: distanceM > 0 ? (durationSec / distanceM) * 1000 : 0,
      avgHr: hr.length ? Math.round(hr.reduce((a, b) => a + b, 0) / hr.length) : null,
      maxHr: hr.length ? Math.max(...hr) : null,
      avgCadence: cad.length ? Math.round(cad.reduce((a, b) => a + b, 0) / cad.length) : null,
      elevGainM: Math.round(elevGain),
    });

    prevEndDist = endDist;
    prevEndTime = endTime;
  }

  return laps;
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

// Day-first display date: "dd-mm-yy". Reformats an ISO / YYYY-MM-DD string by
// string surgery (no timezone math) so it matches the stored calendar day.
export function formatDate(input: string | null | undefined): string {
  if (!input) return "—";
  const [y, m, d] = input.slice(0, 10).split("-");
  if (!y || !m || !d) return input;
  return `${d}-${m}-${y.slice(2)}`;
}

// Rewrite any ISO date (YYYY-MM-DD) embedded in a display string to dd-mm-yy.
// Used for session names that had the date baked in at import time.
export function formatDatesInText(text: string): string {
  return text.replace(
    /(\d{4})-(\d{2})-(\d{2})/g,
    (_m, y, mo, d) => `${d}-${mo}-${y.slice(2)}`
  );
}

// Parse a finish time into seconds. Accepts a clock string ("H:MM:SS", "MM:SS")
// or a bare number/numeric string (already seconds). Returns null for empty or
// unparseable input (used to clear a value). This keeps the model from having to
// do H:MM:SS → seconds arithmetic itself (where it tends to drift).
export function parseRaceTime(input: unknown): number | null {
  if (input === null || input === undefined) return null;
  if (typeof input === "number") return Number.isFinite(input) && input > 0 ? Math.round(input) : null;
  const str = String(input).trim();
  if (!str) return null;
  // Bare seconds (no colon), e.g. "8100".
  if (/^\d+(\.\d+)?$/.test(str)) {
    const n = Number(str);
    return n > 0 ? Math.round(n) : null;
  }
  const parts = str.split(":").map((p) => p.trim());
  if (parts.length < 2 || parts.length > 3 || parts.some((p) => !/^\d+$/.test(p))) return null;
  const nums = parts.map(Number);
  const sec = parts.length === 3 ? nums[0] * 3600 + nums[1] * 60 + nums[2] : nums[0] * 60 + nums[1];
  return sec > 0 ? Math.round(sec) : null;
}
