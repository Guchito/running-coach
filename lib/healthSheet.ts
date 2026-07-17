// Sync the runner's HealthFit "Health Metrics" Google Sheet into the
// health_metrics table. The spreadsheet has one tab per metric family —
// "Daily Metrics" (energy, resting HR, HRV, steps, VO₂ max, exercise/stand),
// "Sleep", and "Weight" — each keyed by a d/m/yyyy date column, newest first.
//
// Reading uses the Sheets API with the SAME service-account token and
// read-only Drive scope the .fit sync already uses (the Sheets API accepts
// drive.readonly), so the runner just shares the spreadsheet with the service
// account — no new credentials. A plain Drive CSV export would only return
// the first tab, which is why this goes through the Sheets API.
import { accessToken } from "./drive";
import { upsertHealthMetrics } from "./db";
import type { HealthMetricInput } from "./types";

// Accept a raw spreadsheet id or a Sheets URL and return the id.
export function parseSheetId(input: string): string | null {
  const s = input.trim();
  if (!s) return null;
  const m = s.match(/\/spreadsheets\/d\/([a-zA-Z0-9_-]+)/);
  if (m) return m[1];
  if (/^[a-zA-Z0-9_-]{10,}$/.test(s) && !s.includes("/")) return s;
  return null;
}

// ---------- value parsing ----------
// Cells arrive as the sheet displays them: "665 kcal", "54 bpm", "49,0"
// (decimal comma), "7:32" (h:mm), or empty.

function parseNumber(raw: string | undefined): number | null {
  if (raw == null) return null;
  let s = String(raw).trim();
  if (!s) return null;
  // "4h:07m" / "4h 07m" / "4h" durations (HealthFit sleep columns) → minutes.
  const hDur = s.match(/^(\d+)\s*h(?:[:\s]?(\d{1,2}))?\s*m?$/i);
  if (hDur) return Number(hDur[1]) * 60 + Number(hDur[2] ?? 0);
  // h:mm or h:mm:ss durations → minutes.
  const hm = s.match(/^(\d+):(\d{2})(?::(\d{2}))?$/);
  if (hm) return Number(hm[1]) * 60 + Number(hm[2]) + (hm[3] ? Number(hm[3]) / 60 : 0);
  // Strip units and spaces, keep digits and separators.
  s = s.replace(/[^\d.,-]/g, "");
  if (!s) return null;
  if (/^\d+,\d+$/.test(s)) s = s.replace(",", "."); // decimal comma ("49,0")
  else s = s.replace(/,/g, ""); // thousands separators
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

// "15/7/2026" (HealthFit), "2026-07-15", or "15-7-2026" → ISO date.
function parseDate(raw: string | undefined): string | null {
  if (!raw) return null;
  const s = String(raw).trim();
  const iso = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (iso) return `${iso[1]}-${iso[2].padStart(2, "0")}-${iso[3].padStart(2, "0")}`;
  const dmy = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})/);
  if (dmy) return `${dmy[3]}-${dmy[2].padStart(2, "0")}-${dmy[1].padStart(2, "0")}`;
  return null;
}

// Normalize a header cell for matching: lowercase alphanumerics only, so
// " VO₂ max ", "VO2 Max" and "vo2max" all become "vo2max".
function normHeader(h: string): string {
  return h
    .toLowerCase()
    .replace(/₂/g, "2")
    .replace(/[^a-z0-9]/g, "");
}

// Header-name → HealthMetricInput field, per known HealthFit columns. Matching
// is by inclusion on the normalized header, so minor renames between HealthFit
// versions keep working. Order matters: first match wins. A null field means
// the column is recognized but deliberately not stored.
// notes is excluded: it's the manual log's field, never read from the sheet.
type Field = keyof Omit<HealthMetricInput, "date" | "notes">;
const COLUMN_MAP: [pattern: string, field: Field | null][] = [
  ["activeenergy", "activeKcal"],
  ["restingenergy", "restingKcal"],
  ["restinghr", "restingHr"],
  ["restingheartrate", "restingHr"],
  ["resting", "restingHr"], // Daily Metrics names the column just "Resting"
  ["lowhrv", null], // Sleep tab's overnight low/high — keep only the average
  ["highhrv", null],
  ["hrv", "hrv"],
  ["steps", "steps"],
  ["vo2max", "vo2Max"],
  ["exercise", "exerciseMin"],
  ["stand", "standHours"],
  ["inbed", "inBedMin"],
  ["fallasleep", null], // time-to-fall-asleep, must not hit the "asleep" pattern
  ["asleep", "sleepMin"],
  ["sleepduration", "sleepMin"],
  ["core", "sleepCoreMin"],
  ["deep", "sleepDeepMin"],
  ["rem", "sleepRemMin"],
  ["awake", "sleepAwakeMin"],
  ["bodyfat", "bodyFatPct"],
  ["leanbodymass", null],
  ["bmi", null],
  ["fat", "bodyFatPct"], // the Weight tab titles the column just "Fat"
  ["weight", "weightKg"],
];

function emptyMetric(date: string): HealthMetricInput {
  return {
    date,
    activeKcal: null,
    restingKcal: null,
    restingHr: null,
    hrv: null,
    steps: null,
    vo2Max: null,
    exerciseMin: null,
    standHours: null,
    sleepMin: null,
    inBedMin: null,
    sleepCoreMin: null,
    sleepDeepMin: null,
    sleepRemMin: null,
    sleepAwakeMin: null,
    weightKg: null,
    bodyFatPct: null,
    notes: null,
  };
}

