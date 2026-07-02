// Pure coach definitions: the system prompt and the tool schemas.
//
// This module has NO runtime imports (only a type-only Anthropic import, which
// is erased at build time). That keeps it importable from anywhere — the app,
// and standalone scripts like the model bench in /bench — without dragging in
// the database, parsers, or other app code. Treat this as the single source of
// truth for the coach's prompt and tools; lib/coach.ts and lib/coachTools.ts
// re-export from here.
import type Anthropic from "@anthropic-ai/sdk";

// The default model when the runner hasn't picked one. This is the free NVIDIA
// model: Claude is paid and requires each runner to add their own API key in
// Settings, so the out-of-the-box default must be a free option.
export const COACH_MODEL =
  process.env.COACH_MODEL || "mistralai/mistral-large-3-675b-instruct-2512";

export type CoachProviderId = "anthropic" | "nvidia";

// Models the runner can pick from in Settings.
// - anthropic: Claude models (paid). Each runner adds their OWN Anthropic API key
//   in Settings; requests are billed to that key. Without a key these are unusable.
// - nvidia: free models on build.nvidia.com via NVIDIA_API_KEY (OpenAI-compatible).
//   Ids were live-probed + tool-call benchmarked (see /bench) on 2026-06-27.
export const COACH_MODELS = [
  {
    id: "claude-opus-4-8",
    provider: "anthropic",
    label: "Claude Opus 4.8",
    blurb: "Most capable — sharpest plans and coaching judgement. Needs your own Anthropic API key (paid).",
  },
  {
    id: "claude-sonnet-4-6",
    provider: "anthropic",
    label: "Claude Sonnet 4.6",
    blurb: "Balanced — fast replies, strong quality, lower cost. Needs your own Anthropic API key (paid).",
  },
  {
    id: "claude-haiku-4-5",
    provider: "anthropic",
    label: "Claude Haiku 4.5",
    blurb:
      "Fastest and cheapest — good for quick chat, but less reliable at editing plans. Use Opus or Sonnet when you want it to build or change your plan.",
  },
  {
    id: "mistralai/mistral-large-3-675b-instruct-2512",
    provider: "nvidia",
    label: "Mistral Large 3 · Free",
    blurb:
      "Free — no API key needed. Fast and the most reliable free model at building and editing plans. Recommended free option.",
  },
  {
    id: "nvidia/nvidia-nemotron-nano-9b-v2",
    provider: "nvidia",
    label: "Nemotron Nano 9B · Free",
    blurb:
      "Free — no API key needed. Reliable at plans, but noticeably slower (it reasons before replying).",
  },
] as const satisfies readonly { id: string; provider: CoachProviderId; label: string; blurb: string }[];

export type CoachModelId = (typeof COACH_MODELS)[number]["id"];

export function isCoachModel(id: unknown): id is CoachModelId {
  return typeof id === "string" && COACH_MODELS.some((m) => m.id === id);
}

// Resolve the model to actually call: the runner's choice if valid, else the default.
export function resolveCoachModel(model: string | null | undefined): string {
  return isCoachModel(model) ? model : COACH_MODEL;
}

// Which provider serves a given model id (defaults to anthropic for unknown ids).
export function providerFor(model: string): CoachProviderId {
  return COACH_MODELS.find((m) => m.id === model)?.provider ?? "anthropic";
}

// The Anthropic `effort` parameter is supported on Opus 4.5+ and Sonnet 4.6, but
// errors on Haiku 4.5. Lower effort = less preamble and fewer tokens (cheaper).
export function supportsEffort(model: string): boolean {
  return model.startsWith("claude-opus-4") || model === "claude-sonnet-4-6";
}

