// Shared types for the running coach app.

export type Split = {
  km: number;            // which kilometer (1 = first km)
  distanceM: number;     // distance covered in this split (usually 1000, last may be less)
  durationSec: number;   // time spent in this split
  paceSecPerKm: number;  // pace for this split
  avgHr: number | null;
  elevGainM: number;
};

// A lap/interval as defined in the workout on the watch (warmup, active,
// recovery, cooldown, etc.). Mirrors the CSV's Lap + Intensity columns.
export type LapSplit = {
  lap: number;
  intensity: string;
  distanceM: number;
  durationSec: number;
  paceSecPerKm: number;
  avgHr: number | null;
  maxHr: number | null;
  avgCadence: number | null;
  elevGainM: number;
};

export type SeriesPoint = {
  t: number;             // seconds since start
  distM: number;         // cumulative distance
  paceSecPerKm: number | null;
  hr: number | null;
  elevM: number | null;
  cadence: number | null;
  speed: number | null;  // m/s
};

export type RunSummary = {
  startedAt: string;          // ISO8601 of first sample
  durationSec: number;
  movingSec: number;          // seconds with speed above walking threshold
  distanceM: number;
  avgPaceSecPerKm: number;
  avgMovingPaceSecPerKm: number;
  avgSpeed: number;           // m/s
  avgHr: number | null;
  maxHr: number | null;
  avgCadence: number | null;  // raw watch cadence (count/min)
  maxCadence: number | null;
  avgPower: number | null;
  avgStrideMm: number | null;
  avgVoMm: number | null;     // vertical oscillation
  avgGctMs: number | null;    // ground contact time
  elevGainM: number;
  elevLossM: number;
  splits: Split[];
  laps: LapSplit[];           // intervals as set in the workout
  intensityBreakdown: Record<string, number>; // label -> seconds
  hrHistogram: Record<string, number>;         // bpm -> seconds (for custom HR zones)
  sampleCount: number;
  series: SeriesPoint[];      // downsampled for charting
};

export type RunRow = {
  id: number;
  name: string;
  startedAt: string;
  distanceM: number;
  durationSec: number;
  avgPaceSecPerKm: number;
  avgHr: number | null;
  maxHr: number | null;
  avgCadence: number | null;
  avgPower: number | null;
  elevGainM: number;
  summary: RunSummary;
  createdAt: string;
};

export type GoalStatus = "active" | "achieved" | "abandoned";

export type Goal = {
  id: number;
  title: string;          // e.g. "Run a sub-25 5K"
  raceType: string;       // e.g. "5K", "10K", "Half Marathon", "Marathon", "Custom"
  targetDistanceM: number | null;
  targetTimeSec: number | null; // goal finish time, if any
  targetDate: string | null;    // ISO date
  notes: string | null;
  status: GoalStatus;
  createdAt: string;
  updatedAt: string;
};

// ---- Training plans ----

export type MacroPhase = {
  name: string;             // e.g. "Base", "Build", "Peak", "Taper"
  start: string | null;     // ISO date
  end: string | null;       // ISO date
  focus: string;            // what this phase develops
  weeklyKm: number | null;  // rough target weekly volume
  notes: string | null;
};

export type MacroPlan = {
  summary: string;
  phases: MacroPhase[];
  updatedAt: string;
};

export type PlanDay = {
  day: string;              // "Mon".."Sun"
  type: string;             // easy | tempo | intervals | long | rest | cross | race
  title: string;            // short label
  detail: string;           // the workout description
  distanceKm: number | null;
  done?: boolean;
};

export type WeeklyPlan = {
  weekStart: string | null; // ISO date of the week's Monday
  summary: string;
  days: PlanDay[];
  updatedAt: string;
};

export type Plan = {
  macro: MacroPlan | null;
  weekly: WeeklyPlan | null;
};

// ---- Heart-rate zones ----

export type HrZone = {
  name: string;   // e.g. "Z2 Easy"
  min: number;    // inclusive lower bpm
  max: number;    // inclusive upper bpm
};

export type User = {
  id: number;
  email: string;
  name: string | null;
  maxHr: number | null;
  hrZones: HrZone[] | null;
  driveFolderId: string | null;
  driveLastSync: string | null;
  createdAt: string;
};

export type ChatMessage = {
  id: number;
  role: "user" | "assistant";
  content: string;
  createdAt: string;
};
