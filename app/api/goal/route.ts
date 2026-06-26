import { NextRequest, NextResponse } from "next/server";
import { getGoal, upsertGoal } from "@/lib/db";

export const runtime = "nodejs";

export async function GET() {
  return NextResponse.json({ goal: getGoal() });
}

export async function PUT(req: NextRequest) {
  try {
    const body = await req.json();
    if (!body.title || !body.raceType) {
      return NextResponse.json(
        { error: "title and raceType are required." },
        { status: 400 }
      );
    }
    const goal = upsertGoal({
      title: String(body.title),
      raceType: String(body.raceType),
      targetDistanceM: body.targetDistanceM ?? null,
      targetTimeSec: body.targetTimeSec ?? null,
      targetDate: body.targetDate ?? null,
      notes: body.notes ?? null,
    });
    return NextResponse.json({ goal });
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }
}
