// Shared types for the running coach app.

export type Split = {
  km: number;            // which kilometer (1 = first km)
  distanceM: number;     // distance covered in this split (usually 1000, last may be less)
  durationSec: number;   // time spent in this split
  paceSecPerKm: number;  // pace for this split
  avgHr: number | null;
  avgCadence: number | null; // raw watch cadence (count/min); ×2 = steps/min
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
  // Coach's realistic projected finish on race day, accounting for the training
  // still to come — distinct from the "if you raced today" estimate from recent runs.
  projectedTimeSec: number | null;
  notes: string | null;
  status: GoalStatus;
  // The actual race result, once the runner confirms which uploaded run was the
  // race. resultTimeSec/racedOn are denormalized so they survive the run being
  // deleted; resultRunId links back to the run detail when it still exists.
  resultRunId: number | null;
  resultTimeSec: number | null;
  racedOn: string | null; // ISO date the race was run
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
  instructions: string | null;  // user-written guidance the coach must respect; persists across plan rebuilds
  updatedAt: string;
};

// One prescribed lift in a planned strength day. reps is a string so ranges
// ("6-8") and time holds ("30s") both fit; weightKg is the target working
// weight the coach derives from the runner's logged lifts.
export type PlanExercise = {
  name: string;
  sets: number;
  reps: string;
  weightKg: number | null;
  note: string | null;
};

export type PlanDay = {
  day: string;              // "Mon".."Sun"
  type: string;             // easy | tempo | intervals | long | rest | cross | race
  title: string;            // short label
  detail: string;           // the workout description
  distanceKm: number | null;
  // The prescribed session for strength days — what to actually do in the gym.
  exercises?: PlanExercise[] | null;
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
  lactateThresholdHr: number | null;
  hrZones: HrZone[] | null;
  driveFolderId: string | null;
  driveLastSync: string | null;
  coachModel: string | null;  // chosen Claude model for the coach; null = use the default
  hasAnthropicKey: boolean;   // whether the runner has stored their own Anthropic API key
  hasNvidiaKey: boolean;      // whether the runner has stored their own NVIDIA API key
  lthrTestIntervalWeeks: number | null; // re-test cadence; null = no schedule
  autoNameRuns: boolean;      // let the coach rename runs after analyzing them
  garminConnected: boolean;   // whether a Garmin Connect session token is stored
  garminLastSync: string | null;
  healthSheetId: string | null; // Google Sheet the HealthFit daily metrics sync from
  createdAt: string;
};

// A logged lactate-threshold HR test result. The latest one sets the runner's
// current LTHR (used for zones); the history shows progression over time.
export type LthrTest = {
  id: number;
  testedOn: string; // YYYY-MM-DD
  lthr: number;
  maxHr: number | null; // max HR seen during the test, if recorded
  notes: string | null;
  createdAt: string;
};

// One day of health data: Apple Health values synced from the runner's
// HealthFit Google Sheet (Daily Metrics / Sleep / Weight tabs merged by
// date), plus anything logged by hand on the Profile page (which can also
// attach a note). Every field is nullable: tabs cover different dates and
// today's row is always partial.
export type HealthMetric = {
  id: number;
  date: string; // YYYY-MM-DD
  activeKcal: number | null;
  restingKcal: number | null;
  restingHr: number | null;
  hrv: number | null;
  steps: number | null;
  vo2Max: number | null;
  exerciseMin: number | null;
  standHours: number | null;
  sleepMin: number | null; // time asleep
  inBedMin: number | null;
  sleepCoreMin: number | null;
  sleepDeepMin: number | null;
  sleepRemMin: number | null;
  sleepAwakeMin: number | null;
  weightKg: number | null;
  bodyFatPct: number | null;
  notes: string | null; // manual log only — the sheet sync never writes this
};

// The nullable per-day values a sync writes (id is assigned by the DB).
export type HealthMetricInput = Omit<HealthMetric, "id">;

// ---- Gym / strength sessions ----

export type GymType =
  | "push"
  | "pull"
  | "legs"
  | "upper"
  | "lower"
  | "full_body"
  | "core"
  | "cardio"
  | "other";

// Summary-level data extracted from a gym/strength .fit or .tcx file. Strength
// workouts have no distance/pace, so we keep what a watch reliably records.
export type GymSummary = {
  startedAt: string;
  durationSec: number;
  avgHr: number | null;
  maxHr: number | null;
  calories: number | null;
  // Effort rating entered on the watch when ending the workout (FIT
  // workout_rpe ÷ 10 → 1-10). Null when the file/source doesn't carry one.
  rpe: number | null;
  sport: string | null; // raw FIT/TCX sport, e.g. "training"
  subSport: string | null; // raw FIT sub-sport, e.g. "strength_training"
};

// One set of an exercise, as logged in a lifting app (e.g. Strong). Weight is
// null for bodyweight/rep-only sets.
// A set is weight×reps, reps-only, or a timed hold (plank etc. — reps is 0
// and durationSec carries the set).
export type GymSet = { weightKg: number | null; reps: number; durationSec?: number | null };

export type GymExercise = { name: string; sets: GymSet[] };

export type GymSession = {
  id: number;
  name: string;
  type: GymType;
  startedAt: string;
  durationSec: number;
  rpe: number | null; // perceived intensity, 1-10
  avgHr: number | null;
  maxHr: number | null;
  calories: number | null;
  notes: string | null;
  summary: GymSummary;
  // Exercises pasted from a lifting app; null when only watch data exists.
  exercises: GymExercise[] | null;
  strongLink: string | null; // share link from the pasted Strong export
  createdAt: string;
};

export type ChatMessage = {
  id: number;
  role: "user" | "assistant";
  content: string;
  createdAt: string;
};
