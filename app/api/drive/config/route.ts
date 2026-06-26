import { NextRequest, NextResponse } from "next/server";
import { getUserById, setDriveFolder } from "@/lib/db";
import { getCurrentUserId, unauthorized } from "@/lib/auth";
import { isDriveConfigured, serviceAccountEmail, parseFolderId } from "@/lib/drive";

export const runtime = "nodejs";

export async function GET() {
  const userId = await getCurrentUserId();
  if (!userId) return unauthorized();
  const user = await getUserById(userId);
  return NextResponse.json({
    configured: isDriveConfigured(),
    serviceAccountEmail: serviceAccountEmail(),
    folderId: user?.driveFolderId ?? null,
    lastSync: user?.driveLastSync ?? null,
  });
}

export async function PUT(req: NextRequest) {
  const userId = await getCurrentUserId();
  if (!userId) return unauthorized();
  const b = await req.json().catch(() => ({}));
  const raw = (b.folder as string | undefined) ?? "";

  if (!raw.trim()) {
    await setDriveFolder(userId, null);
    return NextResponse.json({ folderId: null });
  }
  const folderId = parseFolderId(raw);
  if (!folderId) {
    return NextResponse.json(
      { error: "Couldn't read a folder ID from that. Paste the folder's share link or its ID." },
      { status: 400 }
    );
  }
  const user = await setDriveFolder(userId, folderId);
  return NextResponse.json({ folderId: user.driveFolderId });
}
