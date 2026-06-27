import type { RunRow, Goal, Plan, HrZone, GymSession, BodyMetric } from "./types";
import { formatPace, formatDuration, formatDistance } from "./parseRun";
import { resolveZones } from "./hr";
import { gymTypeLabel } from "./gym";
import { trainingLoad, LOAD_STATUS_LABEL } from "./trainingLoad";
import { runningRecords } from "./prs";
import { weeklyAdherence } from "./adherence";

// The model registry + guards now live in the import-free lib/coachDefs.ts
// (single source of truth, client-safe, also used by the provider layer and the
// bench). Re-exported so existing imports (`@/lib/coach`) keep working.
export {
  COACH_MODEL,
  COACH_MODELS,
  isCoachModel,
  resolveCoachModel,
  providerFor,
  supportsEffort,
} from "./coachDefs";
export type { CoachModelId, CoachProviderId } from "./coachDefs";

// (Anthropic client creation now lives in lib/providers/anthropic.ts.)

// The system prompt now lives in the import-free lib/coachDefs.ts (single source
// of truth, also used by the model bench). Re-exported here so existing imports
// (`@/lib/coach`) keep working unchanged.
export { SYSTEM_PROMPT } from "./coachDefs";

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
    if (g.projectedTimeSec) bits.push(`projected ${formatDuration(g.projectedTimeSec)}`);
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
  if (plan.macro?.instructions?.trim()) {
    out.push(
      `RUNNER'S PLAN INSTRUCTIONS (standing guidance written by the runner — always respect these and keep the plan consistent with them; you may edit them with set_plan_instructions if the runner asks):\n${plan.macro.instructions.trim()}`
    );
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

function buildHrContext(
  maxHr: number | null,
  lactateThresholdHr: number | null,
  zones: HrZone[]
): string {
  const z = zones.map((zn) => `${zn.name} ${zn.min}-${zn.max}`).join(", ");
  const meta = [
    maxHr ? `max HR ${maxHr}` : null,
    lactateThresholdHr ? `LTHR ${lactateThresholdHr}` : null,
  ].filter(Boolean);
  return `HR ZONES${meta.length ? ` (${meta.join(", ")})` : ""}: ${z}`;
}

// LTHR test status so the coach can recommend re-testing when one is due.
function buildLthrTestContext(
  lastTestOn: string | null,
  intervalWeeks: number | null,
  today: string
): string | null {
  if (!lastTestOn && !intervalWeeks) return null;
  const parts: string[] = [];
  if (lastTestOn) {
    const weeks = Math.floor((Date.parse(today) - Date.parse(lastTestOn)) / (7 * 86400000));
    parts.push(`Last LTHR test ${lastTestOn} (${weeks} week${weeks === 1 ? "" : "s"} ago).`);
    if (intervalWeeks) {
      const due = intervalWeeks - weeks;
      if (due <= 0) {
        parts.push(
          `Cadence every ${intervalWeeks} weeks → a re-test is DUE${
            due < 0 ? " (overdue)" : ""
          }. Recommend the runner do an LTHR test and log the result so their HR zones stay accurate.`
        );
      } else {
        parts.push(`Cadence every ${intervalWeeks} weeks → next test due in ~${due} week${due === 1 ? "" : "s"}.`);
      }
    }
  } else {
    parts.push(
      `No LTHR test logged yet, but a re-test cadence of every ${intervalWeeks} weeks is set. Recommend the runner do an LTHR test to set accurate HR zones.`
    );
  }
  return `LTHR TEST: ${parts.join(" ")}`;
}

// Compact, model-friendly summary of run history. Most recent first.
// Full per-run detail (HR, cadence, elevation, intervals, km splits).
function runDetail(r: RunRow, opts: { tag?: string; intervals?: boolean } = {}): string {
  const s = r.summary;
  const splits = s.splits.map((sp) => formatPace(sp.paceSecPerKm).replace("/km", "")).join(", ");
  const spm = r.avgCadence ? Math.round(r.avgCadence * 2) : null; // watch logs per-leg

  const laps = s.laps ?? [];
  const structured = new Set(laps.map((l) => l.intensity)).size > 1;
  const lapLine =
    opts.intervals && structured
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
    `- ${r.startedAt.slice(0, 10)} "${r.name}"${opts.tag ?? ""}: ${formatDistance(r.distanceM)} in ${formatDuration(
      r.durationSec
    )}, avg ${formatPace(r.avgPaceSecPerKm)}`,
    `    HR avg/max ${r.avgHr ? Math.round(r.avgHr) : "—"}/${r.maxHr ? Math.round(r.maxHr) : "—"}`,
    `, cadence ${spm ? `${spm} spm` : "—"}`,
    `, elev +${Math.round(r.elevGainM)}m`,
    s.avgVoMm ? `, VO ${s.avgVoMm.toFixed(0)}mm, GCT ${s.avgGctMs?.toFixed(0)}ms` : "",
    lapLine,
    splits ? `\n    km splits (min:sec): ${splits}` : "",
  ].join("");
}

