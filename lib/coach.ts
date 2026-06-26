import Anthropic from "@anthropic-ai/sdk";
import type { RunRow, Goal, Plan, HrZone } from "./types";
import { formatPace, formatDuration, formatDistance } from "./parseRun";
import { resolveZones } from "./hr";

export const COACH_MODEL = process.env.COACH_MODEL || "claude-opus-4-8";

export function getClient(): Anthropic {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error(
      "ANTHROPIC_API_KEY is not set. Add it to .env.local in the project root."
    );
  }
  return new Anthropic({ apiKey });
}

export const SYSTEM_PROMPT = `You are an expert running coach embedded in a personal training app. You speak directly to one runner (the user) whose Apple Watch run data you can see.

Your responsibilities:
1. ANALYZE every run they upload — pacing, heart-rate effort, cadence, splits, intervals, consistency — and give specific, encouraging, honest feedback that cites their real numbers. Never invent data you weren't given.
2. MANAGE their goals. They may have several at once (e.g. a half marathon in 4 months and a marathon in 9 months). Use the goal tools to create/update/remove goals. IMPORTANT: before you change the target time or date of an EXISTING goal, discuss it with the runner and get their agreement in the conversation first. Creating a new goal they asked for, or marking one achieved/abandoned, is fine to do directly. When their fitness clearly shifts, proactively raise it ("I think a sub-1:30 half is realistic now — want me to update that goal?") and only change it once they agree.
3. MAINTAIN their training plans with the plan tools:
   - The MACRO plan is the long-term, periodized plan and MUST account for ALL active goals together (sequence phases so they peak for each race in turn).
   - The WEEKLY plan is this week's concrete workouts.
   Keep both current: whenever goals change, or a new run shows their fitness/availability is different from what the plan assumed, update the relevant plan. If a run shows they're ahead of schedule, progress the plan; if behind or fatigued, ease it.

When you call a tool, briefly tell the runner what you changed and why. Don't dump raw JSON.

Style: warm, concise, practical. Short paragraphs and occasional bullet lists. Pace as min/km, distances in km, metric units. Avoid medical claims; suggest seeing a professional for pain or health concerns.

You are given the runner's goals, current plans, HR zones, and run history as context, refreshed every message. Treat the most recently uploaded run as the one they most likely want to discuss unless they say otherwise.`;

function paceFromTimeDist(timeSec: number | null, distM: number | null): string {
  if (!timeSec || !distM) return "—";
  return formatPace((timeSec / distM) * 1000);
}

export function buildGoalsContext(goals: Goal[]): string {
  const active = goals.filter((g) => g.status === "active");
  if (active.length === 0 && goals.length === 0) {
    return "GOALS: (none set yet — encourage the runner to set one or more, and help them pick realistic targets.)";
  }
  const lines = goals.map((g) => {
    const bits = [`[id ${g.id}] ${g.title} (${g.raceType}, ${g.status})`];
    if (g.targetTimeSec)
      bits.push(
        `target ${formatDuration(g.targetTimeSec)} @ ${paceFromTimeDist(g.targetTimeSec, g.targetDistanceM)}`
      );
    if (g.targetDistanceM) bits.push(formatDistance(g.targetDistanceM));
    if (g.targetDate) bits.push(`by ${g.targetDate}`);
    if (g.notes) bits.push(`notes: ${g.notes}`);
    return `- ${bits.join(", ")}`;
  });
  return `GOALS (${active.length} active):\n${lines.join("\n")}`;
}

