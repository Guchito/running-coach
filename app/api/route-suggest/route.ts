import { NextRequest, NextResponse } from "next/server";
import { getUserById, listRuns } from "@/lib/db";
import { getCurrentUserId, unauthorized } from "@/lib/auth";
import { trackOf, type LatLng } from "@/lib/sessionMeta";
import { bestCandidate, cellCounts, homeStart, pickPastRun } from "@/lib/routeSuggest";

export const runtime = "nodejs";

// One round-trip loop of about `lengthM` from `start`, from OpenRouteService.
async function orsLoop(key: string, start: LatLng, lengthM: number, seed: number) {
  const res = await fetch(
    "https://api.openrouteservice.org/v2/directions/foot-walking/geojson",
    {
      method: "POST",
      headers: { Authorization: key, "Content-Type": "application/json" },
      body: JSON.stringify({
        coordinates: [[start[1], start[0]]],
        options: { round_trip: { length: lengthM, points: 3, seed } },
      }),
      signal: AbortSignal.timeout(15000),
    }
  );
  const body = await res.json().catch(() => null);
  const feature = body?.features?.[0];
  if (!res.ok || !feature) {
    throw new Error(body?.error?.message ?? body?.error ?? `Routing service error (${res.status}).`);
  }
  return {
    track: (feature.geometry.coordinates as number[][]).map(([lng, lat]): LatLng => [lat, lng]),
    distanceM: Number(feature.properties?.summary?.distance ?? lengthM),
  };
}

// Starts from the home set in Settings, else where most runs start.
// A route for a planned run of `km`: a past run near home of about that
// length (seed 0), otherwise the generated loop along the most-run streets.
// A higher seed skips the past run and asks for different loops.
export async function GET(req: NextRequest) {
  const userId = await getCurrentUserId();
  if (!userId) return unauthorized();

  const km = Number(req.nextUrl.searchParams.get("km"));
  const seed = Number(req.nextUrl.searchParams.get("seed") ?? 0);
  if (!(km > 0 && km <= 60) || !Number.isInteger(seed) || seed < 0 || seed > 1000) {
    return NextResponse.json({ error: "Invalid distance." }, { status: 400 });
  }
  const targetM = km * 1000;

  try {
    const [runs, user] = await Promise.all([listRuns(userId), getUserById(userId)]);
    const home = user?.home ?? null;
    if (seed === 0) {
      const past = pickPastRun(runs, targetM, home);
      if (past) {
        return NextResponse.json({
          source: "past",
          runId: past.run.id,
          name: past.run.name,
          distanceM: past.run.distanceM,
          track: past.track,
        });
      }
    }

    const tracks = runs.map((r) => trackOf(r.summary.series)).filter((t) => t.length > 1);
    const start = home ?? homeStart(tracks);
    if (!start) {
      return NextResponse.json(
        { error: "No runs with GPS yet. Set your home in Settings to give routes a starting point." },
        { status: 404 }
      );
    }
    const key = process.env.ORS_API_KEY;
    if (!key) {
      return NextResponse.json(
        { error: `No past run near ${km} km, and new routes need ORS_API_KEY to be set.` },
        { status: 404 }
      );
    }

    const results = await Promise.allSettled(
      [0, 1, 2].map((i) => orsLoop(key, start, targetM, seed * 3 + i))
    );
    const loops = results.flatMap((r) => (r.status === "fulfilled" ? [r.value] : []));
    const best = bestCandidate(loops, cellCounts(tracks));
    if (!best) {
      const failed = results.find((r) => r.status === "rejected");
      return NextResponse.json(
        { error: failed ? String(failed.reason?.message ?? failed.reason) : "No route found." },
        { status: 502 }
      );
    }
    return NextResponse.json({ source: "generated", ...best });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Could not suggest a route." },
      { status: 500 }
    );
  }
}
