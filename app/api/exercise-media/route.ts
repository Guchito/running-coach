import { NextRequest, NextResponse } from "next/server";
import { getCurrentUserId, unauthorized } from "@/lib/auth";
import {
  searchExercises,
  browseByBodyPart,
  overrideExerciseMatch,
  clearExerciseMatch,
  catalogStatus,
  syncCatalog,
} from "@/lib/exerciseDb";

export const runtime = "nodejs";

// GET ?status    — exercise-catalog sync progress { indexed, total, complete }.
// GET ?search=x  — ranked candidates from the local catalog for the picker.
// GET ?bodyPart=x — browse a body part.
// POST { sync: true }               — run one catalog sync pass, returns status.
// POST { name, exerciseId }         — hand-pick a demo; omit exerciseId to
//   record "no match". Writes a verified row.

export async function GET(req: NextRequest) {
  const userId = await getCurrentUserId();
  if (!userId) return unauthorized();
  const sp = req.nextUrl.searchParams;

  if (sp.has("status")) return NextResponse.json(await catalogStatus());

  const bodyPart = sp.get("bodyPart")?.trim();
  if (bodyPart) return NextResponse.json({ results: await browseByBodyPart(bodyPart) });

  const term = sp.get("search")?.trim() ?? "";
  if (!term) return NextResponse.json({ results: [] });
  return NextResponse.json({ results: await searchExercises(term) });
}

export async function POST(req: NextRequest) {
  const userId = await getCurrentUserId();
  if (!userId) return unauthorized();
  const body = (await req.json().catch(() => ({}))) as {
    sync?: unknown;
    name?: unknown;
    exerciseId?: unknown;
  };

  if (body.sync) return NextResponse.json(await syncCatalog());

  const name = typeof body.name === "string" ? body.name : "";
  if (!name) return NextResponse.json({ error: "name required" }, { status: 400 });

  const media = body.exerciseId
    ? await overrideExerciseMatch(name, String(body.exerciseId))
    : await clearExerciseMatch(name);
  return NextResponse.json({ media });
}
