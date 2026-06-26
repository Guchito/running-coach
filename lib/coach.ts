import Anthropic from "@anthropic-ai/sdk";
import type { RunRow, Goal } from "./types";
import { formatPace, formatDuration, formatDistance } from "./parseRun";

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

Your job:
- Help the runner set and pursue a concrete goal (a race distance, a target time, by a target date).
- Analyze each run they upload: pacing, heart-rate effort, cadence, splits, consistency, and how it fits their goal.
- Give specific, actionable, encouraging feedback. Reference real numbers from their data (paces, HR, splits). Never invent data you weren't given.
- Suggest what to do next: the next workout, recovery, or an adjustment to the plan. Keep the runner motivated but honest.
- When their fitness clearly changes, proactively suggest updating the goal (e.g. a more ambitious target time, or a more realistic date).

Style: warm, concise, and practical. Use short paragraphs and the occasional bullet list. Use pace as min/km and distances in km. Avoid medical claims; suggest seeing a professional for pain or health concerns. Assume metric units.

You are given the runner's current goal and a summary of their run history as context. Treat the most recently uploaded run as the one they most likely want to discuss unless they say otherwise.`;

function paceFromTimeDist(timeSec: number | null, distM: number | null): string {
  if (!timeSec || !distM) return "—";
  return formatPace((timeSec / distM) * 1000);
}

export function buildGoalContext(goal: Goal | null): string {
  if (!goal) {
    return "GOAL: (none set yet — encourage the runner to set one, and help them pick a realistic target.)";
  }
  const parts = [`GOAL: ${goal.title}`, `  Race type: ${goal.raceType}`];
  if (goal.targetDistanceM) parts.push(`  Target distance: ${formatDistance(goal.targetDistanceM)}`);
  if (goal.targetTimeSec) {
    parts.push(
      `  Target time: ${formatDuration(goal.targetTimeSec)} (${paceFromTimeDist(
        goal.targetTimeSec,
        goal.targetDistanceM
      )} pace)`
    );
  }
  if (goal.targetDate) parts.push(`  Target date: ${goal.targetDate}`);
  if (goal.notes) parts.push(`  Notes: ${goal.notes}`);
  return parts.join("\n");
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
    return [
      `- ${r.startedAt.slice(0, 10)} "${r.name}"${tag}: ${formatDistance(r.distanceM)} in ${formatDuration(
        r.durationSec
      )}, avg ${formatPace(r.avgPaceSecPerKm)}`,
      `    HR avg/max ${r.avgHr ? Math.round(r.avgHr) : "—"}/${r.maxHr ? Math.round(r.maxHr) : "—"}`,
      `, cadence ${r.avgCadence ? Math.round(r.avgCadence) : "—"}`,
      `, elev +${Math.round(r.elevGainM)}m`,
      s.avgVoMm ? `, VO ${s.avgVoMm.toFixed(0)}mm, GCT ${s.avgGctMs?.toFixed(0)}ms` : "",
      splits ? `\n    km splits (min:sec): ${splits}` : "",
    ].join("");
  });

  const totalKm = runs.reduce((a, r) => a + r.distanceM, 0) / 1000;
  const header = `RUN HISTORY (${runs.length} runs, ${totalKm.toFixed(1)} km total). Showing latest ${recent.length}:`;
  return `${header}\n${lines.join("\n")}`;
}

export function buildContextBlock(goal: Goal | null, runs: RunRow[]): string {
  const today = new Date().toISOString().slice(0, 10);
  return [
    `Today's date: ${today}`,
    "",
    buildGoalContext(goal),
    "",
    buildRunsContext(runs),
  ].join("\n");
}
