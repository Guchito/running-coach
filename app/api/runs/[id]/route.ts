import { NextRequest, NextResponse } from "next/server";
import { getRun, deleteRun, renameRun } from "@/lib/db";
import { getCurrentUserId, unauthorized } from "@/lib/auth";

export const runtime = "nodejs";

// Rename a run.
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const userId = await getCurrentUserId();
  if (!userId) return unauthorized();
  const { id } = await params;
  try {
    const b = await req.json();
    const name = (b.name as string | undefined)?.trim();
    if (!name) return NextResponse.json({ error: "A name is required." }, { status: 400 });
    const run = await renameRun(userId, Number(id), name);
    if (!run) return NextResponse.json({ error: "Run not found." }, { status: 404 });
    return NextResponse.json({ run });
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }
}

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
