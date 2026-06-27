import { NextRequest, NextResponse } from "next/server";
import { insertRun, insertGymSession } from "@/lib/db";
import { parseActivityFile, runNameFromFile, gymNameFromFile } from "@/lib/ingest";
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
    const parsed = parseActivityFile(filename, buffer);

    if (parsed.kind === "run") {
      const name = providedName || runNameFromFile(filename, parsed.summary.startedAt);
      const run = await insertRun(userId, name, parsed.summary);
      return NextResponse.json({ kind: "run", id: run.id });
    }

    const type = guessGymType(parsed.summary.sport, parsed.summary.subSport);
    const name = providedName || gymNameFromFile(filename, parsed.summary.startedAt);
    const session = await insertGymSession(userId, { name, type, rpe: null, notes: null }, parsed.summary);
    return NextResponse.json({ kind: "gym", id: session.id });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to parse file.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
