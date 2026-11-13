import { NextRequest, NextResponse } from "next/server";
import { setHome } from "@/lib/db";
import { getCurrentUserId, unauthorized } from "@/lib/auth";

export const runtime = "nodejs";

// Set ({ lat, lng }) or clear ({ lat: null }) where suggested routes start.
export async function PUT(req: NextRequest) {
  const userId = await getCurrentUserId();
  if (!userId) return unauthorized();
  const b = await req.json().catch(() => null);
  if (b && b.lat === null) {
    return NextResponse.json({ home: (await setHome(userId, null)).home });
  }
  const lat = Number(b?.lat);
  const lng = Number(b?.lng);
  if (!b || b.lat == null || b.lng == null || !(Math.abs(lat) <= 90) || !(Math.abs(lng) <= 180)) {
    return NextResponse.json({ error: "Invalid location." }, { status: 400 });
  }
  return NextResponse.json({ home: (await setHome(userId, [lat, lng])).home });
}
