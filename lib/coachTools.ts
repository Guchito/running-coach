import type Anthropic from "@anthropic-ai/sdk";
import {
  createGoal,
  updateGoal,
  deleteGoal,
  getGoalById,
  setMacroPlan,
  setWeeklyPlan,
} from "./db";
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
    name: "set_weekly_plan",
    description:
      "Create or replace THIS WEEK's training plan: the 7 days with specific workouts. Keep it consistent with the current macro phase and the runner's recent training load.",
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
                enum: ["easy", "tempo", "intervals", "long", "rest", "cross", "race", "recovery"],
              },
              title: { type: "string", description: "Short label, e.g. '6×800m intervals'" },
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
    case "set_macro_plan": {
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
        updatedAt: nowIso(),
      };
      await setMacroPlan(userId, macro);
      return { summary: "Updated your macro (long-term) plan", data: { ok: true } };
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
    default:
      return { summary: `Unknown tool: ${name}`, data: { error: "unknown tool" } };
  }
}