// Parse one tab's rows (first row = header) into per-day values. Rows with an
// unparseable date, and columns we don't recognize, are skipped.
export function parseTabRows(rows: string[][]): HealthMetricInput[] {
  if (!rows.length) return [];
  const header = rows[0].map(normHeader);
  const dateCol = header.findIndex((h) => h.includes("date") || h === "day");
  if (dateCol === -1) return [];
  const fields: (Field | null)[] = header.map((h, i) => {
    if (i === dateCol || !h) return null;
    const hit = COLUMN_MAP.find(([pat]) => h.includes(pat));
    return hit ? hit[1] : null;
  });

  const out: HealthMetricInput[] = [];
  for (const row of rows.slice(1)) {
    const date = parseDate(row[dateCol]);
    if (!date) continue;
    const m = emptyMetric(date);
    let has = false;
    fields.forEach((field, i) => {
      if (!field) return;
      if (m[field] != null) return; // first mapped column wins within a row
      const v = parseNumber(row[i]);
      if (v == null) return;
      m[field] = field === "vo2Max" || field === "weightKg" || field === "bodyFatPct"
        ? Math.round(v * 10) / 10
        : Math.round(v);
      has = true;
    });
    if (has) out.push(m);
  }
  return out;
}

// ---------- Sheets API ----------

type TabInfo = { title: string };

async function sheetTabs(sheetId: string, token: string): Promise<TabInfo[]> {
  const res = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}?fields=sheets.properties.title`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  if (!res.ok) {
    if (res.status === 404)
      throw new Error("Sheet not found — is it shared with the service account?");
    if (res.status === 403) {
      // Google's 403 body says WHICH problem it is: the Sheets API being
      // disabled on the service account's project reads very differently
      // from the sheet not being shared.
      const body = await res.text().catch(() => "");
      if (/has not been used|is disabled/i.test(body)) {
        const project = body.match(/project\s+([\w-]+)/i)?.[1];
        throw new Error(
          `The Google Sheets API is disabled for the server's Google project${project ? ` (${project})` : ""} — enable it at console.cloud.google.com/apis/library/sheets.googleapis.com, then sync again.`
        );
      }
      throw new Error(
        "No access to the sheet — share it with the service account as Viewer."
      );
    }
    throw new Error(`Sheets API error (${res.status}).`);
  }
  const data = (await res.json()) as { sheets?: { properties: { title: string } }[] };
  return (data.sheets ?? []).map((s) => ({ title: s.properties.title }));
}

async function tabValues(sheetId: string, title: string, token: string): Promise<string[][]> {
  const range = encodeURIComponent(`'${title.replace(/'/g, "''")}'`);
  const res = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/${range}?majorDimension=ROWS`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  if (!res.ok) throw new Error(`Could not read tab "${title}" (${res.status}).`);
  const data = (await res.json()) as { values?: string[][] };
  return data.values ?? [];
}

export type HealthSyncResult = {
  daysUpdated: number;
  tabs: string[]; // tabs actually imported
};

// Read every metric tab and merge the rows into health_metrics. `days` bounds
// how far back rows are written (rows are newest-first, and routine auto-syncs
// only need recent days); pass Infinity for a full backfill.
export async function syncHealthSheet(
  userId: number,
  sheetId: string,
  days = 60
): Promise<HealthSyncResult> {
  const token = await accessToken();
  const tabs = await sheetTabs(sheetId, token);
  // Import tabs whose name we recognize; HealthFit uses "Daily Metrics",
  // "Sleep" and "Weight". Unknown tabs are ignored.
  const wanted = tabs.filter((t) => /daily|metric|sleep|weight|body/i.test(t.title));
  if (!wanted.length)
    throw new Error(
      `No metric tabs found (saw: ${tabs.map((t) => t.title).join(", ") || "none"}).`
    );

  const cutoff =
    days === Infinity ? null : new Date(Date.now() - days * 86400000).toISOString().slice(0, 10);

  // Merge all tabs per date in memory, then write in a few batched upserts —
  // a full-history backfill is hundreds of days × several tabs, and per-row
  // round trips blew past the serverless time limit (the sync request came
  // back empty). Within a date, the first non-null value for a field wins;
  // the batched upsert requires unique dates per call anyway.
  const imported: string[] = [];
  const byDate = new Map<string, HealthMetricInput>();
  for (const tab of wanted) {
    const rows = await tabValues(sheetId, tab.title, token);
    const parsed = parseTabRows(rows);
    if (!parsed.length) continue;
    imported.push(tab.title);
    for (const m of parsed) {
      if (cutoff && m.date < cutoff) continue;
      const existing = byDate.get(m.date);
      if (!existing) {
        byDate.set(m.date, m);
        continue;
      }
      for (const key of Object.keys(m) as (keyof HealthMetricInput)[]) {
        if (key === "date") continue;
        if (existing[key] == null && m[key] != null) {
          // Field types vary (numbers + the notes string), which defeats the
          // correlated-union assignment — the keys are identical either side.
          (existing as Record<string, unknown>)[key] = m[key];
        }
      }
    }
  }
  await upsertHealthMetrics(userId, [...byDate.values()]);
  return { daysUpdated: byDate.size, tabs: imported };
}
