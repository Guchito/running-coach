// Self-check: trimming a race's GPS overshoot.
//   NODE_OPTIONS=--no-warnings node bench/trim-check.mts
import assert from "node:assert";
import { register } from "node:module";

register(
  "data:text/javascript," +
    encodeURIComponent(`
      export async function resolve(spec, ctx, next) {
        try { return await next(spec, ctx); }
        catch (e) {
          if (spec.startsWith(".")) return await next(spec + ".ts", ctx);
          throw e;
        }
      }
    `),
  import.meta.url
);

const { summarizeRows } = await import("../lib/parseRun.ts");
const { trimSummary, segmentSec } = await import("../lib/trimRun.ts");

// 5.06 km race: first 60 m shuffling to the start line at 1 m/s, then 3.4 m/s.
const rows = [];
let d = 0;
for (let t = 0; d < 5060; t++) {
  rows.push({
    iso: t === 0 ? "2026-09-20T09:00:00Z" : "", hr: 170, power: null, cadence: 88,
    elev: 10, dist: d, speed: d < 60 ? 1 : 3.4, stride: null, vo: null, gct: null,
    lap: null, intensity: "", since: t,
  });
  d = Math.min(5060, d + (d < 60 ? 1 : 3.4));
}
const s = summarizeRows(rows);

// Slow shuffle shows up as ~60 s for the first 60 m.
assert.ok(Math.abs(segmentSec(s, 0, 60) - 60) < 8, "start segment ≈ 60 s");

const t = trimSummary(s, { startM: 60, endM: 0 });
assert.ok(Math.abs(t.distanceM - (s.distanceM - 60)) < 1e-6);
assert.ok(Math.abs(s.durationSec - t.durationSec - 60) < 8, "≈60 s removed");
assert.equal(t.splits.length, 5);
assert.ok(Math.abs(t.splits.reduce((a, x) => a + x.durationSec, 0) - t.durationSec) < 1);
assert.equal(t.untrimmed, s);
assert.equal(t.series[0].t >= 0, true);

console.log("trim-check ok:", s.durationSec, "→", Math.round(t.durationSec), "s");
