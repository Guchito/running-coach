import { NextRequest, NextResponse } from "next/server";
import { getRun, deleteRun } from "@/lib/db";

export const runtime = "nodejs";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const run = getRun(Number(id));
  if (!run) return NextResponse.json({ error: "Run not found." }, { status: 404 });
  return NextResponse.json({ run });
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  deleteRun(Number(id));
  return NextResponse.json({ ok: true });
}
