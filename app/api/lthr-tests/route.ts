import { NextRequest, NextResponse } from "next/server";
import {
  listLthrTests,
  insertLthrTest,
  setLthrTestInterval,
  getUserById,
} from "@/lib/db";
import { getCurrentUserId, unauthorized } from "@/lib/auth";

export const runtime = "nodejs";

export async function GET() {
  const userId = await getCurrentUserId();
  if (!userId) return unauthorized();
  const [tests, user] = await Promise.all([listLthrTests(userId), getUserById(userId)]);
  return NextResponse.json({ tests, intervalWeeks: user?.lthrTestIntervalWeeks ?? null });
}

// Log a new test result. Adopts the value as the runner's current LTHR.
export async function POST(req: NextRequest) {
  const userId = await getCurrentUserId();
  if (!userId) return unauthorized();

  let b: { testedOn?: unknown; lthr?: unknown; maxHr?: unknown; notes?: unknown };
  try {
    b = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const lthr = Math.round(Number(b.lthr));
  if (!Number.isFinite(lthr) || lthr < 100 || lthr > 220) {
    return NextResponse.json({ error: "LTHR should be between 100 and 220 bpm." }, { status: 400 });
  }

  let maxHr: number | null = null;
  if (b.maxHr !== null && b.maxHr !== undefined && String(b.maxHr).trim() !== "") {
    maxHr = Math.round(Number(b.maxHr));
    if (!Number.isFinite(maxHr) || maxHr < 120 || maxHr > 230) {
      return NextResponse.json({ error: "Max HR should be between 120 and 230 bpm." }, { status: 400 });
    }
    if (maxHr < lthr) {
      return NextResponse.json({ error: "Max HR can't be lower than LTHR." }, { status: 400 });
    }
  }

  const today = new Date().toISOString().slice(0, 10);
  const testedOn =
    typeof b.testedOn === "string" && /^\d{4}-\d{2}-\d{2}$/.test(b.testedOn) ? b.testedOn : today;
  if (testedOn > today) {
    return NextResponse.json({ error: "Test date can't be in the future." }, { status: 400 });
  }

  const notes = typeof b.notes === "string" && b.notes.trim() ? b.notes.trim() : null;

  const test = await insertLthrTest(userId, { testedOn, lthr, maxHr, notes });
  return NextResponse.json({ test });
}

// Update the re-test cadence (null clears it).
export async function PUT(req: NextRequest) {
  const userId = await getCurrentUserId();
  if (!userId) return unauthorized();

  let b: { intervalWeeks?: unknown };
  try {
    b = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  let weeks: number | null = null;
  if (b.intervalWeeks !== null && b.intervalWeeks !== undefined && String(b.intervalWeeks).trim() !== "") {
    weeks = Math.round(Number(b.intervalWeeks));
    if (!Number.isFinite(weeks) || weeks < 1 || weeks > 52) {
      return NextResponse.json({ error: "Cadence should be between 1 and 52 weeks." }, { status: 400 });
    }
  }

  const user = await setLthrTestInterval(userId, weeks);
  return NextResponse.json({ intervalWeeks: user.lthrTestIntervalWeeks });
}
