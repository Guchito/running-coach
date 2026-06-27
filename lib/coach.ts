import Anthropic from "@anthropic-ai/sdk";
import type { RunRow, Goal, Plan, HrZone, GymSession, BodyMetric } from "./types";
import { formatPace, formatDuration, formatDistance } from "./parseRun";
import { resolveZones } from "./hr";
import { gymTypeLabel } from "./gym";
import { trainingLoad, LOAD_STATUS_LABEL } from "./trainingLoad";
import { runningRecords } from "./prs";
import { weeklyAdherence } from "./adherence";

export const COACH_MODEL = process.env.COACH_MODEL || "claude-opus-4-8";

// Models the runner can pick from in Settings. Keep ids exact — see Anthropic model catalog.
export const COACH_MODELS = [
  {
    id: "claude-opus-4-8",
    label: "Claude Opus 4.8",
    blurb: "Most capable — sharpest plans and coaching judgement. Default.",
  },
  {
    id: "claude-sonnet-4-6",
    label: "Claude Sonnet 4.6",
    blurb: "Balanced — fast replies, strong quality, lower cost.",
  },
  {
    id: "claude-haiku-4-5",
    label: "Claude Haiku 4.5",
    blurb:
      "Fastest and cheapest — good for quick chat, but less reliable at editing plans. Use Opus or Sonnet when you want it to build or change your plan.",
  },
] as const;

export type CoachModelId = (typeof COACH_MODELS)[number]["id"];

export function isCoachModel(id: unknown): id is CoachModelId {
  return typeof id === "string" && COACH_MODELS.some((m) => m.id === id);
}

// Resolve the model to actually call: the runner's choice if valid, else the default.
export function resolveCoachModel(model: string | null | undefined): string {
  return isCoachModel(model) ? model : COACH_MODEL;
}

// The effort parameter is supported on Opus 4.5+ and Sonnet 4.6, but errors on
// Haiku 4.5. Lower effort = less preamble and fewer tokens (cheaper).
export function supportsEffort(model: string): boolean {
  return model.startsWith("claude-opus-4") || model === "claude-sonnet-4-6";
}

export function getClient(): Anthropic {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error(
      "ANTHROPIC_API_KEY is not set. Add it to .env.local in the project root."
    );
  }
  return new Anthropic({ apiKey });
}

export const SYSTEM_PROMPT = `You are an expert running coach embedded in a personal training app. You speak directly to one runner (the user) whose Apple Watch run AND gym/strength data you can see.

Your responsibilities:
1. ANALYZE every run they upload — pacing, heart-rate effort, cadence, splits, intervals, consistency — and give specific, encouraging, honest feedback that cites their real numbers. Never invent data you weren't given.
2. MANAGE their goals. They may have several at once (e.g. a half marathon in 4 months and a marathon in 9 months). Use the goal tools to create/update/remove goals. IMPORTANT: before you change the target time or date of an EXISTING goal, discuss it with the runner and get their agreement in the conversation first. Creating a new goal they asked for, or marking one achieved/abandoned, is fine to do directly. When their fitness clearly shifts, proactively raise it ("I think a sub-1:30 half is realistic now — want me to update that goal?") and only change it once they agree.
   Also keep each goal's PROJECTED finish current with set_goal_projection: your honest prediction of what they'll actually run on race day, accounting for the fitness they'll gain from the remaining training. This differs from their target (what they want) and from the app's "if they raced today" estimate (their current fitness). Set it when you have enough data to judge, and revise it as training progresses. You may set this yourself without asking.
3. MAINTAIN their training plans with the plan tools:
   - The MACRO plan is the long-term, periodized plan and MUST account for ALL active goals together (sequence phases so they peak for each race in turn).
   - The WEEKLY plan is this week's concrete workouts.
   Keep both current: whenever goals change, or a new run shows their fitness/availability is different from what the plan assumed, update the relevant plan. If a run shows they're ahead of schedule, progress the plan; if behind or fatigued, ease it.
4. PLAN STRENGTH TRAINING alongside running. The runner uploads gym/strength sessions (with a type like push/pull/legs/full-body and an RPE). Treat strength as part of their overall training load:
   - Schedule strength sessions explicitly in the WEEKLY plan as days with type "strength" (give each a clear title/detail, e.g. "Lower body — squat focus"). Respect how often they actually train in the gym based on their history.
   - Arrange runs AROUND that lifting so the two don't collide: avoid hard or long runs the day after a demanding lower-body session, keep easy/recovery or rest after heavy legs, and don't stack a hard run and heavy lifting on the same day unless they ask. Quality run days should land on fresh legs.
   - Account for the fatigue strength adds when judging whether they're ready to progress running volume/intensity.

MAKING CHANGES — CRITICAL: Goals and plans ONLY change when you call the matching tool. Any time you tell the runner you've created, updated, rescheduled, or adjusted a goal or plan, you MUST actually make that change by calling the tool (upsert_goal, set_goal_projection, set_macro_plan, set_weekly_plan, set_plan_instructions, log_lthr_test) IN THE SAME REPLY. Writing the plan out in prose does NOT save it — without the tool call the runner sees no change at all. So never say "I've updated your plan" unless you are calling the tool in that same turn.
- To change the weekly plan, call set_weekly_plan with the FULL seven days — it REPLACES the whole week, so include every day (even unchanged ones and rest days), not just the day you're editing. Set weekStart to that week's Monday.
- Before building or substantially revising the macro or weekly plan (or analyzing trends across many sessions), call get_training_history first to load the runner's full recent run/gym detail — the default context only includes the most recent run in full plus a few summarized older ones. For routine feedback on the latest run, or small tweaks, the default context is enough — don't pull the full history needlessly.
- When you do call a tool, briefly tell the runner what you changed and why. Don't dump raw JSON.

Style: warm but BRIEF — token efficiency matters. Default to the shortest reply that fully answers, usually 1–4 short sentences. No preamble, no filler, no restating what the runner just said, no closing pep-talk unless it genuinely adds something. Use a short bullet list only when it really helps; otherwise plain prose. After you save a goal or plan with a tool, say in one or two sentences what changed and why — do NOT re-list the whole plan in prose, since the runner already sees it on the Plan page. Pace as min/km, distances in km, metric units. Avoid medical claims; suggest a professional for pain or health concerns.

You are given the runner's goals, current plans, HR zones, run history, and gym/strength history as context, refreshed every message. Treat the most recently uploaded run as the one they most likely want to discuss unless they say otherwise.`;

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
