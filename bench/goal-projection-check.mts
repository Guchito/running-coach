// Self-check: "if you raced today" must come from race-like efforts, not from
// whatever the longest recent run was.
//
//   NODE_OPTIONS=--no-warnings node bench/goal-projection-check.mts
import assert from "node:assert/strict";
import { registerHooks } from "node:module";

// lib/ uses extensionless imports (Next resolves them); teach node to as well.
registerHooks({
  resolve: (spec, ctx, next) =>
    spec.startsWith(".") && !/\.\w+$/.test(spec) ? next(spec + ".ts", ctx) : next(spec, ctx),
});
const { projectGoalTime } = await import("../lib/stats.ts");

const day = (n: number) => new Date(Date.now() - n * 864e5).toISOString();
const run = (id: number, daysAgo: number, km: number, paceSec: number) => ({
  id,
  startedAt: day(daysAgo),
  distanceM: km * 1000,
  durationSec: km * paceSec,
  avgPaceSecPerKm: paceSec,
  summary: { splits: Array.from({ length: km }, () => ({ distanceM: 1000, durationSec: paceSec })) },
});
const half = { targetDistanceM: 21097 } as any;

const easyLong = run(1, 2, 18, 390); // 6:30/km long run
const tempo = run(2, 10, 10, 300); // 5:00/km 10K tempo
const t = projectGoalTime([easyLong, tempo] as any, half)!;
// Riegel from 10K @ 50:00 → ~1:50:40; the long run alone would say ~2:20.
assert.ok(Math.abs(t - 3000 * Math.pow(2.1097, 1.06)) < 1, `got ${t}`);

assert.equal(projectGoalTime([run(3, 60, 10, 300)] as any, half), null, "efforts > 6 weeks old ignored");
assert.equal(projectGoalTime([run(4, 1, 3, 240)] as any, half), null, "sub-5K efforts ignored");

console.log(`ok — half projected ${Math.floor(t / 3600)}:${String(Math.floor((t % 3600) / 60)).padStart(2, "0")} from the tempo, not the long run`);
