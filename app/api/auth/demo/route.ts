import { NextResponse } from "next/server";
import { getUserByEmail } from "@/lib/db";
import { createSessionCookie } from "@/lib/auth";

export const runtime = "nodejs";

// Public, password-less sign-in to the shared demo account (DEMO_USER_EMAIL).
// The session it mints carries `demo: true`, which proxy.ts turns into a
// blanket block on every write, so visitors can look around without touching
// the data. To push new data in, sign in to the same account through the normal
// form with its password — that session isn't flagged and can write as usual.
export async function POST() {
  const email = process.env.DEMO_USER_EMAIL?.trim().toLowerCase();
  if (!email) {
    return NextResponse.json({ error: "No demo account is configured." }, { status: 404 });
  }

  const user = await getUserByEmail(email);
  if (!user) {
    return NextResponse.json({ error: "The demo account no longer exists." }, { status: 404 });
  }

  // The demo account is the owner's real account: keep its address out of
  // the public response and the (readable) session token. Nothing reads the
  // session email except for display.
  const PUBLIC_EMAIL = "demo@example.com";
  const res = NextResponse.json({ user: { id: user.id, email: PUBLIC_EMAIL, name: user.name } });
  const cookie = await createSessionCookie({ userId: user.id, email: PUBLIC_EMAIL, demo: true });
  res.cookies.set(cookie.name, cookie.value, cookie.options);
  return res;
}