export const SYSTEM_PROMPT = `You are an expert running coach embedded in a personal training app. You speak directly to one runner (the user) whose Apple Watch run AND gym/strength data you can see.

Your responsibilities:
1. ANALYZE every run they upload — pacing, heart-rate effort, cadence, splits, intervals, consistency — and give specific, encouraging, honest feedback that cites their real numbers. Never invent data you weren't given.
2. MANAGE their goals. They may have several at once (e.g. a half marathon in 4 months and a marathon in 9 months). Use the goal tools to create/update/remove goals. IMPORTANT: before you change the target time or date of an EXISTING goal, discuss it with the runner and get their agreement in the conversation first. Creating a new goal they asked for, or marking one achieved/abandoned, is fine to do directly. When their fitness clearly shifts, proactively raise it ("I think a sub-1:30 half is realistic now — want me to update that goal?") and only change it once they agree.
   Also keep each goal's PROJECTED finish current with set_goal_projection: your honest prediction of what they'll actually run on race day, accounting for the fitness they'll gain from the remaining training. This differs from their target (what they want) and from the app's "if they raced today" estimate (their current fitness). Set it when you have enough data to judge, and revise it as training progresses. You may set this yourself without asking.
   RACE DAY: when a newly uploaded run lands on or near a goal's target date and its distance matches that goal's race (e.g. a ~21.1 km run around a half-marathon goal's date), ASK the runner whether that run was the race ("Was this your <race name>?"). If they confirm, call set_goal_result with the goal id and that run's id — this records their real finish time and marks the goal achieved. Never mark a result without their explicit confirmation.
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

You are given the runner's goals, current plans, HR zones, run history, and gym/strength history as context, refreshed every message. Treat the most recently uploaded run as the one they most likely want to discuss unless they say otherwise. Each run in the history is prefixed with its id as [#123]; pass that id to rename_run (or set_goal_result) when you need to act on a specific run.`;

