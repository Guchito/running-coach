import { NextRequest, NextResponse } from "next/server";
import { setGarminToken } from "@/lib/db";
import { loginAndExportToken } from "@/lib/garmin";
import { getCurrentUserId, unauthorized } from "@/lib/auth";

export const runtime = "nodejs";
export const maxDuration = 60;

// Connect a Garmin account: log in once, store only the encrypted session token.
export async function POST(req: NextRequest) {
  const userId = await getCurrentUserId();
  if (!userId) return unauthorized();

  let email = "";
  let password = "";
  try {
    const b = await req.json();
    email = String(b.email ?? "").trim();
    password = String(b.password ?? "");
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }
  if (!email || !password) {
    return NextResponse.json({ error: "Email and password are required." }, { status: 400 });
  }

  try {
    const token = await loginAndExportToken(email, password);
    await setGarminToken(userId, token);
    return NextResponse.json({ connected: true });
  } catch (e) {
    const detail = e instanceof Error ? e.message : "";
    return NextResponse.json(
      {
        error:
          "Could not sign in to Garmin Connect. Double-check your email and password. " +
          "Accounts with two-factor authentication aren't supported yet." +
          (detail ? ` (${detail})` : ""),
      },
      { status: 400 }
    );
  }
}
