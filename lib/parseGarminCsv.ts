import type { RunSummary } from "./types";

// Parses Garmin Connect's bulk "activities.csv" export (Export CSV on the
// activities list page): one row per activity, comma-separated with quoted
// fields, localized headers (Danish and English supported) and "--" for
// missing values. Unlike the per-second Apple Watch CSV there are no samples,
// so the resulting RunSummary has totals/averages only — empty splits, laps,
// series and HR histogram.

export type GarminCsvActivity = {
  type: string; // raw activity type cell, e.g. "Løb" / "Running"
  isRun: boolean;
  title: string | null;
  summary: RunSummary;
};

// Localized header -> canonical key. Lowercased for lookup.
const HEADER_ALIASES: Record<string, string> = {
  // activity type
  "aktivitetstype": "type",
  "activity type": "type",
  // start date/time
  "dato": "date",
  "date": "date",
  // title
  "titel": "title",
  "title": "title",
  // totals
  "distance": "distance",
  "tid": "time",
  "time": "time",
  "tid i bevægelse": "movingTime",
  "moving time": "movingTime",
  "tidsforbrug": "elapsedTime",
  "elapsed time": "elapsedTime",
  // heart rate
  "gennemsnitlig puls": "avgHr",
  "average hr": "avgHr",
  "avg hr": "avgHr",
  "maks. puls": "maxHr",
  "max hr": "maxHr",
  // cadence (full steps/min in this export)
  "gennemsnit kadence løb": "avgCadence",
  "avg run cadence": "avgCadence",
  "maksimum kadence løb": "maxCadence",
  "max run cadence": "maxCadence",
  // elevation
  "samlet stigning": "ascent",
  "total ascent": "ascent",
  "samlet nedstigning": "descent",
  "total descent": "descent",
  // form / power
  "gennemsnitlig skridtlængde": "stride", // meters
  "avg stride length": "stride",
  "gennemsnitlig effekt": "avgPower",
  "avg power": "avgPower",
};

// Activity types we store as runs (covers treadmill variants too: "Løbebånd",
// "Treadmill Running", "Trail Running", ...).
const RUN_TYPE = /løb|running/i;

// Minimal CSV tokenizer: comma-separated, double-quote quoting with "" escapes,
// newlines allowed inside quoted fields.
function parseCsv(text: string): string[][] {
  const records: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let inQuotes = false;
  const pushCell = () => {
    row.push(cell);
    cell = "";
  };
  const pushRow = () => {
    pushCell();
    // Skip fully empty rows (trailing newline etc.).
    if (row.length > 1 || row[0].trim() !== "") records.push(row);
    row = [];
  };
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          cell += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        cell += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ",") {
      pushCell();
    } else if (ch === "\n") {
      pushRow();
    } else if (ch !== "\r") {
      cell += ch;
    }
  }
  if (cell !== "" || row.length > 0) pushRow();
  return records;
}

function headerIndex(header: string[]): Record<string, number> {
  const idx: Record<string, number> = {};
  header.forEach((h, i) => {
    const key = HEADER_ALIASES[h.trim().toLowerCase()];
    if (key && idx[key] === undefined) idx[key] = i;
  });
  return idx;
}

// True when the text looks like a Garmin activities export: comma-separated
// header row containing at least activity-type, date and time columns. The
// Apple Watch per-second CSV is semicolon-separated, so it never matches.
export function isGarminActivitiesCsv(text: string): boolean {
  const firstLine = text.slice(0, text.indexOf("\n") + 1 || text.length);
  const header = parseCsv(firstLine)[0];
  if (!header || header.length < 3) return false;
  const idx = headerIndex(header);
  return idx.type !== undefined && idx.date !== undefined && idx.time !== undefined;
}

