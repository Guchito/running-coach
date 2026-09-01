import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { SESSION_COOKIE, verifySession } from "@/lib/session";

// Keeps the public demo account read-only.
//
// Every write in this app is a non-GET request to /api/*, so one check here
// covers all of them instead of a guard in ~34 route handlers. The demo flag is
// carried by the session cookie itself (set only by /api/auth/demo), so this
// needs no database lookup.
const READ_ONLY_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

export async function proxy(req: NextRequest) {
  if (READ_ONLY_METHODS.has(req.method)) return NextResponse.next();

  // Auth routes stay open: a visitor must still be able to sign out, and to
  // sign up or sign in to a real account of their own.
  if (req.nextUrl.pathname.startsWith("/api/auth/")) return NextResponse.next();

  const session = await verifySession(req.cookies.get(SESSION_COOKIE)?.value);

  // The coach is the whole point of the demo, so POST /api/chat is allowed. It
  // persists nothing and its write tools are disabled for demo sessions — see
  // the readOnly path in app/api/chat/route.ts.
  if (session?.demo && req.nextUrl.pathname === "/api/chat" && req.method === "POST") {
    return NextResponse.next();
  }

  if (session?.demo) {
    return NextResponse.json(
      { error: "This is a read-only demo. Create your own account to upload data." },
      { status: 403 }
    );
  }
  return NextResponse.next();
}

export const config = { matcher: "/api/:path*" };
