import type { GymExercise, GymSet, GymType } from "./types";

// Client-safe parser for the text the Strong app copies to the clipboard
// ("Compartir como texto"). Shape (Spanish or English locale):
//
//   Pull
//   miércoles, 8 de julio de 2026, 16:07
//
//   Deadlift (Barbell)
//   Serie 1: 20 kg × 12
//   Serie 2: 30 kg × 10
//   ...
//   https://link.strong.app/majwsbfa
//
// The header carries everything we can't get from the watch file — the split
// name (Pull/Push/…) and the exercises — and the timestamp lets us match the
// paste to an existing gym session without asking for a date.

export type ParsedStrongWorkout = {
  title: string;
  type: GymType | null; // inferred from the title, null if unrecognized
  startedAt: string; // local time, "YYYY-MM-DDTHH:MM" (same as manual entry)
  exercises: GymExercise[];
  link: string | null;
};

const MONTHS: Record<string, number> = {
  // Spanish
  enero: 1, febrero: 2, marzo: 3, abril: 4, mayo: 5, junio: 6, julio: 7,
  agosto: 8, septiembre: 9, setiembre: 9, octubre: 10, noviembre: 11, diciembre: 12,
  // English (full + common abbreviations)
  january: 1, february: 2, march: 3, april: 4, may: 5, june: 6, july: 7,
  august: 8, september: 9, october: 10, november: 11, december: 12,
  jan: 1, feb: 2, mar: 3, apr: 4, jun: 6, jul: 7,
  aug: 8, sep: 9, sept: 9, oct: 10, nov: 11, dec: 12,
};

// "miércoles, 8 de julio de 2026, 16:07" / "Wednesday, July 8, 2026, 4:07 PM"
// / "Wednesday, 8 July 2026, 16:07"
function parseDateLine(line: string): string | null {
  const lower = line.toLowerCase();

  const es = /(\d{1,2})\s+de\s+([a-zá-ú]+)\s+de\s+(\d{4})/.exec(lower);
  const mdy = /([a-z]+)\s+(\d{1,2}),\s*(\d{4})/.exec(lower); // July 8, 2026
  const dmy = /(\d{1,2})\s+([a-z]+),?\s+(\d{4})/.exec(lower); // 8 July 2026
  let day: number, month: number | undefined, year: number;
  if (es) {
    day = Number(es[1]);
    month = MONTHS[es[2]];
    year = Number(es[3]);
  } else if (mdy && MONTHS[mdy[1]]) {
    month = MONTHS[mdy[1]];
    day = Number(mdy[2]);
    year = Number(mdy[3]);
  } else if (dmy && MONTHS[dmy[2]]) {
    day = Number(dmy[1]);
    month = MONTHS[dmy[2]];
    year = Number(dmy[3]);
  } else {
    return null;
  }
  if (!month || day < 1 || day > 31) return null;

  let hour = 12, minute = 0; // midday default if the export has no time
  const time = /(\d{1,2}):(\d{2})(?:\s*(a\.?\s?m\.?|p\.?\s?m\.?))?/i.exec(line);
  if (time) {
    hour = Number(time[1]);
    minute = Number(time[2]);
    const ampm = time[3]?.toLowerCase().replace(/[.\s]/g, "");
    if (ampm === "pm" && hour < 12) hour += 12;
    if (ampm === "am" && hour === 12) hour = 0;
  }

  const pad = (n: number) => String(n).padStart(2, "0");
  return `${year}-${pad(month)}-${pad(day)}T${pad(hour)}:${pad(minute)}`;
}

// "Serie 1: 20 kg × 12" / "Set 1: 45 lb × 10" / "Serie 1: 12 reps"
const SET_LINE = /^(?:serie|set)\s*\d+\s*:\s*(.+)$/i;

function parseSet(body: string): GymSet | null {
  // Weight × reps. Strong uses a decimal comma in Spanish ("17,5 kg") and may
  // prefix added weight on bodyweight movements ("+5 kg × 12").
  const wr = /\+?\s*([\d]+(?:[.,]\d+)?)\s*(kg|lbs?)\s*[×x]\s*(\d+)/i.exec(body);
  if (wr) {
    let weight = Number(wr[1].replace(",", "."));
    if (/^lb/i.test(wr[2])) weight = Math.round(weight * 0.45359237 * 10) / 10;
    return { weightKg: weight, reps: Number(wr[3]) };
  }
  // Rep-only sets: "12 reps" / "12 repeticiones" / "× 12".
  const r = /(?:^|[×x]\s*)(\d+)\s*(?:reps?|repeticiones)?\s*$/i.exec(body.trim());
  if (r) return { weightKg: null, reps: Number(r[1]) };
  return null; // duration/distance sets etc. — skip, keep the exercise
}

// Best-effort split → GymType from the workout title.
export function gymTypeFromTitle(title: string): GymType | null {
  const t = title.toLowerCase();
  if (/\bpull\b|jal[oó]n|tir[oó]n/.test(t)) return "pull";
  if (/\bpush\b|empuje/.test(t)) return "push";
  if (/\blegs?\b|piernas?/.test(t)) return "legs";
  if (/upper|torso|superior/.test(t)) return "upper";
  if (/lower|inferior/.test(t)) return "lower";
  if (/full|completo|strength|fuerza/.test(t)) return "full_body";
  if (/core|abs|abdomen/.test(t)) return "core";
  if (/cardio|hiit|conditioning/.test(t)) return "cardio";
  return null;
}

export function parseStrongText(text: string): ParsedStrongWorkout {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);
  if (lines.length === 0) {
    throw new Error("Paste the workout text copied from Strong.");
  }

  let title = "";
  let startedAt: string | null = null;
  let link: string | null = null;
  const exercises: GymExercise[] = [];
  let current: GymExercise | null = null;

  for (const line of lines) {
    if (/^https?:\/\//i.test(line)) {
      link = line;
      continue;
    }
    const set = SET_LINE.exec(line);
    if (set) {
      if (!current) continue; // stray set line with no exercise header
      const parsed = parseSet(set[1]);
      if (parsed) current.sets.push(parsed);
      continue;
    }
    const date = parseDateLine(line);
    if (date && !startedAt) {
      startedAt = date;
      continue;
    }
    if (!title) {
      title = line;
      continue;
    }
    // Any other line starts a new exercise block.
    current = { name: line, sets: [] };
    exercises.push(current);
  }

  const withSets = exercises.filter((e) => e.sets.length > 0);
  if (!startedAt) {
    throw new Error(
      "Couldn't find the date in the pasted text — make sure you copy the whole workout, including the header."
    );
  }
  if (withSets.length === 0) {
    throw new Error("Couldn't find any exercises with sets in the pasted text.");
  }

  return {
    title: title || "Gym session",
    type: gymTypeFromTitle(title),
    startedAt,
    exercises: withSets,
    link,
  };
}

// Total volume (kg lifted) across all sets — weight-less sets contribute 0.
export function exercisesVolumeKg(exercises: GymExercise[]): number {
  let total = 0;
  for (const e of exercises) {
    for (const s of e.sets) total += (s.weightKg ?? 0) * s.reps;
  }
  return Math.round(total);
}

// Heaviest set of an exercise (for "top set" summaries and coach context).
export function topSet(e: GymExercise): GymSet | null {
  if (e.sets.length === 0) return null;
  return e.sets.reduce((best, s) => ((s.weightKg ?? 0) > (best.weightKg ?? 0) ? s : best));
}
