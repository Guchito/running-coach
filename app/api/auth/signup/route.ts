import { NextRequest, NextResponse } from "next/server";
import { createUser, getUserByEmail } from "@/lib/db";
import { hashPassword } from "@/lib/password";
import { createSessionCookie } from "@/lib/auth";

export const runtime = "nodejs";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function POST(req: NextRequest) {
  try {
    const { email, password, name } = await req.json();
    const cleanEmail = String(email ?? "").trim().toLowerCase();

    if (!EMAIL_RE.test(cleanEmail)) {
      return NextResponse.json({ error: "Enter a valid email address." }, { status: 400 });
    }
    if (typeof password !== "string" || password.length < 8) {
      return NextResponse.json(
        { error: "Password must be at least 8 characters." },
        { status: 400 }
      );
    }

    if (await getUserByEmail(cleanEmail)) {
      return NextResponse.json(
        { error: "An account with that email already exists." },
        { status: 409 }
      );
    }

    const hash = await hashPassword(password);
    const user = await createUser(cleanEmail, hash, name ? String(name).trim() : null);

    const res = NextResponse.json({ user: { id: user.id, email: user.email, name: user.name } });
    const cookie = await createSessionCookie({ userId: user.id, email: user.email });
    res.cookies.set(cookie.name, cookie.value, cookie.options);
    return res;
  } catch (err) {
    const message = err instanceof Error ? err.message : "Could not create account.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
