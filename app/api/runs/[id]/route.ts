import { NextRequest, NextResponse } from "next/server";
import { getRun, deleteRun } from "@/lib/db";
import { getCurrentUserId, unauthorized } from "@/lib/auth";

export const runtime = "nodejs";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const userId = await getCurrentUserId();
  if (!userId) return unauthorized();
  const { id } = await params;
  const run = await getRun(userId, Number(id));
  if (!run) return NextResponse.json({ error: "Run not found." }, { status: 404 });
  return NextResponse.json({ run });
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const userId = await getCurrentUserId();
  if (!userId) return unauthorized();
  const { id } = await params;
  await deleteRun(userId, Number(id));
  return NextResponse.json({ ok: true });
}
