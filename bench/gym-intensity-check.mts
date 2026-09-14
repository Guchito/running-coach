// Self-check: a session with no RPE gets an estimate that tracks the work done.
//   NODE_OPTIONS=--no-warnings node bench/gym-intensity-check.mts
//
// The app's modules import each other extensionless (`./gymProgress`), which
// Node's resolver rejects, so register a hook that appends .ts before importing.
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

const { estimateIntensity } = await import("../lib/gymIntensity.ts");

// A "pull" session of `sets` × 100kg × 10 reps, lasting an hour.
let nextId = 1;
const session = (kgPerSet: number, sets: number, opts: Record<string, unknown> = {}) => ({
  id: nextId++,
  name: "Pull",
  type: "pull",
  startedAt: "2026-09-10T18:00:00Z",
  durationSec: 3600,
  rpe: null,
  avgHr: null,
  maxHr: null,
  calories: null,
  notes: null,
  summary: {},
  exercises: [
    {
      name: "Deadlift (Barbell)",
      sets: Array.from({ length: sets }, () => ({ weightKg: kgPerSet, reps: 10 })),
    },
  ],
  strongLink: null,
  createdAt: "2026-09-10T19:00:00Z",
  ...opts,
});

// Three ordinary sessions to set the runner's own normal (3 sets × 100kg).
const history = [session(100, 3), session(100, 3), session(100, 3)];

const normal = estimateIntensity(session(100, 3), history);
const heavy = estimateIntensity(session(200, 3), history);
const light = estimateIntensity(session(50, 3), history);

// A session at your usual tonnage is a normal working session, not a max effort.
assert.ok(normal && normal.rpe >= 6 && normal.rpe <= 7, `normal was ${normal?.rpe}`);
// Double the tonnage must rate harder, half must rate easier — the whole point.
assert.ok(heavy!.rpe > normal!.rpe, `heavy ${heavy!.rpe} !> normal ${normal!.rpe}`);
assert.ok(light!.rpe < normal!.rpe, `light ${light!.rpe} !< normal ${normal!.rpe}`);
// Never off the 1-10 scale, however lopsided the session.
for (const kg of [1, 10, 1000, 100000]) {
  const e = estimateIntensity(session(kg, 3), history)!;
  assert.ok(e.rpe >= 1 && e.rpe <= 10, `${kg}kg → ${e.rpe} off scale`);
}

// Heart rate alone carries a first-ever session (no peers to compare against).
const hrOnly = estimateIntensity(
  { ...session(0, 0), exercises: null, avgHr: 150 } as never,
  []
);
assert.ok(hrOnly && hrOnly.basis.includes("heart rate"), "HR-only estimate missing");
// 150bpm against the default 190 max is hard work, not a stroll.
assert.ok(hrOnly!.rpe >= 7, `HR-only was ${hrOnly!.rpe}`);

// Lifting parks average HR near half of max, so a real strength session must
// not fall out as "barely trained" just because the HR was low — the exact
// mistake the coach prompt warns about.
const lowHrLift = estimateIntensity(
  { ...session(0, 0), exercises: null, avgHr: 95 } as never,
  []
)!;
assert.ok(lowHrLift.rpe >= 5.5, `95bpm lifting session read as ${lowHrLift.rpe}`);
// The same HR on a conditioning session genuinely is easy — that one is paced
// like a run, so it keeps the running anchors.
const lowHrCardio = estimateIntensity(
  { ...session(0, 0), exercises: null, avgHr: 95, type: "cardio" } as never,
  []
)!;
assert.ok(lowHrCardio.rpe < 4, `95bpm cardio read as ${lowHrCardio.rpe}`);

// Peers of a different type must not be used as the baseline.
const pushPeers = history.map((s) => ({ ...s, type: "push" }));
const noBaseline = estimateIntensity(session(200, 3), pushPeers as never);
assert.ok(!noBaseline?.basis.includes("tonnage"), "compared against another session type");

// Nothing recorded at all → no invented number.
assert.equal(estimateIntensity({ ...session(0, 0), exercises: null, durationSec: 0 } as never, []), null);

console.log("gym intensity: all checks passed");
