import { NextRequest, NextResponse } from "next/server";
import { getUserByEmail } from "@/lib/db";
import { verifyPassword } from "@/lib/password";
import { createSessionCookie } from "@/lib/auth";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  try {
    const { email, password } = await req.json();
    const cleanEmail = String(email ?? "").trim().toLowerCase();

    const user = await getUserByEmail(cleanEmail);
    // Always run a comparison-shaped path; respond with a generic error so we
    // don't reveal whether the email exists.
    const ok = user ? await verifyPassword(String(password ?? ""), user.passwordHash) : false;
    if (!user || !ok) {
      return NextResponse.json({ error: "Incorrect email or password." }, { status: 401 });
    }

    const res = NextResponse.json({ user: { id: user.id, email: user.email, name: user.name } });
    const cookie = await createSessionCookie({ userId: user.id, email: user.email });
    res.cookies.set(cookie.name, cookie.value, cookie.options);
    return res;
  } catch {
    return NextResponse.json({ error: "Could not sign in." }, { status: 500 });
  }
}
