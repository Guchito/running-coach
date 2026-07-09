import { NextRequest, NextResponse } from "next/server";
import {
  listGymSessions,
  insertGymSession,
  findGymSessionAwaitingWatchData,
  mergeWatchDataIntoGymSession,
} from "@/lib/db";
import { parseGymFile, gymNameFromFile } from "@/lib/ingest";
import { guessGymType, isGymType } from "@/lib/gym";
import { getCurrentUserId, unauthorized } from "@/lib/auth";
import type { GymType } from "@/lib/types";

export const runtime = "nodejs";

export async function GET() {
  const userId = await getCurrentUserId();
  if (!userId) return unauthorized();
  return NextResponse.json({ sessions: await listGymSessions(userId) });
}

export async function POST(req: NextRequest) {
  const userId = await getCurrentUserId();
  if (!userId) return unauthorized();
  try {
    const form = await req.formData();
    const file = form.get("file");
    const providedName = (form.get("name") as string | null)?.trim();
    const providedType = (form.get("type") as string | null)?.trim();
    const rpeRaw = (form.get("rpe") as string | null)?.trim();
    const notes = (form.get("notes") as string | null)?.trim() || null;

    if (!file || typeof file === "string") {
      return NextResponse.json({ error: "No file uploaded." }, { status: 400 });
    }

    const filename = (file as File).name || "gym.fit";
    const buffer = Buffer.from(await (file as File).arrayBuffer());
    const summary = parseGymFile(filename, buffer);

    const type: GymType =
      providedType && isGymType(providedType)
        ? providedType
        : guessGymType(summary.sport, summary.subSport);

    // Explicit RPE from the form wins; otherwise the effort rating recorded
    // on the watch (FIT workout_rpe).
    let rpe: number | null = summary.rpe;
    if (rpeRaw) {
      const n = Math.round(Number(rpeRaw));
      if (!Number.isNaN(n)) rpe = Math.min(10, Math.max(1, n));
    }

    // If a pasted Strong workout already covers this session, fill in the
    // watch data instead of creating a duplicate.
    const pending = await findGymSessionAwaitingWatchData(userId, summary.startedAt);
    if (pending) {
      const merged = await mergeWatchDataIntoGymSession(userId, pending.id, summary, null);
      if (merged) return NextResponse.json({ session: merged, merged: true });
    }

    const name = providedName || gymNameFromFile(filename, summary.startedAt);
    const session = await insertGymSession(userId, { name, type, rpe, notes }, summary);
    return NextResponse.json({ session });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to parse gym session.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
