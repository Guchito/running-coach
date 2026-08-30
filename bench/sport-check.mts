// Self-check: a non-run sport must never be summarized as a run.
//   NODE_OPTIONS=--no-warnings node bench/sport-check.mts
//
// The app's modules import each other extensionless (`./parseRun`), which Node's
// resolver rejects, so register a hook that appends .ts before importing them.
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

const { fitMessagesToRows } = await import("../lib/parseFit.ts");

const rec = [{ timestamp: new Date("2026-08-26T15:32:56Z"), distance: 0, speed: 6 }];

// A bike ride carries a full record stream — the case that shipped as a "run".
assert.throws(
  () => fitMessagesToRows({ sessionMesgs: [{ sport: "cycling" }], recordMesgs: rec }),
  /cycling workout, not a run/
);
// Sport can arrive on the sport message instead of the session message.
assert.throws(
  () => fitMessagesToRows({ sportMesgs: [{ sport: "swimming" }], recordMesgs: rec }),
  /not a run/
);
// Runs, and untagged (CSV-era) files, still parse.
assert.equal(fitMessagesToRows({ sessionMesgs: [{ sport: "running" }], recordMesgs: rec }).length, 1);
assert.equal(fitMessagesToRows({ recordMesgs: rec }).length, 1);

console.log("ok");
