import { NextRequest, NextResponse } from "next/server";
import { getCurrentUserId, unauthorized } from "@/lib/auth";
import { fetchWorkoutVisualization, toVisualizerMuscles } from "@/lib/exerciseDb";
import { getMuscleMap, putMuscleMap } from "@/lib/db";

export const runtime = "nodejs";

// Proxies the muscle-visualizer render so the RapidAPI key stays server-side.
// GET ?target=A,B&secondary=C&gender=male
//
// Every render is stored in the DB first: the free tier allows only 100 renders
// a MONTH, and the image is deterministic for its muscle set, so a diagram is
// fetched once and served locally ever after. Relying on HTTP caching alone
// burned quota on every cold browser and left the card dead — for the rest of
// the month — once the allowance ran out.
export async function GET(req: NextRequest) {
  const userId = await getCurrentUserId();
  if (!userId) return unauthorized();

  const sp = req.nextUrl.searchParams;
  const target = toVisualizerMuscles((sp.get("target") ?? "").split(",").filter(Boolean));
  if (target.length === 0) return new NextResponse(null, { status: 400 });
  const secondary = toVisualizerMuscles((sp.get("secondary") ?? "").split(",").filter(Boolean));
  const gender = sp.get("gender") === "female" ? "female" : "male";

  // Normalized so the same muscle set in a different order is one cache entry.
  const key = `${gender}|${[...target].sort().join(",")}|${[...secondary].sort().join(",")}`;

  const cached = await getMuscleMap(key);
  if (cached) return image(cached.bytes, cached.contentType);

  try {
    const { bytes, contentType } = await fetchWorkoutVisualization({
      targetMuscles: target,
      secondaryMuscles: secondary,
      gender,
    });
    const buf = Buffer.from(bytes);
    await putMuscleMap(key, contentType, buf);
    return image(buf, contentType);
  } catch {
    return new NextResponse(null, { status: 502 });
  }
}

function image(bytes: Buffer, contentType: string) {
  return new NextResponse(new Uint8Array(bytes), {
    headers: {
      "Content-Type": contentType,
      // Deterministic for a given muscle set — cache aggressively.
      "Cache-Control": "public, max-age=2592000, immutable",
    },
  });
}
