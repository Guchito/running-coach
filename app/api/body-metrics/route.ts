import { NextRequest, NextResponse } from "next/server";
import { listBodyMetrics, insertBodyMetric } from "@/lib/db";
import { getCurrentUserId, unauthorized } from "@/lib/auth";

export const runtime = "nodejs";

export async function GET() {
  const userId = await getCurrentUserId();
  if (!userId) return unauthorized();
  return NextResponse.json({ metrics: await listBodyMetrics(userId) });
}

export async function POST(req: NextRequest) {
  const userId = await getCurrentUserId();
  if (!userId) return unauthorized();

  let b: { recordedOn?: unknown; restingHr?: unknown; weightKg?: unknown; notes?: unknown };
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

  if (restingHr === null && weightKg === null) {
    return NextResponse.json({ error: "Enter a resting HR or a weight." }, { status: 400 });
  }

  const today = new Date().toISOString().slice(0, 10);
  const recordedOn =
    typeof b.recordedOn === "string" && /^\d{4}-\d{2}-\d{2}$/.test(b.recordedOn) ? b.recordedOn : today;
  if (recordedOn > today) {
    return NextResponse.json({ error: "Date can't be in the future." }, { status: 400 });
  }

  const notes = typeof b.notes === "string" && b.notes.trim() ? b.notes.trim() : null;

  const metric = await insertBodyMetric(userId, { recordedOn, restingHr, weightKg, notes });
  return NextResponse.json({ metric });
}
