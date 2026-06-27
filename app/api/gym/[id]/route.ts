import { NextRequest, NextResponse } from "next/server";
import { getGymSession, deleteGymSession } from "@/lib/db";
import { getCurrentUserId, unauthorized } from "@/lib/auth";

export const runtime = "nodejs";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const userId = await getCurrentUserId();
  if (!userId) return unauthorized();
  const { id } = await params;
  const session = await getGymSession(userId, Number(id));
  if (!session) return NextResponse.json({ error: "Gym session not found." }, { status: 404 });
  return NextResponse.json({ session });
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const userId = await getCurrentUserId();
  if (!userId) return unauthorized();
  const { id } = await params;
  await deleteGymSession(userId, Number(id));
  return NextResponse.json({ ok: true });
}