// One-line run summary (no splits/intervals) for the lean default context.
function runOneLine(r: RunRow): string {
  return `- ${r.startedAt.slice(0, 10)} "${r.name}": ${formatDistance(r.distanceM)} in ${formatDuration(
    r.durationSec
  )}, ${formatPace(r.avgPaceSecPerKm)}, HR ${r.avgHr ? Math.round(r.avgHr) : "—"}`;
}

// FULL detailed history — only loaded on demand via the get_training_history
// tool, so most messages don't pay to re-read it.
export function buildRunsContext(runs: RunRow[], limit = 14): string {
  if (runs.length === 0) {
    return "RUN HISTORY: (no runs uploaded yet.)";
  }
  const recent = runs.slice(0, limit);
  const lines = recent.map((r, i) =>
    runDetail(r, { tag: i === 0 ? " [MOST RECENT]" : "", intervals: i === 0 || i === 1 })
  );
  const totalKm = runs.reduce((a, r) => a + r.distanceM, 0) / 1000;
  const header = `RUN HISTORY (${runs.length} runs, ${totalKm.toFixed(1)} km total). Showing latest ${recent.length}:`;
  return `${header}\n${lines.join("\n")}`;
}

// LEAN default: full detail for the most recent run (the one they likely want
// to discuss) + one-liners for a few prior runs. The coach calls
// get_training_history when it needs the deeper history (e.g. to build a plan).
export function buildRecentRunsContext(runs: RunRow[], recentDetail = 1, summarized = 5): string {
  if (runs.length === 0) {
    return "RUN HISTORY: (no runs uploaded yet.)";
  }
  const totalKm = runs.reduce((a, r) => a + r.distanceM, 0) / 1000;
  const detailed = runs.slice(0, recentDetail).map((r, i) =>
    runDetail(r, { tag: i === 0 ? " [MOST RECENT]" : "", intervals: true })
  );
  const rest = runs.slice(recentDetail, recentDetail + summarized).map(runOneLine);
  return [
    `RUN HISTORY (${runs.length} runs, ${totalKm.toFixed(1)} km total). Latest shown in detail; a few prior runs summarized. ` +
      `Call get_training_history for full per-run detail (splits/intervals across more runs) when building or revising a plan or analyzing trends.`,
    detailed.join("\n"),
    rest.length ? `EARLIER RUNS:\n${rest.join("\n")}` : "",
  ]
    .filter(Boolean)
    .join("\n");
}

// Compact summary of recent gym/strength sessions. Most recent first.
export function buildGymContext(sessions: GymSession[], limit = 12): string {
  if (sessions.length === 0) {
    return "GYM / STRENGTH HISTORY: (none uploaded yet.)";
  }
  const recent = sessions.slice(0, limit);
  const lines = recent.map((g, i) => {
    const tag = i === 0 ? " [MOST RECENT]" : "";
    const bits = [
      `- ${g.startedAt.slice(0, 10)} "${g.name}"${tag}: ${gymTypeLabel(g.type)}, ${formatDuration(
        g.durationSec
      )}`,
      g.rpe != null ? `RPE ${g.rpe}/10` : null,
      g.avgHr != null ? `HR avg ${Math.round(g.avgHr)}` : null,
      g.calories != null ? `${Math.round(g.calories)} kcal` : null,
      g.notes ? `note: ${g.notes}` : null,
    ].filter(Boolean);
    return bits.join(", ");
  });
  return `GYM / STRENGTH HISTORY (${sessions.length} sessions). Showing latest ${recent.length}:\n${lines.join(
    "\n"
  )}`;
}

