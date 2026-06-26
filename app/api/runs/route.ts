import { NextRequest, NextResponse } from "next/server";
import { listRuns, insertRun } from "@/lib/db";
import { parseRunCsv } from "@/lib/parseRun";

export const runtime = "nodejs";

export async function GET() {
  return NextResponse.json({ runs: listRuns() });
}

export async function POST(req: NextRequest) {
  try {
    const form = await req.formData();
    const file = form.get("file");
    const providedName = (form.get("name") as string | null)?.trim();

    if (!file || typeof file === "string") {
      return NextResponse.json({ error: "No file uploaded." }, { status: 400 });
    }

    const text = await file.text();
    const summary = parseRunCsv(text);

    const fallbackName =
      (file as File).name?.replace(/\.csv$/i, "").trim() ||
      `Run ${summary.startedAt.slice(0, 10)}`;
    const name = providedName || cleanName(fallbackName, summary.startedAt);

    const run = insertRun(name, summary);
    return NextResponse.json({ run });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to parse run.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

// Apple Watch export names are long timestamps; produce something friendlier.
function cleanName(raw: string, startedAt: string): string {
  const date = startedAt.slice(0, 10);
  if (/outdoor running/i.test(raw)) return `Outdoor Run · ${date}`;
  return raw.length > 40 ? `Run · ${date}` : raw;
}
