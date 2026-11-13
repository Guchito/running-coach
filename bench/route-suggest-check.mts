// Self-check: route suggestion picks familiar past runs and familiar loops.
// NODE_OPTIONS=--no-warnings node bench/route-suggest-check.mts
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
const { pickPastRun, bestCandidate, cellCounts, familiarity, homeStart, toGpx } = await import(
  "../lib/routeSuggest.ts"
);

type P = [number, number];
// A straight track heading north or east from a start, one point every ~55 m.
const line = (lat: number, lng: number, dir: "n" | "e", n = 40): P[] =>
  Array.from({ length: n }, (_, i) => (dir === "n" ? [lat + i * 5e-4, lng] : [lat, lng + i * 5e-4]));
let id = 0;
const run = (track: P[], distanceM: number) =>
  ({
    id: ++id,
    name: `run ${id}`,
    distanceM,
    summary: { series: track.map(([lat, lng]) => ({ lat, lng })) },
  }) as never;

// Home: the north street is run three times, the east street once. An away
// trip of exactly the target length must be ignored.
const north6 = run(line(55, 15, "n"), 6100);
const runs = [
  run(line(55, 15, "e"), 6000),
  north6,
  run(line(55, 15, "n"), 9000),
  run(line(55, 15, "n"), 12000),
  run(line(40, -3, "n"), 6000),
];

assert.equal(pickPastRun(runs, 6000)?.run, north6, "prefers the more-repeated street");
assert.equal(pickPastRun(runs, 7000), null, "nothing within tolerance");
assert.equal(pickPastRun(runs, 6000)?.track.length, 40);
assert.equal(pickPastRun([run(line(40, -3, "n"), 6000)], 3000), null);
// An explicit home wins over the usual area: only runs starting next to it.
assert.equal(pickPastRun(runs, 6000, [40.001, -3])?.run, runs[4], "home set: run from there");
assert.equal(pickPastRun(runs, 6000, [48, 2]), null, "home set: nothing starts there");

const tracks = runs.map((r: { summary: { series: { lat: number; lng: number }[] } }) =>
  r.summary.series.map((p): P => [p.lat, p.lng])
);
const counts = cellCounts(tracks);
// A router emits only the two ends of a straight street: still fully familiar.
const sparseNorth: P[] = [[55, 15], [55 + 39 * 5e-4, 15]];
assert.equal(familiarity(sparseNorth, counts), familiarity(line(55, 15, "n"), counts), "sparse track has no gaps");
const picked = bestCandidate([{ track: line(55, 15, "e") }, { track: sparseNorth }], counts);
assert.equal(picked?.track, sparseNorth, "picks the loop on familiar streets");
assert.equal(bestCandidate([], counts), null);

assert.deepEqual(homeStart(tracks), [55, 15], "usual start ignores the away trip");
assert.equal(homeStart([]), null);

const gpx = toGpx([[55.1, 15.2], [55.3, 15.4]], "6 km <loop> & back");
assert.equal(gpx.match(/<trkpt /g)?.length, 2);
assert.ok(gpx.includes('<trkpt lat="55.1" lon="15.2"/>'), "lat/lon in the right order");
assert.ok(gpx.includes("6 km &lt;loop&gt; &amp; back"), "name escaped");

console.log("route-suggest-check ok");
