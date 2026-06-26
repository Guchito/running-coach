import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { NextResponse } from "next/server";
import { SESSION_COOKIE, SESSION_MAX_AGE, verifySession, signSession } from "./session";
import type { SessionPayload } from "./session";
import { getUserById } from "./db";

// Server-side (Node runtime) auth helpers for route handlers and server
// components. Reads the session cookie via next/headers.

export async function getSession(): Promise<SessionPayload | null> {
  const store = await cookies();
  return verifySession(store.get(SESSION_COOKIE)?.value);
}

// Resolve the signed-in user, verifying they STILL EXIST in the database.
// A cookie can be cryptographically valid but point at a user who was deleted
// (account removal, DB reset, etc.) — those must be treated as logged out.
export async function getCurrentUserId(): Promise<number | null> {
  const session = await getSession();
  if (!session) return null;
  const user = await getUserById(session.userId);
  return user ? user.id : null;
}

// For server components/pages: return the user id or redirect to login. If the
// cookie points at a missing user, route through the logout endpoint so the
// stale cookie is cleared (avoids a redirect loop with the auth middleware).
export async function requireUserId(): Promise<number> {
  const session = await getSession();
  if (!session) redirect("/login");
  const user = await getUserById(session.userId);
  if (!user) redirect("/api/auth/logout?next=/login");
  return user.id;
}

export function sessionCookieOptions() {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_MAX_AGE,
  };
}

// Build a Set-Cookie value for a freshly signed session, for use with
// NextResponse.cookies.set(...).
export async function createSessionCookie(payload: SessionPayload) {
  const token = await signSession(payload);
  return { name: SESSION_COOKIE, value: token, options: sessionCookieOptions() };
}

export function clearSessionCookie() {
  return {
    name: SESSION_COOKIE,
    value: "",
    options: { ...sessionCookieOptions(), maxAge: 0 },
  };
}

// Standard 401 for API routes when no user is signed in. Also clears the
// session cookie so a stale/orphaned cookie doesn't keep failing.
export function unauthorized() {
  const res = NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  const c = clearSessionCookie();
  res.cookies.set(c.name, c.value, c.options);
  return res;
}
