import { NextRequest, NextResponse } from "next/server";
import { setGoalResult, clearGoalResult } from "@/lib/db";
import { getCurrentUserId, unauthorized } from "@/lib/auth";

export const runtime = "nodejs";

// Record which run was this goal's race (manual fallback for the coach flow).
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const userId = await getCurrentUserId();
  if (!userId) return unauthorized();
  const { id } = await params;
  try {
    const b = await req.json();
    const runId = Number(b.runId);
    if (!Number.isFinite(runId)) {
      return NextResponse.json({ error: "A runId is required." }, { status: 400 });
    }
    const goal = await setGoalResult(userId, Number(id), runId);
    if (!goal) return NextResponse.json({ error: "Goal or run not found." }, { status: 404 });
    return NextResponse.json({ goal });
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }
}

// Undo a recorded race result and reactivate the goal.
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const userId = await getCurrentUserId();
  if (!userId) return unauthorized();
  const { id } = await params;
  const goal = await clearGoalResult(userId, Number(id));
  if (!goal) return NextResponse.json({ error: "Goal not found." }, { status: 404 });
  return NextResponse.json({ goal });
}
