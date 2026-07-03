import { NextResponse } from "next/server";
import { setGarminToken } from "@/lib/db";
import { getCurrentUserId, unauthorized } from "@/lib/auth";

export const runtime = "nodejs";

// Forget the stored Garmin session token.
export async function POST() {
  const userId = await getCurrentUserId();
  if (!userId) return unauthorized();
  await setGarminToken(userId, null);
  return NextResponse.json({ ok: true });
}
