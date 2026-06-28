import { NextRequest, NextResponse } from "next/server";
import { getUserById, setCoachModel } from "@/lib/db";
import { getCurrentUserId, unauthorized } from "@/lib/auth";
import { isCoachModel, resolveCoachModel, providerFor } from "@/lib/coach";

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

  // Claude models are paid and need the runner's own key; don't let one be
  // selected without it (the UI also locks these, this is the backstop).
  if (typeof body.model === "string" && providerFor(body.model) === "anthropic") {
    const current = await getUserById(userId);
    if (!current?.hasAnthropicKey) {
      return NextResponse.json(
        { error: "Add your Anthropic API key before selecting a Claude model." },
        { status: 400 }
      );
    }
  }

  const user = await setCoachModel(userId, (body.model as string | null) ?? null);
  return NextResponse.json({ model: resolveCoachModel(user.coachModel) });
}
