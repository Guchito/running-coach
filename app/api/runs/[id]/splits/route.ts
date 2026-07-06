import { NextRequest, NextResponse } from "next/server";
import { getRun, updateRunSummary } from "@/lib/db";
import { buildSplitsFromDurations, splitsMatchDuration } from "@/lib/splits";
import { getCurrentUserId, unauthorized } from "@/lib/auth";

export const runtime = "nodejs";

// Add per-km splits to a run that has none (manual entry, bulk CSV import).
// Only fills the gap — a run that already has splits (from a real file) is
// left alone so device data can't be overwritten by hand-typed numbers.
export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const userId = await getCurrentUserId();
  if (!userId) return unauthorized();
  const { id } = await params;
  try {
    const run = await getRun(userId, Number(id));
    if (!run) return NextResponse.json({ error: "Run not found." }, { status: 404 });
    if (run.summary.splits.length > 0) {
      return NextResponse.json(
        { error: "This run already has splits recorded." },
        { status: 400 }
      );
    }

    const body = await req.json().catch(() => ({}));
    const rawDurations: unknown[] = Array.isArray(body.splitDurations)
      ? body.splitDurations
      : [];
    const durations = rawDurations.map((v) => {
      const n = Number(v);
      return Number.isFinite(n) ? n : null;
    });
    if (durations.length === 0) {
      return NextResponse.json({ error: "No splits provided." }, { status: 400 });
    }

    const built = buildSplitsFromDurations(
      run.distanceM,
      durations,
      Array.isArray(body.splitHrs) ? body.splitHrs : []
    );
    if ("error" in built) {
      return NextResponse.json({ error: built.error }, { status: 400 });
    }

    const sum = built.splits.reduce((a, s) => a + s.durationSec, 0);
    if (!splitsMatchDuration(sum, run.durationSec)) {
      return NextResponse.json(
        { error: "The splits don't add up to this run's duration." },
        { status: 400 }
      );
    }

    const updated = await updateRunSummary(userId, run.id, null, {
      ...run.summary,
      splits: built.splits,
    });
    return NextResponse.json({ run: updated });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to save splits.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
