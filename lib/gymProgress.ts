import type { GymSession, GymSet } from "./types";
import { topSet } from "./parseStrong";

// Client-safe helpers for tracking one exercise across gym sessions: history
// extraction, previous-vs-current comparison, and formatting. All pure — the
// session detail page and the per-exercise history page share them.

// Strong and Hevy name the same movements differently; map every known
// variant to one canonical key so an exercise's history survives switching
// apps. Both sides are already normalized (lowercase, single spaces). The
// canonical side is the Strong-era name only because that's what the oldest
// stored sessions use — display always shows the newest spelling.
const EXERCISE_ALIASES: Record<string, string> = {
  // Pull
  "seated cable row - bar grip": "seated row (cable)",
  "dumbbell row": "bent over one arm row (dumbbell)",
  "rear delt reverse fly (machine)": "reverse fly (machine)",
  // Push
  "cable fly crossovers": "cable crossover",
  // The Jul 12 session was logged as "rope" by mistake, then the exercise was
  // renamed to plain "Triceps Pushdown" in Hevy — all three are the same lift.
  "triceps rope pushdown": "triceps pushdown (cable - straight bar)",
  "triceps pushdown": "triceps pushdown (cable - straight bar)",
  // Legs
  "straight leg deadlift": "stiff leg deadlift (dumbbell)",
  "calf press (machine)": "calf press on seated leg press",
  "bulgarian split squat (dumbbell)": "bulgarian split squat",
};

// Sessions log the same movement with slightly different casing/spacing;
// progression must not fork on that.
export function exerciseKey(name: string): string {
  const base = name.trim().toLowerCase().replace(/\s+/g, " ");
  return EXERCISE_ALIASES[base] ?? base;
}

// Estimated one-rep max (Epley). Null for bodyweight/rep-only sets.
export function epley1Rm(s: GymSet): number | null {
  if (s.weightKg == null || s.weightKg <= 0) return null;
  if (s.reps <= 1) return s.weightKg;
  return s.weightKg * (1 + s.reps / 30);
}

export function volumeOf(sets: GymSet[]): number {
  return sets.reduce((t, s) => t + (s.weightKg ?? 0) * s.reps, 0);
}

// "17.5" not "17.50", "40" not "40.0". Volume-sized numbers get thousands
// separators via toLocaleString at the call site.
export function formatKg(v: number): string {
  const rounded = Math.round(v * 10) / 10;
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
}

// Timed holds: "3:38" (m:ss).
export function formatHold(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = Math.round(sec % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

// One exercise's appearance in one session.
export type ExerciseEntry = {
  sessionId: number;
  sessionName: string;
  date: string; // session startedAt (ISO)
  sets: GymSet[];
  top: GymSet | null;
  e1Rm: number | null; // best estimated 1RM across the entry's sets
  volumeKg: number;
};

export type ExerciseHistory = {
  name: string; // display name (most recent spelling)
  entries: ExerciseEntry[]; // oldest → newest
};

// Full per-exercise history across every session that has pasted exercises.
export function buildExerciseHistory(sessions: GymSession[]): Map<string, ExerciseHistory> {
  const byKey = new Map<string, ExerciseHistory>();
  const sorted = [...sessions]
    .filter((s) => s.exercises && s.exercises.length > 0)
    .sort((a, b) => new Date(a.startedAt).getTime() - new Date(b.startedAt).getTime());

  for (const session of sorted) {
    for (const ex of session.exercises!) {
      if (ex.sets.length === 0) continue;
      const key = exerciseKey(ex.name);
      const top = topSet(ex);
      const e1Rm = ex.sets.reduce<number | null>((best, s) => {
        const v = epley1Rm(s);
        return v != null && (best == null || v > best) ? v : best;
      }, null);
      const entry: ExerciseEntry = {
        sessionId: session.id,
        sessionName: session.name,
        date: session.startedAt,
        sets: ex.sets,
        top,
        e1Rm,
        volumeKg: volumeOf(ex.sets),
      };
      const hist = byKey.get(key);
      if (hist) {
        hist.name = ex.name; // newest spelling wins
        hist.entries.push(entry);
      } else {
        byKey.set(key, { name: ex.name, entries: [entry] });
      }
    }
  }
  return byKey;
}

// How the current entry moved against the previous one. Top-set weight is the
// athlete's headline; reps break the tie when the weight held; volume breaks
// it when both held.
export type ProgressDelta =
  | { kind: "first" }
  | { kind: "weight"; diffKg: number }
  | { kind: "duration"; diffSec: number }
  | { kind: "reps"; diff: number }
  | { kind: "volume"; diffKg: number }
  | { kind: "same" };

export function compareEntries(prev: ExerciseEntry | null, cur: ExerciseEntry): ProgressDelta {
  if (!prev) return { kind: "first" };
  const pw = prev.top?.weightKg ?? null;
  const cw = cur.top?.weightKg ?? null;
  if (pw != null && cw != null && Math.abs(cw - pw) >= 0.05) {
    return { kind: "weight", diffKg: Math.round((cw - pw) * 10) / 10 };
  }
  // Timed holds progress on the longest hold.
  const pd = prev.top?.durationSec ?? null;
  const cd = cur.top?.durationSec ?? null;
  if (pd != null && cd != null && cd !== pd) {
    return { kind: "duration", diffSec: cd - pd };
  }
  const pr = prev.top?.reps ?? null;
  const cr = cur.top?.reps ?? null;
  if (pr != null && cr != null && cr !== pr) {
    return { kind: "reps", diff: cr - pr };
  }
  const dv = Math.round(cur.volumeKg - prev.volumeKg);
  if (Math.abs(dv) >= 1) return { kind: "volume", diffKg: dv };
  return { kind: "same" };
}

// Entry index for a given session inside a history (or -1).
export function entryIndexForSession(hist: ExerciseHistory, sessionId: number): number {
  return hist.entries.findIndex((e) => e.sessionId === sessionId);
}

// Compact one-line set summary: "20×12 · 30×10 · 40×8", holds as "3:38".
export function setsSummary(sets: GymSet[]): string {
  return sets
    .map((s) =>
      s.weightKg != null
        ? `${formatKg(s.weightKg)}×${s.reps}`
        : s.durationSec != null
        ? formatHold(s.durationSec)
        : `×${s.reps}`
    )
    .join(" · ");
}