// Acute:chronic load + recent weekly volume, so the coach can flag risky ramps.
function buildLoadContext(runs: RunRow[]): string | null {
  const load = trainingLoad(runs);
  if (load.ratio == null) return null;
  const weeks = load.weeks.map((w) => `${w.km}`).join("/");
  return (
    `TRAINING LOAD: last 7 days ${load.acuteKm} km vs 4-week avg ${load.chronicKm} km/wk → ` +
    `acute:chronic ratio ${load.ratio} (${LOAD_STATUS_LABEL[load.status]}). ` +
    `Sweet spot is 0.8–1.3; >1.5 is a risky spike, <0.8 is detraining. Last 6 weeks (km): ${weeks}.`
  );
}

// Personal records + Riegel predictions for race planning.
function buildRecordsContext(runs: RunRow[]): string | null {
  const { efforts, predictions } = runningRecords(runs);
  if (efforts.length === 0) return null;
  const prs = efforts
    .map((e) => `${e.label} ${formatDuration(e.timeSec)} (${formatPace(e.paceSecPerKm)}, ${e.date})`)
    .join("; ");
  const pred = predictions.length
    ? ` Predicted (Riegel, no PR yet): ${predictions
        .map((p) => `${p.label} ~${formatDuration(p.timeSec)}`)
        .join("; ")}.`
    : "";
  return `PERSONAL RECORDS (best efforts): ${prs}.${pred}`;
}

// How this week's actual sessions match the plan.
function buildAdherenceContext(plan: Plan, runs: RunRow[], gymSessions: GymSession[]): string | null {
  const a = weeklyAdherence(plan.weekly, runs, gymSessions);
  if (!a || a.plannedCount === 0) return null;
  if (a.upcoming) {
    return `PLAN ADHERENCE: the current weekly plan is for the week of ${a.weekStart}, which hasn't started yet — no sessions due before then.`;
  }
  const missed = a.items
    .filter((it) => !it.rest && !it.done)
    .map((it) => `${it.day} ${it.title}`)
    .join(", ");
  return (
    `PLAN ADHERENCE (week of ${a.weekStart}): ${a.doneCount}/${a.plannedCount} planned sessions done` +
    (missed ? `. Still outstanding: ${missed}.` : ".")
  );
}

function buildBodyMetricContext(m: BodyMetric | null): string | null {
  if (!m) return null;
  const bits = [
    m.restingHr != null ? `resting HR ${m.restingHr} bpm` : null,
    m.weightKg != null ? `weight ${m.weightKg} kg` : null,
  ].filter(Boolean);
  if (bits.length === 0) return null;
  return `BODY METRICS (latest, ${m.recordedOn}): ${bits.join(", ")}.`;
}

export function buildContextBlock(opts: {
  goals: Goal[];
  plan: Plan;
  runs: RunRow[];
  gymSessions?: GymSession[];
  userName?: string | null;
  maxHr?: number | null;
  lactateThresholdHr?: number | null;
  hrZones?: HrZone[] | null;
  lastLthrTestOn?: string | null;
  lthrTestIntervalWeeks?: number | null;
  bodyMetric?: BodyMetric | null;
}): string {
  const today = new Date().toISOString().slice(0, 10);
  const zones = resolveZones(opts.maxHr ?? null, opts.hrZones ?? null);
  const gym = opts.gymSessions ?? [];
  return [
    opts.userName ? `Runner's name: ${opts.userName}` : null,
    `Today's date: ${today}`,
    "",
    buildGoalsContext(opts.goals),
    "",
    buildPlanContext(opts.plan),
    "",
    buildAdherenceContext(opts.plan, opts.runs, gym),
    "",
    buildHrContext(opts.maxHr ?? null, opts.lactateThresholdHr ?? null, zones),
    buildLthrTestContext(opts.lastLthrTestOn ?? null, opts.lthrTestIntervalWeeks ?? null, today),
    buildBodyMetricContext(opts.bodyMetric ?? null),
    "",
    buildLoadContext(opts.runs),
    buildRecordsContext(opts.runs),
    "",
    buildRecentRunsContext(opts.runs),
    "",
    buildGymContext(gym, 5),
  ]
    .filter((l) => l !== null)
    .join("\n");
}
