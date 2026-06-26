// Shared types for the running coach app.

export type Split = {
  km: number;            // which kilometer (1 = first km)
  distanceM: number;     // distance covered in this split (usually 1000, last may be less)
  durationSec: number;   // time spent in this split
  paceSecPerKm: number;  // pace for this split
  avgHr: number | null;
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
  intensityBreakdown: Record<string, number>; // label -> seconds
  hrZones: Record<string, number> | null;     // zone -> seconds (if HR present)
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

export type Goal = {
  id: number;
  title: string;          // e.g. "Run a sub-25 5K"
  raceType: string;       // e.g. "5K", "10K", "Half Marathon", "Marathon", "Custom"
  targetDistanceM: number | null;
  targetTimeSec: number | null; // goal finish time, if any
  targetDate: string | null;    // ISO date
  notes: string | null;
  updatedAt: string;
};

export type ChatMessage = {
  id: number;
  role: "user" | "assistant";
  content: string;
  createdAt: string;
};