// Numeric cell: "--" -> null, strips Garmin's occasional leading apostrophe
// ("'-16"), handles "1,177" (thousands) and "13,91" (decimal comma) alike.
function num(raw: string | undefined): number | null {
  if (raw === undefined) return null;
  let s = raw.trim().replace(/^'/, "");
  if (s === "" || s === "--") return null;
  if (s.includes(".") ) {
    s = s.replace(/,/g, ""); // dot decimal, commas are thousands seps
  } else if (/^-?\d{1,3}(,\d{3})+$/.test(s)) {
    s = s.replace(/,/g, ""); // pure thousands grouping
  } else {
    s = s.replace(",", "."); // decimal comma
  }
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

// Clock cell: "01:17:48", "33:30", "00:05:06.0" -> seconds.
function clockSec(raw: string | undefined): number | null {
  if (raw === undefined) return null;
  const s = raw.trim();
  if (s === "" || s === "--") return null;
  const parts = s.split(":");
  if (parts.length < 2 || parts.length > 3) return null;
  const nums = parts.map((p) => Number(p.replace(",", ".")));
  if (nums.some((n) => !Number.isFinite(n))) return null;
  return parts.length === 3
    ? nums[0] * 3600 + nums[1] * 60 + nums[2]
    : nums[0] * 60 + nums[1];
}

// "2026-07-01 17:27:35" -> "2026-07-01T17:27:35" (local time; the export
// carries no timezone).
function toIso(raw: string | undefined): string | null {
  const s = (raw ?? "").trim();
  if (!/^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}(:\d{2})?$/.test(s)) return null;
  return s.replace(" ", "T");
}

export function parseGarminActivitiesCsv(text: string): GarminCsvActivity[] {
  const records = parseCsv(text);
  if (records.length < 2) {
    throw new Error("The activities CSV appears to be empty.");
  }
  const idx = headerIndex(records[0]);
  if (idx.type === undefined || idx.date === undefined || idx.time === undefined) {
    throw new Error("Unrecognized activities CSV — missing activity type, date or time columns.");
  }
  const at = (cells: string[], key: string): string | undefined =>
    idx[key] !== undefined ? cells[idx[key]] : undefined;

  const out: GarminCsvActivity[] = [];
  for (let i = 1; i < records.length; i++) {
    const cells = records[i];
    const startedAt = toIso(at(cells, "date"));
    const durationSec = clockSec(at(cells, "time"));
    if (!startedAt || !durationSec) continue; // malformed row — skip, keep the rest

    const distanceM = (num(at(cells, "distance")) ?? 0) * 1000; // export is in km
    const movingSec = clockSec(at(cells, "movingTime")) ?? durationSec;
    // Cadence is exported as full steps/min; the app stores per-leg counts
    // (doubled for display), so halve it here.
    const avgCadence = num(at(cells, "avgCadence"));
    const maxCadence = num(at(cells, "maxCadence"));
    const strideM = num(at(cells, "stride"));

    const summary: RunSummary = {
      startedAt,
      durationSec,
      movingSec,
      distanceM,
      avgPaceSecPerKm: distanceM > 0 ? (durationSec / distanceM) * 1000 : 0,
      avgMovingPaceSecPerKm: distanceM > 0 ? (movingSec / distanceM) * 1000 : 0,
      avgSpeed: durationSec > 0 ? distanceM / durationSec : 0,
      avgHr: num(at(cells, "avgHr")),
      maxHr: num(at(cells, "maxHr")),
      avgCadence: avgCadence !== null ? avgCadence / 2 : null,
      maxCadence: maxCadence !== null ? maxCadence / 2 : null,
      avgPower: num(at(cells, "avgPower")),
      avgStrideMm: strideM !== null ? strideM * 1000 : null,
      avgVoMm: null,
      avgGctMs: null,
      elevGainM: num(at(cells, "ascent")) ?? 0,
      elevLossM: num(at(cells, "descent")) ?? 0,
      splits: [],
      laps: [],
      intensityBreakdown: { active: durationSec },
      hrHistogram: {},
      sampleCount: 0,
      series: [],
    };

    const type = (at(cells, "type") ?? "").trim();
    const title = (at(cells, "title") ?? "").trim();
    out.push({
      type,
      isRun: RUN_TYPE.test(type),
      title: title || null,
      summary,
    });
  }
  if (out.length === 0) {
    throw new Error("No activities could be read from the CSV.");
  }
  return out;
}
