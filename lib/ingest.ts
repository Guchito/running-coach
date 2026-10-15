import { Decoder, Stream } from "@garmin/fitsdk";
import { parseRunCsv, summarizeRows } from "./parseRun";
import { parseRunFit, fitMessagesToRows, fitSport, type FitMessages } from "./parseFit";
import { parseGymFit, parseGymTcx, gymSummaryFromMessages, type GymFitMessages } from "./parseGym";
import { isStrengthSport } from "./gym";
import type { RunSummary, GymSummary, Sport } from "./types";
import { SPORT_LABEL } from "./sessionMeta";

// Server-only: pick the right parser by file extension. Kept out of
// parseRun.ts because parseFit pulls in the Node-only Garmin SDK, and
// parseRun is imported by client components for its formatters.
export function parseRunFile(filename: string, data: Buffer | Uint8Array | string): RunSummary {
  const ext = filename.toLowerCase().split(".").pop();
  if (ext === "fit") {
    const buf =
      typeof data === "string"
        ? Buffer.from(data, "binary")
        : data instanceof Uint8Array
        ? data
        : Buffer.from(data);
    return parseRunFit(buf);
  }
  const text = typeof data === "string" ? data : Buffer.from(data).toString("utf8");
  return parseRunCsv(text);
}

// Friendly name from a source filename + start date, e.g. "Outdoor Run · 2026-10-14"
// or "Walk · 2026-10-14" for the other sports.
export function runNameFromFile(filename: string, startedAt: string, sport: Sport = "running"): string {
  const base = filename.replace(/\.(csv|fit)$/i, "").trim();
  const date = startedAt.slice(0, 10);
  const label = SPORT_LABEL[sport];
  if (/outdoor (running|walking|cycling|swimming|rowing)/i.test(base)) return `Outdoor ${label} · ${date}`;
  return base.length > 40 || base.length === 0 ? `${label} · ${date}` : base;
}

// Server-only: pick the right gym parser by file extension (.fit or .tcx).
export function parseGymFile(filename: string, data: Buffer | Uint8Array | string): GymSummary {
  const ext = filename.toLowerCase().split(".").pop();
  if (ext === "fit") {
    const buf =
      typeof data === "string"
        ? Buffer.from(data, "binary")
        : data instanceof Uint8Array
        ? data
        : Buffer.from(data);
    return parseGymFit(buf);
  }
  if (ext === "tcx") {
    const text = typeof data === "string" ? data : Buffer.from(data).toString("utf8");
    return parseGymTcx(text);
  }
  throw new Error("Please upload a .fit or .tcx file from your watch.");
}

// Friendly gym-session name from a source filename + start date.
export function gymNameFromFile(filename: string, startedAt: string): string {
  const base = filename.replace(/\.(fit|tcx)$/i, "").trim();
  const date = startedAt.slice(0, 10);
  return base.length > 40 || base.length === 0 ? `Gym session · ${date}` : base;
}

export type ParsedActivity =
  | { kind: "run"; summary: RunSummary }
  | { kind: "gym"; summary: GymSummary };

type DecodedFit = FitMessages &
  GymFitMessages & {
    sessionMesgs?: { sport?: string | number; subSport?: string | number }[];
    sportMesgs?: { sport?: string | number; subSport?: string | number }[];
  };

function fitSportTags(messages: DecodedFit): { sport: string | null; subSport: string | null } {
  const s = messages.sessionMesgs?.[0] ?? messages.sportMesgs?.[0] ?? {};
  return {
    sport: s.sport != null ? String(s.sport) : null,
    subSport: s.subSport != null ? String(s.subSport) : null,
  };
}

// Server-only: parse a watch file AND classify it as a run or a gym/strength
// session. Used by the Drive importer so strength workouts (sport "training" /
// "strength_training", no distance) don't get stored as runs. Decodes a FIT
// only once.
export function parseActivityFile(
  filename: string,
  data: Buffer | Uint8Array | string
): ParsedActivity {
  const ext = filename.toLowerCase().split(".").pop();

  if (ext === "fit") {
    const buf =
      typeof data === "string"
        ? Buffer.from(data, "binary")
        : data instanceof Uint8Array
        ? data
        : Buffer.from(data);
    const decoder = new Decoder(Stream.fromByteArray(buf instanceof Uint8Array ? buf : new Uint8Array(buf)));
    if (!decoder.isFIT()) {
      throw new Error("This doesn't look like a valid .fit file.");
    }
    const { messages } = decoder.read({
      convertTypesToStrings: true,
      convertDateTimesToDates: true,
    });
    const m = messages as DecodedFit;
    const { sport, subSport } = fitSportTags(m);

    if (isStrengthSport(sport, subSport)) {
      return { kind: "gym", summary: gymSummaryFromMessages(m) };
    }
    const rows = fitMessagesToRows(m as FitMessages);
    // No GPS/record stream and not a recognized run sport → treat as a gym session.
    if (rows.length === 0) {
      return { kind: "gym", summary: gymSummaryFromMessages(m) };
    }
    // Walks/rides/swims keep the full run-style data but carry their sport so
    // they're stored alongside runs without feeding the running stats.
    return { kind: "run", summary: { ...summarizeRows(rows), sport: fitSport(m as FitMessages) } };
  }

  if (ext === "tcx") {
    const text = typeof data === "string" ? data : Buffer.from(data).toString("utf8");
    const sport = /<Activity[^>]*Sport="([^"]+)"/i.exec(text)?.[1] ?? null;
    if (isStrengthSport(sport, null)) {
      return { kind: "gym", summary: parseGymTcx(text) };
    }
    // No run TCX parser exists; fall through to CSV/run path below would fail,
    // so for a non-strength TCX we still record the summary as a gym session.
    return { kind: "gym", summary: parseGymTcx(text) };
  }

  // CSV is the Apple Watch "Outdoor Running" export — always a run.
  const text = typeof data === "string" ? data : Buffer.from(data).toString("utf8");
  return { kind: "run", summary: parseRunCsv(text) };
}
