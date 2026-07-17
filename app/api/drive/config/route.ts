import { NextRequest, NextResponse } from "next/server";
import { getUserById, setDriveFolder, setHealthSheet } from "@/lib/db";
import { getCurrentUserId, unauthorized } from "@/lib/auth";
import { isDriveConfigured, serviceAccountEmail, parseFolderId } from "@/lib/drive";
import { parseSheetId } from "@/lib/healthSheet";

export const runtime = "nodejs";

export async function GET() {
  const userId = await getCurrentUserId();
  if (!userId) return unauthorized();
  const user = await getUserById(userId);
  return NextResponse.json({
    configured: isDriveConfigured(),
    serviceAccountEmail: serviceAccountEmail(),
    folderId: user?.driveFolderId ?? null,
    healthSheetId: user?.healthSheetId ?? null,
    lastSync: user?.driveLastSync ?? null,
  });
}

// Updates only the keys present in the body, so the activity folder and the
// Health Metrics sheet save independently.
export async function PUT(req: NextRequest) {
  const userId = await getCurrentUserId();
  if (!userId) return unauthorized();
  const b = await req.json().catch(() => ({}));

  if ("healthSheet" in b) {
    const raw = ((b.healthSheet as string | undefined) ?? "").trim();
    if (!raw) {
      await setHealthSheet(userId, null);
      return NextResponse.json({ healthSheetId: null });
    }
    const sheetId = parseSheetId(raw);
    if (!sheetId) {
      return NextResponse.json(
        { error: "Couldn't read a spreadsheet ID from that. Paste the sheet's share link." },
        { status: 400 }
      );
    }
    const user = await setHealthSheet(userId, sheetId);
    return NextResponse.json({ healthSheetId: user.healthSheetId });
  }

  const raw = ((b.folder as string | undefined) ?? "").trim();
  if (!raw) {
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
