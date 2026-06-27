import { NextRequest, NextResponse } from "next/server";
import { getUserById, updateUserHr } from "@/lib/db";
import { getCurrentUserId, unauthorized } from "@/lib/auth";
import { defaultZones } from "@/lib/hr";
import type { HrZone } from "@/lib/types";

export const runtime = "nodejs";

export async function GET() {
  const userId = await getCurrentUserId();
  if (!userId) return unauthorized();
  const user = await getUserById(userId);
  return NextResponse.json({
    maxHr: user?.maxHr ?? null,
    lactateThresholdHr: user?.lactateThresholdHr ?? null,
    hrZones: user?.hrZones ?? null,
  });
}

export async function PUT(req: NextRequest) {
  const userId = await getCurrentUserId();
  if (!userId) return unauthorized();
  let b: { maxHr?: unknown; lactateThresholdHr?: unknown; hrZones?: unknown };
  try {
    b = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }
  try {
    const maxHr =
      b.maxHr === null || b.maxHr === undefined ? null : Math.round(Number(b.maxHr));
    if (maxHr !== null && (maxHr < 120 || maxHr > 230)) {
      return NextResponse.json({ error: "Max HR should be between 120 and 230." }, { status: 400 });
    }

    const lactateThresholdHr =
      b.lactateThresholdHr === null || b.lactateThresholdHr === undefined
        ? null
        : Math.round(Number(b.lactateThresholdHr));
    if (lactateThresholdHr !== null && (lactateThresholdHr < 100 || lactateThresholdHr > 220)) {
      return NextResponse.json(
        { error: "Lactate threshold HR should be between 100 and 220." },
        { status: 400 }
      );
    }
    if (lactateThresholdHr !== null && maxHr !== null && lactateThresholdHr > maxHr) {
      return NextResponse.json(
        { error: "Lactate threshold HR can't be higher than max HR." },
        { status: 400 }
      );
    }

    let zones: HrZone[] | null = null;
    if (Array.isArray(b.hrZones)) {
      zones = (b.hrZones as HrZone[]).map((z) => ({
        name: String(z.name),
        min: Math.round(Number(z.min)),
        max: Math.round(Number(z.max)),
      }));
    } else if (maxHr) {
      zones = defaultZones(maxHr);
    }

    const user = await updateUserHr(userId, maxHr, lactateThresholdHr, zones);
    return NextResponse.json({
      maxHr: user.maxHr,
      lactateThresholdHr: user.lactateThresholdHr,
      hrZones: user.hrZones,
    });
  } catch (err) {
    console.error("PUT /api/profile failed:", err);
    return NextResponse.json({ error: "Could not save your profile." }, { status: 500 });
  }
}
