import { NextRequest, NextResponse } from "next/server";
import { clearDailyHealthLog } from "@/lib/db";
import { getCurrentUserId, unauthorized } from "@/lib/auth";

export const runtime = "nodejs";

// Clears the manually-loggable fields (resting HR, weight, note) for one day.
// Sheet-synced columns are untouched; a cleared value that also lives in the
// sheet comes back on the next sync.
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ date: string }> }) {
  const userId = await getCurrentUserId();
  if (!userId) return unauthorized();
  const { date } = await params;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return NextResponse.json({ error: "Invalid date." }, { status: 400 });
  }
  const ok = await clearDailyHealthLog(userId, date);
  if (!ok) return NextResponse.json({ error: "Not found." }, { status: 404 });
  return NextResponse.json({ ok: true });
}