// Tools the coach can call to manage the runner's goals and training plans.
export const COACH_TOOLS: Anthropic.Tool[] = [
  {
    name: "upsert_goal",
    description:
      "Create a new goal or update an existing one. To UPDATE an existing goal, pass its `id` (from the GOALS context). To CREATE, omit `id`. " +
      "Before changing an existing goal's target time/date, discuss it with the runner and get their agreement in the conversation first — don't change targets unilaterally. Creating a brand-new goal the runner asked for is fine. " +
      "Set status to 'achieved' when they hit it, or 'abandoned' if they drop it.",
    input_schema: {
      type: "object",
      properties: {
        id: { type: "number", description: "Existing goal id to update; omit to create a new goal" },
        title: { type: "string", description: "Short title, e.g. 'Sub-1:30 Half Marathon'" },
        raceType: {
          type: "string",
          enum: ["5K", "10K", "Half Marathon", "Marathon", "Custom", "Other"],
        },
        targetDistanceM: { type: "number", description: "Target distance in meters" },
        targetTimeSec: { type: "number", description: "Target finish time in seconds" },
        targetDate: { type: "string", description: "Target date, ISO YYYY-MM-DD" },
        notes: { type: "string" },
        status: { type: "string", enum: ["active", "achieved", "abandoned"] },
      },
      required: ["title", "raceType"],
    },
  },
  {
    name: "delete_goal",
    description: "Permanently remove a goal the runner no longer wants to track.",
    input_schema: {
      type: "object",
      properties: { id: { type: "number" } },
      required: ["id"],
    },
  },
  {
    name: "set_goal_projection",
    description:
      "Set your realistic PROJECTED finish time for a goal on race day — your honest prediction of what they'll actually run, accounting for the fitness they'll gain from the training between now and the race. This is distinct from their target (what they want) and from the app's 'if they raced today' estimate (current fitness from recent runs). Update it as their fitness and the plan progress. Pass an empty string for projectedTime to clear it.",
    input_schema: {
      type: "object",
      properties: {
        id: { type: "number", description: "The goal id (from the GOALS context)" },
        projectedTime: {
          type: "string",
          description:
            "Projected race-day finish as a clock time: H:MM:SS when one hour or longer (e.g. 1:45:30), or MM:SS for sub-hour finishes (e.g. 47:20). Empty string clears it. IMPORTANT: pass exactly the same time you state to the runner — do not convert to seconds.",
        },
      },
      required: ["id", "projectedTime"],
    },
  },
  {
    name: "set_goal_result",
    description:
      "Record which uploaded run was a goal's actual race, once the runner CONFIRMS it. This marks the goal achieved and stores their real finish time (taken from the run) as the result. Only call this after the runner agrees that a specific run was that race — never guess. When a freshly uploaded run's date is on or near a goal's target date and the distance matches, ASK the runner 'Was this your <race>?' first, then call this on their yes.",
    input_schema: {
      type: "object",
      properties: {
        id: { type: "number", description: "The goal id (from the GOALS context)" },
        runId: {
          type: "number",
          description:
            "The id of the run that was the race (from the run history context). Its finish time becomes the goal's recorded result.",
        },
      },
      required: ["id", "runId"],
    },
  },
  {
    name: "rename_run",
    description:
      "Rename one of the runner's runs. Identify the run by the id shown in its [#id] prefix in the run history context. Use this when the runner asks to rename a run, or clearly wants a run given a proper name (e.g. labelling a race). Don't rename runs unprompted.",
    input_schema: {
      type: "object",
      properties: {
        id: {
          type: "number",
          description: "The run id — the number in the [#id] prefix on the run's line in the context",
        },
        name: { type: "string", description: "The new name for the run" },
      },
      required: ["id", "name"],
    },
  },
  {
    name: "set_macro_plan",
    description:
      "Create or replace the long-term MACRO training plan. This must consider ALL of the runner's active goals together (e.g. a half marathon in 4 months AND a marathon in 9 months → a single periodized plan that builds through both). Use training phases (Base, Build, Peak, Taper, Race, Recovery).",
    input_schema: {
      type: "object",
      properties: {
        summary: { type: "string", description: "1-3 sentence overview of the overall strategy" },
        phases: {
          type: "array",
          items: {
            type: "object",
            properties: {
              name: { type: "string", description: "e.g. Base, Build, Peak, Taper" },
              start: { type: "string", description: "ISO date YYYY-MM-DD" },
              end: { type: "string", description: "ISO date YYYY-MM-DD" },
              focus: { type: "string", description: "What this phase develops" },
              weeklyKm: { type: "number", description: "Approx target weekly volume in km" },
              notes: { type: "string" },
            },
            required: ["name", "focus"],
          },
        },
      },
      required: ["summary", "phases"],
    },
  },
  {
    name: "set_plan_instructions",
    description:
      "Update the runner's standing PLAN INSTRUCTIONS — their free-text general guidance for how the plan should be built and maintained (e.g. 'no running on Mondays', 'always keep one full rest day', 'prioritise the marathon over the half'). " +
      "Only call this when the runner explicitly asks you to change their saved instructions. This replaces the existing instructions, so include everything that should remain. Pass an empty string to clear them. These persist across plan rebuilds.",
    input_schema: {
      type: "object",
      properties: {
        instructions: {
          type: "string",
          description: "The full new instructions text (replaces the previous value; empty string clears it)",
        },
      },
      required: ["instructions"],
    },
  },
  {
    name: "set_weekly_plan",
    description:
      "Create or replace THIS WEEK's training plan: the 7 days with specific workouts. Keep it consistent with the current macro phase and the runner's recent training load. " +
      "Days can be runs, rest, cross-training, or STRENGTH/gym sessions (type 'strength'). Schedule the runner's strength work and arrange the runs around it so heavy lifting and hard/long runs don't collide — keep quality run days on fresh legs and put easy or rest days after demanding lower-body sessions.",
    input_schema: {
      type: "object",
      properties: {
        weekStart: { type: "string", description: "ISO date of this week's Monday" },
        summary: { type: "string", description: "1-2 sentence focus for the week" },
        days: {
          type: "array",
          items: {
            type: "object",
            properties: {
              day: {
                type: "string",
                enum: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"],
              },
              type: {
                type: "string",
                enum: [
                  "easy",
                  "tempo",
                  "intervals",
                  "long",
                  "rest",
                  "cross",
                  "strength",
                  "race",
                  "recovery",
                ],
              },
              title: { type: "string", description: "Short label, e.g. '6×800m intervals' or 'Lower body — squat focus'" },
              detail: { type: "string", description: "The full workout description" },
              distanceKm: { type: "number" },
            },
            required: ["day", "type", "title", "detail"],
          },
        },
      },
      required: ["summary", "days"],
    },
  },
  {
    name: "log_lthr_test",
    description:
      "Record a lactate-threshold heart-rate (LTHR) test result the runner just completed. Saves it to their test history AND adopts it as their current LTHR (the basis for HR zones). " +
      "Only call this when the runner reports an ACTUAL test result, not a guess. After saving, let them know they can regenerate their HR zones from the new LTHR in Settings.",
    input_schema: {
      type: "object",
      properties: {
        lthr: { type: "number", description: "Lactate threshold HR in bpm (100-220)" },
        maxHr: { type: "number", description: "Max HR seen during the test, if known (bpm)" },
        testedOn: { type: "string", description: "Date of the test, ISO YYYY-MM-DD. Defaults to today." },
        notes: { type: "string", description: "Optional notes (protocol, conditions, how it felt)" },
      },
      required: ["lthr"],
    },
  },
  {
    name: "get_training_history",
    description:
      "Load the runner's FULL recent run and gym history with per-run detail — km splits, intervals, HR, cadence — across more sessions than the default context shows. The default context already includes the most recent run in full detail plus a few summarized prior runs, so call this ONLY when you genuinely need the deeper history: building or substantially revising a training plan, or analyzing trends across many sessions. Do NOT call it just to give feedback on the latest run.",
    input_schema: {
      type: "object",
      properties: {},
    },
  },
];
