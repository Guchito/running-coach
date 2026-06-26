import { NextRequest, NextResponse } from "next/server";
import { listRuns, insertRun } from "@/lib/db";
import { parseRunFile, runNameFromFile } from "@/lib/ingest";
import { getCurrentUserId, unauthorized } from "@/lib/auth";

export const runtime = "nodejs";

export async function GET() {
  const userId = await getCurrentUserId();
  if (!userId) return unauthorized();
  return NextResponse.json({ runs: await listRuns(userId) });
}

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

    const filename = (file as File).name || "run.csv";
    const buffer = Buffer.from(await (file as File).arrayBuffer());
    const summary = parseRunFile(filename, buffer);

    const name = providedName || runNameFromFile(filename, summary.startedAt);
    const run = await insertRun(userId, name, summary);
    return NextResponse.json({ run });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to parse run.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
