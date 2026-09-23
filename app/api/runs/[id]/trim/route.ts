import { NextRequest, NextResponse } from "next/server";
import { getRun, updateRunSummary, syncGoalResultTime } from "@/lib/db";
import { trimError, trimSummary } from "@/lib/trimRun";
import { getCurrentUserId, unauthorized } from "@/lib/auth";

export const runtime = "nodejs";

// Trim meters off the start/end of a run (GPS overshoot on a race). Always
// applied to the untrimmed original, so re-trimming never compounds.
// { startM: 0, endM: 0 } restores the original.
export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const userId = await getCurrentUserId();
  if (!userId) return unauthorized();
  const { id } = await params;
  const run = await getRun(userId, Number(id));
  if (!run) return NextResponse.json({ error: "Run not found." }, { status: 404 });

  const body = await req.json().catch(() => ({}));
  const cut = { startM: Number(body.startM ?? 0), endM: Number(body.endM ?? 0) };
  const original = run.summary.untrimmed ?? run.summary;
  const error = trimError(original, cut);
  if (error) return NextResponse.json({ error }, { status: 400 });

  const summary = cut.startM === 0 && cut.endM === 0 ? original : trimSummary(original, cut);
  const updated = await updateRunSummary(userId, run.id, null, summary);
  await syncGoalResultTime(userId, run.id, summary.durationSec);
  return NextResponse.json({ run: updated });
}
