import { NextRequest, NextResponse } from "next/server";
import { SESSION_COOKIE, verifySession } from "@/lib/session";

// Public paths that don't require a session.
const PUBLIC_PAGES = ["/login", "/signup"];

export async function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // Auth API endpoints are always reachable.
  if (pathname.startsWith("/api/auth/")) return NextResponse.next();

  const session = await verifySession(req.cookies.get(SESSION_COOKIE)?.value);
  const isPublicPage = PUBLIC_PAGES.some((p) => pathname === p || pathname.startsWith(p + "/"));

  // Signed-in users shouldn't see login/signup.
  if (session && isPublicPage) {
    return NextResponse.redirect(new URL("/", req.url));
  }

  if (!session && !isPublicPage) {
    // API calls get a 401; page navigations get redirected to login.
    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
    }
    const url = new URL("/login", req.url);
    if (pathname !== "/") url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  // Run on everything except Next internals and static assets.
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)"],
};
