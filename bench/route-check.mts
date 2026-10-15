// Self-check: GPS from a FIT survives into the downsampled series in degrees.
// NODE_OPTIONS=--no-warnings node bench/route-check.mts
import assert from "node:assert";
import { register } from "node:module";
register(
  "data:text/javascript," +
    encodeURIComponent(`
    export async function resolve(spec, ctx, next) {
      try { return await next(spec, ctx); }
      catch (e) { if (spec.startsWith(".")) return await next(spec + ".ts", ctx); throw e; }
    }
  `),
  import.meta.url
);
const { fitMessagesToRows } = await import("../lib/parseFit.ts");
const { summarizeRows } = await import("../lib/parseRun.ts");

const t0 = Date.parse("2026-10-14T09:00:09Z");
const rec = Array.from({ length: 20 }, (_, i) => ({
  timestamp: new Date(t0 + i * 1000),
  distance: i * 2,
  speed: 2,
  // 55.2°N 14.9°E in semicircles, drifting north
  positionLat: Math.round(((55.2 + i * 1e-4) / 180) * 2 ** 31),
  positionLong: Math.round((14.9 / 180) * 2 ** 31),
}));
const s = summarizeRows(fitMessagesToRows({ recordMesgs: rec }));
assert.ok(Math.abs((s.series[0].lat ?? 0) - 55.2) < 1e-6, "lat in degrees");
assert.ok(Math.abs((s.series[0].lng ?? 0) - 14.9) < 1e-6, "lng in degrees");
assert.ok(s.series.every((p) => p.lat != null), "every point keeps its fix");

// No GPS -> no lat/lng keys at all (keeps summary_json small).
const noGps = summarizeRows(fitMessagesToRows({ recordMesgs: rec.map(({ positionLat, positionLong, ...r }) => r) }));
assert.ok(noGps.series.every((p) => !("lat" in p)), "no lat key without GPS");

// Map helpers and the GPS backfill matcher.
const { trackOf, coreBounds, homeTracks } = await import("../lib/sessionMeta.ts");
const { withCoords } = await import("../scripts/backfill-gps.mts");
assert.equal(trackOf(s.series).length, s.series.length);
assert.equal(trackOf(noGps.series).length, 0);
const home: [number, number][] = Array.from({ length: 50 }, (_, i) => [55.2 + i * 0.002, 12.4 + i * 0.002]);
const away: [number, number][] = [[40.4, -3.7], [40.5, -3.6]];
assert.deepEqual(coreBounds([[[1, 2], [3, 4]]]), [[1, 2], [3, 4]], "keep=1 is the bounding box");
const [[s0], [n0]] = coreBounds([home, away], 0.9);
assert.ok(s0 > 55 && n0 < 55.4, "a lone outlier trimmed by the core share");
// Many trips, in several directions: home is still the densest start cluster.
const trip = (lat: number, lng: number): [number, number][] => [[lat, lng], [lat + 0.01, lng]];
const mix = [home, home, home, trip(38.2, 12.7), trip(38.2, 12.7), trip(59.3, 18.1), trip(56.2, 10.2), trip(56.2, 10.2)];
assert.deepEqual(homeTracks(mix), [home, home, home], "trips to other cities fall away");
const stripped = noGps.series;
const patched = withCoords(stripped, s.series);
assert.equal(patched.matched, stripped.length, "same file re-parsed lines up on every sample");
assert.ok(patched.series.every((p) => p.lat != null));
assert.equal(withCoords(stripped, s.series.map((p) => ({ ...p, t: p.t + 0.5 }))).matched, 0, "no false matches");
console.log("ok");
