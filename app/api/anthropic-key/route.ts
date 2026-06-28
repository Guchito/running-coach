import { NextRequest, NextResponse } from "next/server";
import { getUserById, setAnthropicApiKey } from "@/lib/db";
import { getCurrentUserId, unauthorized } from "@/lib/auth";

export const runtime = "nodejs";

// Reports only WHETHER the runner has a stored Anthropic key — never the key
// itself. The plaintext is write-only from the client's perspective.
export async function GET() {
  const userId = await getCurrentUserId();
  if (!userId) return unauthorized();
  const user = await getUserById(userId);
  return NextResponse.json({ hasKey: user?.hasAnthropicKey ?? false });
}

// Store the runner's own Anthropic API key (encrypted at rest in the DB).
export async function PUT(req: NextRequest) {
  const userId = await getCurrentUserId();
  if (!userId) return unauthorized();

  const body = (await req.json().catch(() => null)) as { key?: unknown } | null;
  const key = typeof body?.key === "string" ? body.key.trim() : "";
  if (!key) {
    return NextResponse.json({ error: "Provide an API key." }, { status: 400 });
  }
  // Anthropic keys look like "sk-ant-...". Light sanity check, not strict auth.
  if (!key.startsWith("sk-ant-") || key.length < 20) {
    return NextResponse.json(
      { error: "That doesn't look like an Anthropic API key (it should start with 'sk-ant-')." },
      { status: 400 }
    );
  }

  const user = await setAnthropicApiKey(userId, key);
  return NextResponse.json({ hasKey: user.hasAnthropicKey });
}

// Remove the stored key (the runner falls back to the free model).
export async function DELETE() {
  const userId = await getCurrentUserId();
  if (!userId) return unauthorized();
  const user = await setAnthropicApiKey(userId, null);
  return NextResponse.json({ hasKey: user.hasAnthropicKey });
}
