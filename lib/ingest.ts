import { Decoder, Stream } from "@garmin/fitsdk";
import { parseRunCsv, summarizeRows } from "./parseRun";
import { parseRunFit, fitMessagesToRows, type FitMessages } from "./parseFit";
import { parseGymFit, parseGymTcx, gymSummaryFromMessages, type GymFitMessages } from "./parseGym";
import { isStrengthSport } from "./gym";
import type { RunSummary, GymSummary } from "./types";

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

// Friendly run name from a source filename + start date.
export function runNameFromFile(filename: string, startedAt: string): string {
  const base = filename.replace(/\.(csv|fit)$/i, "").trim();
  const date = startedAt.slice(0, 10);
  if (/outdoor running/i.test(base)) return `Outdoor Run · ${date}`;
  return base.length > 40 || base.length === 0 ? `Run · ${date}` : base;
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
    return { kind: "run", summary: summarizeRows(rows) };
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
