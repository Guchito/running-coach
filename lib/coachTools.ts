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
import { formatDuration, parseRaceTime } from "./parseRun";
import type { MacroPlan, WeeklyPlan } from "./types";

// COACH_TOOLS (the tool schemas) now live in the import-free lib/coachDefs.ts —
// single source of truth, also used by the model bench. Re-exported here so
// existing imports (`@/lib/coachTools`) keep working unchanged. This file owns
// the runtime side: executeTool.
export { COACH_TOOLS } from "./coachDefs";

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
      // Accept a clock string ("2:15:00") or bare seconds; parse server-side so
      // the stored value matches the time the coach states (no model arithmetic).
      const projectedTimeSec = parseRaceTime(input.projectedTime ?? input.projectedTimeSec);
      const updated = await setGoalProjection(userId, Number(input.id), projectedTimeSec);
      if (!updated) return { summary: "Goal not found", data: { error: "not found" } };
      const projectedTime = projectedTimeSec ? formatDuration(projectedTimeSec) : null;
      return {
        // Echo the actual stored time so the chat and dashboard always agree.
        summary: projectedTime
          ? `Set ${updated.title} projection to ${projectedTime}`
          : `Cleared projected finish for ${updated.title}`,
        data: { goal: updated, projectedTimeSec, projectedTime },
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
