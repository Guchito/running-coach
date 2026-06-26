import { NextRequest, NextResponse } from "next/server";
import { clearSessionCookie } from "@/lib/auth";

export const runtime = "nodejs";

export async function POST() {
  const res = NextResponse.json({ ok: true });
  const c = clearSessionCookie();
  res.cookies.set(c.name, c.value, c.options);
  return res;
}

// GET variant used to clear a stale cookie and redirect (e.g. when the session
// points at a user that no longer exists). ?next=/login controls the target.
export async function GET(req: NextRequest) {
  const next = req.nextUrl.searchParams.get("next") || "/login";
  const res = NextResponse.redirect(new URL(next, req.url));
  const c = clearSessionCookie();
  res.cookies.set(c.name, c.value, c.options);
  return res;
}
