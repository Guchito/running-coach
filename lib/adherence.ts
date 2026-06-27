import type { WeeklyPlan, RunRow, GymSession } from "./types";

// How well actual sessions this week match the planned week. Planned run days
// are met by a run that weekday; strength days by a gym session; cross days by
// either. Rest days don't count toward the total.

export type AdherenceItem = {
  day: string; // Mon..Sun
  type: string;
  title: string;
  rest: boolean;
  done: boolean;
};

export type Adherence = {
  items: AdherenceItem[];
  doneCount: number;
  plannedCount: number;
  weekStart: string; // YYYY-MM-DD (Monday) the adherence is measured over
  upcoming: boolean; // the plan's week hasn't started yet
};

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const RUN_TYPES = new Set(["easy", "tempo", "intervals", "long", "recovery", "race"]);

function weekdayLabel(d: Date): string {
  return DAYS[(d.getDay() + 6) % 7];
}

function startOfWeek(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  x.setDate(x.getDate() - ((x.getDay() + 6) % 7));
  return x;
}

function parseLocalDate(s: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) return null;
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
}

function isoDate(d: Date): string {
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}

export function weeklyAdherence(
  weekly: WeeklyPlan | null,
  runs: RunRow[],
  gymSessions: GymSession[],
  now: number = Date.now()
): Adherence | null {
  if (!weekly || weekly.days.length === 0) return null;

  // Anchor to the PLAN's own week (its Monday), not whatever week today is in —
  // the coach may have written next week's plan in advance.
  const parsed = weekly.weekStart ? parseLocalDate(weekly.weekStart) : null;
  const weekStartDate = startOfWeek(parsed ?? new Date(now));
  const weekStart = weekStartDate.getTime();
  const weekEnd = weekStart + 7 * 86400000;
  const upcoming = weekStart > now;

  // Which weekdays this week saw a run / a gym session.
  const runDays = new Set<string>();
  const gymDays = new Set<string>();
  for (const r of runs) {
    const t = Date.parse(r.startedAt);
    if (t >= weekStart && t < weekEnd) runDays.add(weekdayLabel(new Date(t)));
  }
  for (const g of gymSessions) {
    const t = Date.parse(g.startedAt);
    if (t >= weekStart && t < weekEnd) gymDays.add(weekdayLabel(new Date(t)));
  }

  let doneCount = 0;
  let plannedCount = 0;
  const items: AdherenceItem[] = weekly.days.map((d) => {
    const rest = d.type === "rest";
    let done = false;
    if (!rest) {
      plannedCount += 1;
      if (d.type === "strength") done = gymDays.has(d.day);
      else if (d.type === "cross") done = gymDays.has(d.day) || runDays.has(d.day);
      else if (RUN_TYPES.has(d.type)) done = runDays.has(d.day);
      else done = runDays.has(d.day) || gymDays.has(d.day);
      if (done) doneCount += 1;
    }
    return { day: d.day, type: d.type, title: d.title, rest, done };
  });

  return { items, doneCount, plannedCount, weekStart: isoDate(weekStartDate), upcoming };
}
