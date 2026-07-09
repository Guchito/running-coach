import { NextRequest, NextResponse } from "next/server";
import { insertRun, insertGymSession, findRunByStart } from "@/lib/db";
import { buildSplitsFromDurations } from "@/lib/splits";
import { isGymType, gymTypeLabel } from "@/lib/gym";
import { getCurrentUserId, unauthorized } from "@/lib/auth";
import type { RunSummary, GymSummary, GymType, Split } from "@/lib/types";

export const runtime = "nodejs";

// Manually logged session (no file): the client sends already-structured
// values. Runs become summary-only entries — same shape the bulk
// activities.csv import produces (no samples, so no splits/series/zones).

function num(v: unknown): number | null {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

export async function POST(req: NextRequest) {
  const userId = await getCurrentUserId();
  if (!userId) return unauthorized();
  try {
    const body = await req.json().catch(() => ({}));
    const kind = body.kind as string;
    const name = typeof body.name === "string" ? body.name.trim() : "";
    const startedAt = typeof body.startedAt === "string" ? body.startedAt : "";
    const durationSec = num(body.durationSec);
    const notes = typeof body.notes === "string" && body.notes.trim() ? body.notes.trim() : null;

    if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(startedAt) || Number.isNaN(Date.parse(startedAt))) {
      return NextResponse.json({ error: "Please pick a valid date and time." }, { status: 400 });
    }
    if (!durationSec || durationSec <= 0) {
      return NextResponse.json({ error: "Please enter a duration (e.g. 45:30)." }, { status: 400 });
    }
    const date = startedAt.slice(0, 10);

    if (kind === "run") {
      const distanceM = num(body.distanceM);
      if (!distanceM || distanceM <= 0) {
        return NextResponse.json({ error: "Please enter the distance." }, { status: 400 });
      }
      const existing = await findRunByStart(userId, startedAt);
      if (existing) {
        return NextResponse.json(
          { error: `You already have a run starting at that exact time ("${existing.name}").` },
          { status: 409 }
        );
      }
      const avgHr = num(body.avgHr);
      const elevGainM = num(body.elevGainM) ?? 0;

      // Optional per-km splits: the client sends durations (plus optional avg
      // HR per km); distances are derived from the total by the shared builder.
      let splits: Split[] = [];
      const rawSplits: unknown[] | null = Array.isArray(body.splitDurations)
        ? body.splitDurations
        : null;
      if (rawSplits && rawSplits.length > 0) {
        const built = buildSplitsFromDurations(
          distanceM,
          rawSplits.map(num),
          Array.isArray(body.splitHrs) ? body.splitHrs : []
        );
        if ("error" in built) {
          return NextResponse.json({ error: built.error }, { status: 400 });
        }
        splits = built.splits;
      }

      const summary: RunSummary = {
        startedAt,
        durationSec,
        movingSec: durationSec,
        distanceM,
        avgPaceSecPerKm: (durationSec / distanceM) * 1000,
        avgMovingPaceSecPerKm: (durationSec / distanceM) * 1000,
        avgSpeed: distanceM / durationSec,
        avgHr,
        maxHr: num(body.maxHr),
        avgCadence: null,
        maxCadence: null,
        avgPower: null,
        avgStrideMm: null,
        avgVoMm: null,
        avgGctMs: null,
        elevGainM,
        elevLossM: 0,
        splits,
        laps: [],
        intensityBreakdown: { active: durationSec },
        hrHistogram: {},
        sampleCount: 0,
        series: [],
      };
      const run = await insertRun(userId, name || `Run · ${date}`, summary);
      return NextResponse.json({ kind: "run", id: run.id });
    }

    if (kind === "gym") {
      const type: GymType = isGymType(body.type) ? body.type : "other";
      let rpe: number | null = null;
      const rpeN = num(body.rpe);
      if (rpeN) rpe = Math.min(10, Math.max(1, Math.round(rpeN)));
      const summary: GymSummary = {
        startedAt,
        durationSec,
        avgHr: num(body.avgHr),
        maxHr: null,
        calories: num(body.calories),
        rpe,
        sport: null,
        subSport: null,
      };
      const session = await insertGymSession(
        userId,
        { name: name || `${gymTypeLabel(type)} · ${date}`, type, rpe, notes },
        summary
      );
      return NextResponse.json({ kind: "gym", id: session.id });
    }

    return NextResponse.json({ error: "Unknown session kind." }, { status: 400 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to save the session.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
