import { NextRequest, NextResponse } from "next/server";
import { listGoals, createGoal } from "@/lib/db";
import { getCurrentUserId, unauthorized } from "@/lib/auth";

export const runtime = "nodejs";

export async function GET() {
  const userId = await getCurrentUserId();
  if (!userId) return unauthorized();
  return NextResponse.json({ goals: await listGoals(userId) });
}

export async function POST(req: NextRequest) {
  const userId = await getCurrentUserId();
  if (!userId) return unauthorized();
  try {
    const b = await req.json();
    if (!b.title || !b.raceType) {
      return NextResponse.json({ error: "title and raceType are required." }, { status: 400 });
    }
    const goal = await createGoal(userId, {
      title: String(b.title),
      raceType: String(b.raceType),
      targetDistanceM: b.targetDistanceM ?? null,
      targetTimeSec: b.targetTimeSec ?? null,
      targetDate: b.targetDate ?? null,
      notes: b.notes ?? null,
      status: b.status ?? "active",
    });
    return NextResponse.json({ goal });
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }
}
