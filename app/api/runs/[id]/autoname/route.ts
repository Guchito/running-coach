import { NextRequest, NextResponse } from "next/server";
import { getRun, getUserById, renameRun, getAnthropicApiKey } from "@/lib/db";
import { resolveCoachModel } from "@/lib/coach";
import { generateRunName } from "@/lib/runNaming";
import { getCurrentUserId, unauthorized } from "@/lib/auth";

export const runtime = "nodejs";
export const maxDuration = 60;

// Server-side auto-naming: if the runner enabled it, generate a fitting name for
// this run (a plain-text model call, reliable on any model) and rename it here —
// no dependence on the coach choosing to call the rename_run tool.
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const userId = await getCurrentUserId();
  if (!userId) return unauthorized();
  const { id } = await params;

  const [user, run] = await Promise.all([
    getUserById(userId),
    getRun(userId, Number(id)),
  ]);
  if (!user?.autoNameRuns) return NextResponse.json({ skipped: true });
  if (!run) return NextResponse.json({ error: "Run not found." }, { status: 404 });

  try {
    const model = resolveCoachModel(user.coachModel);
    const apiKey = await getAnthropicApiKey(userId);
    const name = await generateRunName(run, model, apiKey);
    if (!name) return NextResponse.json({ skipped: true });
    const updated = await renameRun(userId, run.id, name);
    return NextResponse.json({ name: updated?.name ?? name });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Naming failed." },
      { status: 500 }
    );
  }
}
