import { NextRequest, NextResponse } from "next/server";
import { getCurrentUserId, unauthorized } from "@/lib/auth";
import { fetchWorkoutVisualization, toVisualizerMuscles } from "@/lib/exerciseDb";

export const runtime = "nodejs";

// Proxies the muscle-visualizer render so the RapidAPI key stays server-side and
// the (deterministic) image can be cached hard. GET ?target=A,B&secondary=C&gender=male
export async function GET(req: NextRequest) {
  const userId = await getCurrentUserId();
  if (!userId) return unauthorized();

  const sp = req.nextUrl.searchParams;
  const target = toVisualizerMuscles((sp.get("target") ?? "").split(",").filter(Boolean));
  if (target.length === 0) return new NextResponse(null, { status: 400 });
  const secondary = toVisualizerMuscles((sp.get("secondary") ?? "").split(",").filter(Boolean));
  const gender = sp.get("gender") === "female" ? "female" : "male";

  try {
    const { bytes, contentType } = await fetchWorkoutVisualization({
      targetMuscles: target,
      secondaryMuscles: secondary,
      gender,
    });
    return new NextResponse(Buffer.from(bytes), {
      headers: {
        "Content-Type": contentType,
        // Deterministic for a given muscle set — cache aggressively.
        "Cache-Control": "public, max-age=2592000, immutable",
      },
    });
  } catch {
    return new NextResponse(null, { status: 502 });
  }
}
