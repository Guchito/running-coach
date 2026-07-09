import { NextRequest, NextResponse } from "next/server";
import { getUserById, updateUserAccount } from "@/lib/db";
import { getCurrentUserId, unauthorized } from "@/lib/auth";

export const runtime = "nodejs";

// Update the display name. Email is the login identity and can't be changed
// here — the form shows it read-only and this endpoint ignores any email sent.
export async function PATCH(req: NextRequest) {
  const userId = await getCurrentUserId();
  if (!userId) return unauthorized();
  try {
    const body = await req.json().catch(() => ({}));
    const name = typeof body.name === "string" && body.name.trim() ? body.name.trim() : null;

    const current = await getUserById(userId);
    if (!current) return unauthorized();

    const user = await updateUserAccount(userId, name, current.email);
    return NextResponse.json({ user: { name: user.name, email: user.email } });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Could not save your details.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
