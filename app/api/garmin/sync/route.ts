import { NextResponse } from "next/server";
import { syncUserGarmin } from "@/lib/garmin";
import { getCurrentUserId, unauthorized } from "@/lib/auth";

export const runtime = "nodejs";
export const maxDuration = 120;

// Pull recent Garmin activities and import any new ones.
export async function POST() {
  const userId = await getCurrentUserId();
  if (!userId) return unauthorized();
  const result = await syncUserGarmin(userId, { force: true });
  return NextResponse.json(result);
}
