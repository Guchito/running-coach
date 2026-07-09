import { NextRequest, NextResponse } from "next/server";
import { getUserWithHashById, updateUserPassword } from "@/lib/db";
import { hashPassword, verifyPassword } from "@/lib/password";
import { getCurrentUserId, unauthorized } from "@/lib/auth";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const userId = await getCurrentUserId();
  if (!userId) return unauthorized();
  try {
    const body = await req.json().catch(() => ({}));
    const currentPassword = String(body.currentPassword ?? "");
    const newPassword = String(body.newPassword ?? "");

    // Same rule as signup.
    if (newPassword.length < 8) {
      return NextResponse.json(
        { error: "New password must be at least 8 characters." },
        { status: 400 }
      );
    }

    const user = await getUserWithHashById(userId);
    if (!user) return unauthorized();
    if (!(await verifyPassword(currentPassword, user.passwordHash))) {
      return NextResponse.json({ error: "Current password is incorrect." }, { status: 403 });
    }

    await updateUserPassword(userId, await hashPassword(newPassword));
    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Could not change the password.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
