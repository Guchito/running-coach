import { NextRequest, NextResponse } from "next/server";
import { getCurrentUserId, unauthorized } from "@/lib/auth";
import { syncUserDrive } from "@/lib/drive";

export const runtime = "nodejs";
export const maxDuration = 120;

export async function POST(req: NextRequest) {
  const userId = await getCurrentUserId();
  if (!userId) return unauthorized();
  const b = await req.json().catch(() => ({}));
  const result = await syncUserDrive(userId, { force: !!b.force });
  return NextResponse.json(result);
}