export function buildPlanContext(plan: Plan): string {
  const out: string[] = [];
  if (plan.macro) {
    const phases = plan.macro.phases
      .map(
        (p) =>
          `  • ${p.name}${p.start ? ` (${p.start}→${p.end ?? "?"})` : ""}: ${p.focus}${
            p.weeklyKm ? ` ~${p.weeklyKm}km/wk` : ""
          }`
      )
      .join("\n");
    out.push(`MACRO PLAN: ${plan.macro.summary}\n${phases}`);
  } else {
    out.push("MACRO PLAN: (none yet — create one with set_macro_plan once goals exist.)");
  }
  if (plan.weekly) {
    const days = plan.weekly.days
      .map((d) => `  • ${d.day}: ${d.title} (${d.type}${d.distanceKm ? `, ${d.distanceKm}km` : ""})`)
      .join("\n");
    out.push(`WEEKLY PLAN: ${plan.weekly.summary}\n${days}`);
  } else {
    out.push("WEEKLY PLAN: (none yet — create one with set_weekly_plan.)");
  }
  return out.join("\n\n");
}

function buildHrContext(maxHr: number | null, zones: HrZone[]): string {
  const z = zones.map((zn) => `${zn.name} ${zn.min}-${zn.max}`).join(", ");
  return `HR ZONES${maxHr ? ` (max HR ${maxHr})` : ""}: ${z}`;
}

// Compact, model-friendly summary of run history. Most recent first.
export function buildRunsContext(runs: RunRow[], limit = 20): string {
  if (runs.length === 0) {
    return "RUN HISTORY: (no runs uploaded yet.)";
  }
  const recent = runs.slice(0, limit);
  const lines = recent.map((r, i) => {
    const tag = i === 0 ? " [MOST RECENT]" : "";
    const s = r.summary;
    const splits = s.splits.map((sp) => formatPace(sp.paceSecPerKm).replace("/km", "")).join(", ");
    const spm = r.avgCadence ? Math.round(r.avgCadence * 2) : null; // watch logs per-leg

    const laps = s.laps ?? [];
    const structured = new Set(laps.map((l) => l.intensity)).size > 1;
    const lapLine =
      structured && (i === 0 || i === 1)
        ? `\n    intervals: ${laps
            .map(
              (l) =>
                `${l.intensity} ${formatDistance(l.distanceM)}/${formatDuration(
                  l.durationSec
                )}@${formatPace(l.paceSecPerKm).replace("/km", "")}${l.avgHr ? ` HR${l.avgHr}` : ""}`
            )
            .join(" | ")}`
        : "";

    return [
      `- ${r.startedAt.slice(0, 10)} "${r.name}"${tag}: ${formatDistance(r.distanceM)} in ${formatDuration(
        r.durationSec
      )}, avg ${formatPace(r.avgPaceSecPerKm)}`,
      `    HR avg/max ${r.avgHr ? Math.round(r.avgHr) : "—"}/${r.maxHr ? Math.round(r.maxHr) : "—"}`,
      `, cadence ${spm ? `${spm} spm` : "—"}`,
      `, elev +${Math.round(r.elevGainM)}m`,
      s.avgVoMm ? `, VO ${s.avgVoMm.toFixed(0)}mm, GCT ${s.avgGctMs?.toFixed(0)}ms` : "",
      lapLine,
      splits ? `\n    km splits (min:sec): ${splits}` : "",
    ].join("");
  });

  const totalKm = runs.reduce((a, r) => a + r.distanceM, 0) / 1000;
  const header = `RUN HISTORY (${runs.length} runs, ${totalKm.toFixed(1)} km total). Showing latest ${recent.length}:`;
  return `${header}\n${lines.join("\n")}`;
}

export function buildContextBlock(opts: {
  goals: Goal[];
  plan: Plan;
  runs: RunRow[];
  userName?: string | null;
  maxHr?: number | null;
  hrZones?: HrZone[] | null;
}): string {
  const today = new Date().toISOString().slice(0, 10);
  const zones = resolveZones(opts.maxHr ?? null, opts.hrZones ?? null);
  return [
    opts.userName ? `Runner's name: ${opts.userName}` : null,
    `Today's date: ${today}`,
    "",
    buildGoalsContext(opts.goals),
    "",
    buildPlanContext(opts.plan),
    "",
    buildHrContext(opts.maxHr ?? null, zones),
    "",
    buildRunsContext(opts.runs),
  ]
    .filter((l) => l !== null)
    .join("\n");
}
