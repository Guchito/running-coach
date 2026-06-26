import { Decoder, Stream } from "@garmin/fitsdk";
import { summarizeRows, type Row } from "./parseRun";
import type { RunSummary } from "./types";

// Parses Garmin/ANT .fit files (e.g. HealthFit exports). Uses the official
// Garmin FIT SDK to decode, then maps record/lap messages into the same Row
// shape the CSV parser produces, so all downstream metrics are shared.

type FitRecord = {
  timestamp?: Date;
  distance?: number; // meters
  speed?: number; // m/s
  enhancedSpeed?: number;
  heartRate?: number;
  cadence?: number; // rpm (per leg for running)
  fractionalCadence?: number;
  altitude?: number;
  enhancedAltitude?: number;
  power?: number;
  stepLength?: number; // mm
  verticalOscillation?: number; // mm
  stanceTime?: number; // ms
};

type FitLap = {
  startTime?: Date;
  timestamp?: Date; // end of lap
  intensity?: string | number; // 'active' | 'rest' | 'warmup' | 'cooldown'
};

export type FitMessages = {
  recordMesgs?: FitRecord[];
  lapMesgs?: FitLap[];
};

function intensityLabel(v: string | number | undefined): string {
  if (v === undefined || v === null) return "";
  const s = String(v).toLowerCase();
  if (s === "rest") return "recovery";
  if (["active", "warmup", "cooldown", "recovery"].includes(s)) return s;
  return s; // unknown -> pass through
}

// Pure mapping from decoded FIT messages to time-samples. Exported for testing.
export function fitMessagesToRows(messages: FitMessages): Row[] {
  const records = (messages.recordMesgs ?? []).filter((r) => r.timestamp);
  if (records.length === 0) return [];

  records.sort((a, b) => (a.timestamp!.getTime() - b.timestamp!.getTime()));
  const start = records[0].timestamp!.getTime();

  // Build lap windows [start, end, intensity, number].
  const laps = (messages.lapMesgs ?? [])
    .filter((l) => l.startTime || l.timestamp)
    .map((l, i) => ({
      num: i + 1,
      start: (l.startTime ?? l.timestamp)!.getTime(),
      end: l.timestamp ? l.timestamp.getTime() : Infinity,
      intensity: intensityLabel(l.intensity),
    }));

  const lapFor = (t: number) => {
    for (const l of laps) if (t >= l.start && t <= l.end) return l;
    return null;
  };

  // FIT running cadence is per-leg (~80-90). Detect if the file already stores
  // full steps/min and normalize back to per-leg so the ×2 display is correct.
  const rawCads = records
    .map((r) => (r.cadence ?? 0) + (r.fractionalCadence ?? 0))
    .filter((c) => c > 0)
    .sort((a, b) => a - b);
  const medianCad = rawCads.length ? rawCads[Math.floor(rawCads.length / 2)] : 0;
  const cadenceFactor = medianCad > 120 ? 0.5 : 1;

  return records.map((r) => {
    const t = r.timestamp!.getTime();
    const lap = lapFor(t);
    const cadRaw = r.cadence != null ? r.cadence + (r.fractionalCadence ?? 0) : null;
    return {
      iso: r.timestamp!.toISOString(),
      hr: r.heartRate ?? null,
      power: r.power ?? null,
      cadence: cadRaw != null ? cadRaw * cadenceFactor : null,
      elev: r.enhancedAltitude ?? r.altitude ?? null,
      dist: r.distance ?? null,
      speed: r.enhancedSpeed ?? r.speed ?? null,
      stride: r.stepLength ?? null,
      vo: r.verticalOscillation ?? null,
      gct: r.stanceTime ?? null,
      lap: lap ? lap.num : null,
      intensity: lap ? lap.intensity : "",
      since: (t - start) / 1000,
    } satisfies Row;
  });
}

export function parseRunFit(buffer: Buffer | Uint8Array): RunSummary {
  const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  const stream = Stream.fromByteArray(bytes);
  const decoder = new Decoder(stream);
  if (!decoder.isFIT()) {
    throw new Error("This doesn't look like a valid .fit file.");
  }
  const { messages } = decoder.read({
    convertTypesToStrings: true,
    convertDateTimesToDates: true,
  });

  const rows = fitMessagesToRows(messages as FitMessages);
  if (rows.length === 0) {
    throw new Error("No GPS/record data found in this .fit file.");
  }
  return summarizeRows(rows);
}
