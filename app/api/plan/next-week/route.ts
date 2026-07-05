import { NextResponse } from "next/server";
import { getPlan, listRuns, listGymSessions } from "@/lib/db";
import { getCurrentUserId, unauthorized } from "@/lib/auth";
import { nextWeekPlanStatus } from "@/lib/adherence";

export const runtime = "nodejs";

// Should the app offer to have the coach build the next weekly plan?
// `status` is non-null when the planned week is fully completed (plan next
// week) or has already ended without a new plan (plan the current week).
export async function GET() {
  const userId = await getCurrentUserId();
  if (!userId) return unauthorized();
  const [plan, runs, gymSessions] = await Promise.all([
    getPlan(userId),
    listRuns(userId),
    listGymSessions(userId),
  ]);
  return NextResponse.json({ status: nextWeekPlanStatus(plan.weekly, runs, gymSessions) });
}
