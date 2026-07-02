import { NextRequest, NextResponse } from "next/server";
import { setAutoNameRuns } from "@/lib/db";
import { getCurrentUserId, unauthorized } from "@/lib/auth";

export const runtime = "nodejs";

// Toggle whether the coach renames runs automatically after analyzing them.
export async function PUT(req: NextRequest) {
  const userId = await getCurrentUserId();
  if (!userId) return unauthorized();
  try {
    const b = await req.json();
    const user = await setAutoNameRuns(userId, b.enabled === true);
    return NextResponse.json({ autoNameRuns: user.autoNameRuns });
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }
}
