import { NextRequest, NextResponse } from "next/server";
import { getUserById, setCoachModel } from "@/lib/db";
import { getCurrentUserId, unauthorized } from "@/lib/auth";
import { isCoachModel, resolveCoachModel } from "@/lib/coach";

export const runtime = "nodejs";

export async function GET() {
  const userId = await getCurrentUserId();
  if (!userId) return unauthorized();
  const user = await getUserById(userId);
  return NextResponse.json({ model: resolveCoachModel(user?.coachModel) });
}

export async function PUT(req: NextRequest) {
  const userId = await getCurrentUserId();
  if (!userId) return unauthorized();

  const body = (await req.json().catch(() => null)) as { model?: unknown } | null;
  // null clears the override (fall back to the default); otherwise must be a known model.
  if (!body || (body.model !== null && !isCoachModel(body.model))) {
    return NextResponse.json({ error: "Unknown model." }, { status: 400 });
  }

  const user = await setCoachModel(userId, (body.model as string | null) ?? null);
  return NextResponse.json({ model: resolveCoachModel(user.coachModel) });
}
