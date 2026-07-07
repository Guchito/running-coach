import { NextRequest, NextResponse } from "next/server";
import { getUserById, setNvidiaApiKey } from "@/lib/db";
import { getCurrentUserId, unauthorized } from "@/lib/auth";

export const runtime = "nodejs";

// Reports only WHETHER the runner has a stored NVIDIA key — never the key
// itself. The plaintext is write-only from the client's perspective.
export async function GET() {
  const userId = await getCurrentUserId();
  if (!userId) return unauthorized();
  const user = await getUserById(userId);
  return NextResponse.json({ hasKey: user?.hasNvidiaKey ?? false });
}

// Store the runner's own NVIDIA API key (encrypted at rest in the DB).
export async function PUT(req: NextRequest) {
  const userId = await getCurrentUserId();
  if (!userId) return unauthorized();

  const body = (await req.json().catch(() => null)) as { key?: unknown } | null;
  const key = typeof body?.key === "string" ? body.key.trim() : "";
  if (!key) {
    return NextResponse.json({ error: "Provide an API key." }, { status: 400 });
  }
  // NVIDIA build.nvidia.com keys look like "nvapi-...". Light sanity check.
  if (!key.startsWith("nvapi-") || key.length < 20) {
    return NextResponse.json(
      { error: "That doesn't look like an NVIDIA API key (it should start with 'nvapi-')." },
      { status: 400 }
    );
  }

  const user = await setNvidiaApiKey(userId, key);
  return NextResponse.json({ hasKey: user.hasNvidiaKey });
}

// Remove the stored key (the runner falls back to the server's shared key).
export async function DELETE() {
  const userId = await getCurrentUserId();
  if (!userId) return unauthorized();
  const user = await setNvidiaApiKey(userId, null);
  return NextResponse.json({ hasKey: user.hasNvidiaKey });
}
