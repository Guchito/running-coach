import { Decoder, Stream } from "@garmin/fitsdk";
import type { GymSummary } from "./types";

// Server-only: extracts summary-level data from a gym/strength workout file.
// Strength workouts have no distance/pace, so we keep start time, duration,
// heart-rate, calories, and the raw sport tags (used to guess the type).

type FitSession = {
  startTime?: Date;
  totalTimerTime?: number; // seconds
  totalElapsedTime?: number; // seconds
  totalCalories?: number;
  avgHeartRate?: number;
  maxHeartRate?: number;
  sport?: string | number;
  subSport?: string | number;
};

type FitRecord = { timestamp?: Date; heartRate?: number };

export type GymFitMessages = {
  sessionMesgs?: FitSession[];
  recordMesgs?: FitRecord[];
};

export function parseGymFit(buffer: Buffer | Uint8Array): GymSummary {
  const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  const decoder = new Decoder(Stream.fromByteArray(bytes));
  if (!decoder.isFIT()) {
    throw new Error("This doesn't look like a valid .fit file.");
  }
  const { messages } = decoder.read({
    convertTypesToStrings: true,
    convertDateTimesToDates: true,
  });
  return gymSummaryFromMessages(messages as GymFitMessages);
}

// Pure extraction from already-decoded FIT messages, so callers that have
// already decoded the file (e.g. the importer's classifier) don't decode twice.
export function gymSummaryFromMessages(messages: GymFitMessages): GymSummary {
  const sessions = messages.sessionMesgs ?? [];
  const records = messages.recordMesgs ?? [];

  let startedAt: string | null = null;
  let durationSec = 0;
  let avgHr: number | null = null;
  let maxHr: number | null = null;
  let calories: number | null = null;
  let sport: string | null = null;
  let subSport: string | null = null;

  if (sessions.length) {
    const s = sessions[0];
    startedAt = s.startTime ? s.startTime.toISOString() : null;
    durationSec = Math.round(s.totalTimerTime ?? s.totalElapsedTime ?? 0);
    avgHr = typeof s.avgHeartRate === "number" ? s.avgHeartRate : null;
    maxHr = typeof s.maxHeartRate === "number" ? s.maxHeartRate : null;
    calories = typeof s.totalCalories === "number" ? s.totalCalories : null;
    sport = s.sport != null ? String(s.sport) : null;
    subSport = s.subSport != null ? String(s.subSport) : null;
  }

  // Fall back to the record stream for anything the session message lacked.
  const stamped = records
    .filter((r) => r.timestamp)
    .sort((a, b) => a.timestamp!.getTime() - b.timestamp!.getTime());
  if (!startedAt && stamped.length) startedAt = stamped[0].timestamp!.toISOString();
  if (!durationSec && stamped.length) {
    durationSec = Math.round(
      (stamped[stamped.length - 1].timestamp!.getTime() - stamped[0].timestamp!.getTime()) / 1000
    );
  }
  const hrs = records
    .map((r) => r.heartRate)
    .filter((h): h is number => typeof h === "number" && h > 0);
  if (avgHr === null && hrs.length) avgHr = Math.round(hrs.reduce((a, b) => a + b, 0) / hrs.length);
  if (maxHr === null && hrs.length) maxHr = Math.max(...hrs);

  if (!startedAt) {
    throw new Error("No timing data found in this .fit file.");
  }

  return { startedAt, durationSec, avgHr, maxHr, calories, sport, subSport };
}

// Lightweight summary extraction from a Garmin TCX (XML). Summary-only — we sum
// per-lap totals rather than parsing every trackpoint.
export function parseGymTcx(xml: string): GymSummary {
  const sport = /<Activity[^>]*Sport="([^"]+)"/i.exec(xml)?.[1] ?? null;
  const rawStart =
    /<Id>\s*([^<]+?)\s*<\/Id>/i.exec(xml)?.[1] ??
    /<Lap[^>]*StartTime="([^"]+)"/i.exec(xml)?.[1] ??
    null;
  if (!rawStart) {
    throw new Error("Couldn't find a start time in this .tcx file.");
  }

  let durationSec = 0;
  for (const m of xml.matchAll(/<TotalTimeSeconds>\s*([\d.]+)\s*<\/TotalTimeSeconds>/gi)) {
    durationSec += Number(m[1]);
  }

  let calories = 0;
  let hasCalories = false;
  for (const m of xml.matchAll(/<Calories>\s*(\d+)\s*<\/Calories>/gi)) {
    calories += Number(m[1]);
    hasCalories = true;
  }

  const avgHrs = [...xml.matchAll(/<AverageHeartRateBpm>\s*<Value>\s*(\d+)\s*<\/Value>/gi)].map((m) =>
    Number(m[1])
  );
  const maxHrs = [...xml.matchAll(/<MaximumHeartRateBpm>\s*<Value>\s*(\d+)\s*<\/Value>/gi)].map((m) =>
    Number(m[1])
  );

  return {
    startedAt: new Date(rawStart).toISOString(),
    durationSec: Math.round(durationSec),
    avgHr: avgHrs.length ? Math.round(avgHrs.reduce((a, b) => a + b, 0) / avgHrs.length) : null,
    maxHr: maxHrs.length ? Math.max(...maxHrs) : null,
    calories: hasCalories ? calories : null,
    sport,
    subSport: null,
  };
}
