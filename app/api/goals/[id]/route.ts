import { NextRequest, NextResponse } from "next/server";
import { updateGoal, deleteGoal } from "@/lib/db";
import { getCurrentUserId, unauthorized } from "@/lib/auth";

export const runtime = "nodejs";

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const userId = await getCurrentUserId();
  if (!userId) return unauthorized();
  const { id } = await params;
  try {
    const b = await req.json();
    const goal = await updateGoal(userId, Number(id), {
      title: b.title,
      raceType: b.raceType,
      targetDistanceM: b.targetDistanceM ?? null,
      targetTimeSec: b.targetTimeSec ?? null,
      targetDate: b.targetDate ?? null,
      notes: b.notes ?? null,
      status: b.status,
    });
    if (!goal) return NextResponse.json({ error: "Goal not found." }, { status: 404 });
    return NextResponse.json({ goal });
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const userId = await getCurrentUserId();
  if (!userId) return unauthorized();
  const { id } = await params;
  await deleteGoal(userId, Number(id));
  return NextResponse.json({ ok: true });
}
