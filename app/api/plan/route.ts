import { NextResponse } from "next/server";
import { getPlan, setMacroInstructions } from "@/lib/db";
import { getCurrentUserId, unauthorized } from "@/lib/auth";

export const runtime = "nodejs";

export async function GET() {
  const userId = await getCurrentUserId();
  if (!userId) return unauthorized();
  return NextResponse.json({ plan: await getPlan(userId) });
}

// Update the runner's free-text plan instructions.
export async function PUT(req: Request) {
  const userId = await getCurrentUserId();
  if (!userId) return unauthorized();

  const body = (await req.json().catch(() => null)) as { instructions?: unknown } | null;
  if (!body || typeof body.instructions !== "string") {
    return NextResponse.json({ error: "instructions (string) is required" }, { status: 400 });
  }

  const text = body.instructions.trim();
  const macro = await setMacroInstructions(userId, text || null);
  return NextResponse.json({ macro });
}
