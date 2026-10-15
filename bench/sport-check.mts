// Self-check: a non-run sport is tagged on the summary, never rejected and never
// mistaken for strength work. listRuns() filters on that tag, keeping stats clean.
// NODE_OPTIONS=--no-warnings node bench/sport-check.mts
//
// The app's modules import each other extensionless (`./parseRun`), which Node's
// resolver rejects, so a register hook appends .ts before importing them.
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

const { fitMessagesToRows, fitSport } = await import("../lib/parseFit.ts");
const { sportFromTag } = await import("../lib/sessionMeta.ts");
const { isStrengthSport } = await import("../lib/gym.ts");

const rec = [{ timestamp: new Date("2026-08-26T15:32:56Z"), distance: 0, speed: 6 }];

const expect: Record<string, string> = {
  walking: "walking", hiking: "walking", cycling: "cycling", biking: "cycling",
  swimming: "swimming", rowing: "rowing", running: "running",
};
for (const [tag, sport] of Object.entries(expect)) {
  assert.equal(fitMessagesToRows({ sessionMesgs: [{ sport: tag }], recordMesgs: rec }).length, 1, tag);
  assert.equal(fitSport({ sessionMesgs: [{ sport: tag }] }), sport, tag);
  assert.equal(isStrengthSport(tag, "generic"), false, tag);
}
// Sport can arrive on the sport message instead of the session message.
assert.equal(fitSport({ sportMesgs: [{ sport: "walking" }] }), "walking");
// Untagged (CSV-era) files are runs.
assert.equal(fitSport({}), "running");
assert.equal(sportFromTag(null), "running");
assert.equal(sportFromTag("Outdoor Walking"), "walking");


const { runNameFromFile } = await import("../lib/ingest.ts");
assert.equal(runNameFromFile("2026-10-14-110009-Outdoor Walking-Apple Watch de Agustin.fit", "2026-10-14T09:00:09Z", "walking"), "Outdoor Walk · 2026-10-14");
assert.equal(runNameFromFile("x".repeat(50) + ".fit", "2026-10-14T09:00:09Z", "cycling"), "Bike · 2026-10-14");
assert.equal(runNameFromFile("x".repeat(50) + ".fit", "2026-10-14T09:00:09Z"), "Run · 2026-10-14");

console.log("ok");
