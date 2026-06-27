import type Anthropic from "@anthropic-ai/sdk";
import {
  createGoal,
  updateGoal,
  deleteGoal,
  getGoalById,
  setGoalProjection,
  setMacroPlan,
  setMacroInstructions,
  setWeeklyPlan,
  getPlan,
  insertLthrTest,
  listRuns,
  listGymSessions,
} from "./db";
import { buildRunsContext, buildGymContext } from "./coach";
import type { MacroPlan, WeeklyPlan } from "./types";

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
      "Set your realistic PROJECTED finish time for a goal on race day — your honest prediction of what they'll actually run, accounting for the fitness they'll gain from the training between now and the race. This is distinct from their target (what they want) and from the app's 'if they raced today' estimate (current fitness from recent runs). Update it as their fitness and the plan progress. Pass projectedTimeSec as null to clear it.",
    input_schema: {
      type: "object",
      properties: {
        id: { type: "number", description: "The goal id (from the GOALS context)" },
        projectedTimeSec: {
          type: ["number", "null"],
          description: "Projected race-day finish time in seconds, or null to clear",
        },
      },
      required: ["id", "projectedTimeSec"],
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

type ToolResult = { summary: string; data: Record<string, unknown> };

function nowIso() {
  return new Date().toISOString();
}

// Execute a tool call against the database, scoped to one user.
export async function executeTool(
  userId: number,
  name: string,
  input: Record<string, unknown>
): Promise<ToolResult> {
  switch (name) {
    case "upsert_goal": {
      const payload = {
        title: String(input.title),
        raceType: String(input.raceType),
        targetDistanceM: (input.targetDistanceM as number) ?? null,
        targetTimeSec: (input.targetTimeSec as number) ?? null,
        targetDate: (input.targetDate as string) ?? null,
        notes: (input.notes as string) ?? null,
        status: (input.status as "active" | "achieved" | "abandoned") ?? "active",
      };
      if (input.id) {
        const updated = await updateGoal(userId, Number(input.id), payload);
        if (!updated) return { summary: "Goal not found", data: { error: "not found" } };
        return { summary: `Updated goal: ${updated.title}`, data: { goal: updated } };
      }
      const created = await createGoal(userId, payload);
      return { summary: `Created goal: ${created.title}`, data: { goal: created } };
    }
    case "delete_goal": {
      const goal = await getGoalById(userId, Number(input.id));
      await deleteGoal(userId, Number(input.id));
      return {
        summary: goal ? `Removed goal: ${goal.title}` : "Removed goal",
        data: { ok: true },
      };
    }
    case "set_goal_projection": {
      const projectedTimeSec =
        input.projectedTimeSec === null || input.projectedTimeSec === undefined
          ? null
          : Math.round(Number(input.projectedTimeSec));
      const updated = await setGoalProjection(userId, Number(input.id), projectedTimeSec);
      if (!updated) return { summary: "Goal not found", data: { error: "not found" } };
      return {
        summary: projectedTimeSec
          ? `Set projected finish for ${updated.title}`
          : `Cleared projected finish for ${updated.title}`,
        data: { goal: updated },
      };
    }
    case "set_macro_plan": {
      // Preserve the runner's standing instructions across plan rebuilds.
      const existing = await getPlan(userId);
      const macro: MacroPlan = {
        summary: String(input.summary),
        phases: (input.phases as MacroPlan["phases"]).map((p) => ({
          name: String(p.name),
          start: p.start ?? null,
          end: p.end ?? null,
          focus: String(p.focus),
          weeklyKm: p.weeklyKm ?? null,
          notes: p.notes ?? null,
        })),
        instructions: existing.macro?.instructions ?? null,
        updatedAt: nowIso(),
      };
      await setMacroPlan(userId, macro);
      return { summary: "Updated your macro (long-term) plan", data: { ok: true } };
    }
    case "set_plan_instructions": {
      const text = String(input.instructions ?? "").trim();
      await setMacroInstructions(userId, text || null);
      return {
        summary: text ? "Updated your plan instructions" : "Cleared your plan instructions",
        data: { ok: true },
      };
    }
    case "set_weekly_plan": {
      const weekly: WeeklyPlan = {
        weekStart: (input.weekStart as string) ?? null,
        summary: String(input.summary),
        days: (input.days as WeeklyPlan["days"]).map((d) => ({
          day: String(d.day),
          type: String(d.type),
          title: String(d.title),
          detail: String(d.detail),
          distanceKm: d.distanceKm ?? null,
        })),
        updatedAt: nowIso(),
      };
      await setWeeklyPlan(userId, weekly);
      return { summary: "Updated your weekly plan", data: { ok: true } };
    }
    case "log_lthr_test": {
      const lthr = Math.round(Number(input.lthr));
      if (!Number.isFinite(lthr) || lthr < 100 || lthr > 220) {
        return { summary: "LTHR must be between 100 and 220 bpm", data: { error: "invalid lthr" } };
      }
      let maxHr: number | null = null;
      if (input.maxHr != null && String(input.maxHr).trim() !== "") {
        const m = Math.round(Number(input.maxHr));
        if (Number.isFinite(m)) maxHr = m;
      }
      const today = nowIso().slice(0, 10);
      const testedOn =
        typeof input.testedOn === "string" && /^\d{4}-\d{2}-\d{2}$/.test(input.testedOn)
          ? input.testedOn
          : today;
      const notes =
        typeof input.notes === "string" && input.notes.trim() ? input.notes.trim() : null;
      const test = await insertLthrTest(userId, { testedOn, lthr, maxHr, notes });
      return {
        summary: `Logged LTHR test: ${lthr} bpm on ${testedOn} — now your current LTHR`,
        data: { test },
      };
    }
    case "get_training_history": {
      const [runs, gym] = await Promise.all([listRuns(userId), listGymSessions(userId)]);
      const history = `${buildRunsContext(runs, 14)}\n\n${buildGymContext(gym, 14)}`;
      return { summary: "Reviewed your full training history", data: { history } };
    }
    default:
      return { summary: `Unknown tool: ${name}`, data: { error: "unknown tool" } };
  }
}
