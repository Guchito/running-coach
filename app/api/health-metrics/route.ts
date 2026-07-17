import { NextRequest, NextResponse } from "next/server";
import { listHealthMetrics, logDailyHealth } from "@/lib/db";
import { getCurrentUserId, unauthorized } from "@/lib/auth";

export const runtime = "nodejs";

export async function GET() {
  const userId = await getCurrentUserId();
  if (!userId) return unauthorized();
  return NextResponse.json({ metrics: await listHealthMetrics(userId) });
}

// Manual daily log (resting HR / weight / note) from the Profile page —
// merges into the same health_metrics day the sheet sync writes to.
export async function POST(req: NextRequest) {
  const userId = await getCurrentUserId();
  if (!userId) return unauthorized();

  let b: { date?: unknown; restingHr?: unknown; weightKg?: unknown; notes?: unknown };
  try {
    b = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  let restingHr: number | null = null;
  if (b.restingHr !== null && b.restingHr !== undefined && String(b.restingHr).trim() !== "") {
    restingHr = Math.round(Number(b.restingHr));
    if (!Number.isFinite(restingHr) || restingHr < 25 || restingHr > 120) {
      return NextResponse.json({ error: "Resting HR should be between 25 and 120 bpm." }, { status: 400 });
    }
  }

  let weightKg: number | null = null;
  if (b.weightKg !== null && b.weightKg !== undefined && String(b.weightKg).trim() !== "") {
    weightKg = Math.round(Number(b.weightKg) * 10) / 10;
    if (!Number.isFinite(weightKg) || weightKg < 30 || weightKg > 250) {
      return NextResponse.json({ error: "Weight should be between 30 and 250 kg." }, { status: 400 });
    }
  }

  const notes = typeof b.notes === "string" && b.notes.trim() ? b.notes.trim() : null;

  if (restingHr === null && weightKg === null && notes === null) {
    return NextResponse.json({ error: "Enter a resting HR, a weight, or a note." }, { status: 400 });
  }

  const today = new Date().toISOString().slice(0, 10);
  const date =
    typeof b.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(b.date) ? b.date : today;
  if (date > today) {
    return NextResponse.json({ error: "Date can't be in the future." }, { status: 400 });
  }

  const metric = await logDailyHealth(userId, { date, restingHr, weightKg, notes });
  return NextResponse.json({ metric });
}
