import { NextRequest, NextResponse } from "next/server";
import {
  insertRun,
  insertGymSession,
  getRunStartKeys,
  findRunByStart,
  updateRunSummary,
  findGymSessionAwaitingWatchData,
  mergeWatchDataIntoGymSession,
} from "@/lib/db";
import { parseActivityFile, runNameFromFile, gymNameFromFile } from "@/lib/ingest";
import { isGarminActivitiesCsv, parseGarminActivitiesCsv } from "@/lib/parseGarminCsv";
import { guessGymType } from "@/lib/gym";
import { getCurrentUserId, unauthorized } from "@/lib/auth";

export const runtime = "nodejs";

// Single upload endpoint: parse the file once, detect whether it's a run or a
// gym/strength session, and store it in the right place.
export async function POST(req: NextRequest) {
  const userId = await getCurrentUserId();
  if (!userId) return unauthorized();
  try {
    const form = await req.formData();
    const file = form.get("file");
    const providedName = (form.get("name") as string | null)?.trim();

    if (!file || typeof file === "string") {
      return NextResponse.json({ error: "No file uploaded." }, { status: 400 });
    }

    const filename = (file as File).name || "session";
    const buffer = Buffer.from(await (file as File).arrayBuffer());

    // Garmin Connect bulk export (activities.csv): one summary row per
    // activity. Import every run, skipping ones we already have (matched on
    // start time, same as the Drive/Garmin sync dedupe).
    if (/\.csv$/i.test(filename)) {
      const text = buffer.toString("utf8");
      if (isGarminActivitiesCsv(text)) {
        const activities = parseGarminActivitiesCsv(text);
        const startKeys = await getRunStartKeys(userId);
        let imported = 0;
        let duplicates = 0;
        let nonRuns = 0;
        let lastId: number | null = null;
        for (const a of activities) {
          if (!a.isRun) {
            nonRuns++;
            continue;
          }
          const key = new Date(a.summary.startedAt).toISOString().slice(0, 19);
          if (startKeys.has(key)) {
            duplicates++;
            continue;
          }
          startKeys.add(key);
          const name = a.title || `Run · ${a.summary.startedAt.slice(0, 10)}`;
          const run = await insertRun(userId, name, a.summary);
          imported++;
          lastId = run.id;
        }
        return NextResponse.json({ kind: "bulk", imported, duplicates, nonRuns, lastId });
      }
    }

    const parsed = parseActivityFile(filename, buffer);

    if (parsed.kind === "run") {
      // Same start second → same run: never store it twice. Keep whichever
      // version carries more data — a per-second FIT/CSV upload upgrades a
      // summary-only import (from activities.csv), a re-upload of the same or
      // poorer data just points at the existing run.
      const existing = await findRunByStart(userId, parsed.summary.startedAt);
      if (existing) {
        if (parsed.summary.sampleCount > existing.sampleCount) {
          await updateRunSummary(userId, existing.id, providedName || null, parsed.summary);
          return NextResponse.json({ kind: "run", id: existing.id, merged: true });
        }
        return NextResponse.json({ kind: "run", id: existing.id, duplicate: true });
      }
      const name = providedName || runNameFromFile(filename, parsed.summary.startedAt);
      const run = await insertRun(userId, name, parsed.summary);
      return NextResponse.json({ kind: "run", id: run.id });
    }

    // A pasted Strong workout may already cover this session — fill in the
    // watch data instead of creating a duplicate.
    const pending = await findGymSessionAwaitingWatchData(userId, parsed.summary.startedAt);
    if (pending) {
      const merged = await mergeWatchDataIntoGymSession(userId, pending.id, parsed.summary, null);
      if (merged) return NextResponse.json({ kind: "gym", id: merged.id });
    }

    const type = guessGymType(parsed.summary.sport, parsed.summary.subSport);
    const name = providedName || gymNameFromFile(filename, parsed.summary.startedAt);
    const session = await insertGymSession(
      userId,
      { name, type, rpe: parsed.summary.rpe, notes: null },
      parsed.summary
    );
    return NextResponse.json({ kind: "gym", id: session.id });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to parse file.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
