import { NextRequest, NextResponse } from "next/server";
import {
  findGymSessionNear,
  setGymSessionExercises,
  insertGymSession,
} from "@/lib/db";
import { parseStrongText } from "@/lib/parseStrong";
import { getCurrentUserId, unauthorized } from "@/lib/auth";
import type { GymSummary } from "@/lib/types";

export const runtime = "nodejs";

// Paste-a-workout: takes the raw text Strong copies to the clipboard, parses
// it, and either attaches the exercises to the same day's gym session (watch
// data arrived first) or creates a new session the watch file can merge into
// later. Re-pasting the same workout replaces the exercises — that's the edit
// path.

export async function POST(req: NextRequest) {
  const userId = await getCurrentUserId();
  if (!userId) return unauthorized();
  try {
    const body = await req.json().catch(() => ({}));
    const text = typeof body.text === "string" ? body.text : "";
    const parsed = parseStrongText(text);

    const existing = await findGymSessionNear(userId, parsed.startedAt);
    if (existing) {
      const session = await setGymSessionExercises(userId, existing.id, {
        name: parsed.title,
        type: parsed.type ?? existing.type,
        exercises: parsed.exercises,
        strongLink: parsed.link,
      });
      return NextResponse.json({ session, merged: true });
    }

    // No session that day yet — create one from the paste alone. Duration and
    // HR are watch-only; durationSec 0 means "unknown" until the file syncs.
    const summary: GymSummary = {
      startedAt: parsed.startedAt,
      durationSec: 0,
      avgHr: null,
      maxHr: null,
      calories: null,
      rpe: null,
      sport: null,
      subSport: null,
    };
    const session = await insertGymSession(
      userId,
      {
        name: parsed.title,
        type: parsed.type ?? "other",
        rpe: null,
        notes: null,
        exercises: parsed.exercises,
        strongLink: parsed.link,
      },
      summary
    );
    return NextResponse.json({ session, merged: false });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Couldn't parse the pasted workout.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
