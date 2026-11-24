// Self-check: Relative Effort, Fitness & Freshness, Grade Adjusted Pace.
//   NODE_OPTIONS=--no-warnings node bench/fitness-check.mts
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

const { relativeEffort, fitnessFreshness, runGap, splitGaps, gradeCostFactor, effortSessions, weeklyEffort, effortVerdict, fitnessChange } =
  await import("../lib/fitness.ts");
const { defaultZones } = await import("../lib/hr.ts");

const zones = defaultZones(190); // Z2 = 114–132
// Fitted to Strava: with Z5 starting at 169 bpm, 67 min lifting at 88 bpm is
// 8 on Strava, 90 min at 94 bpm is 13.
const z169 = [...zones.slice(0, 4), { ...zones[4], min: 169 }];
assert.equal(relativeEffort({ "88": 4043 }, z169), 7);
assert.equal(relativeEffort({ "94": 5401 }, z169), 12);
// Linear in time: 2× the time → 2× the score.
assert.ok(Math.abs(relativeEffort({ "160": 2 * 1800 }, zones)! - 2 * relativeEffort({ "160": 1800 }, zones)!) <= 1);
// Missing HR seconds are filled like the rest: half the seconds recorded over
// the same duration scores the same as fully recorded.
assert.equal(relativeEffort({ "160": 1800 }, zones, 3600), relativeEffort({ "160": 3600 }, zones));
assert.equal(relativeEffort({ "160": 3600 }, zones, 1800), relativeEffort({ "160": 3600 }, zones), "never scales down");
const RE = relativeEffort({ "125": 3600 }, zones)!; // per test session below
assert.equal(relativeEffort({}, zones), null);

// Fitness & freshness: daily 120 for 60 days → fitness climbs, fatigue ~120,
// form negative while building; 10 rest days → fatigue drops below fitness.
const now = Date.parse("2026-06-30T12:00:00");
const run = (daysAgo: number, id = daysAgo) =>
  ({ id, sport: "running", name: "r", durationSec: 3600, startedAt: new Date(now - daysAgo * 86400000).toISOString(), summary: { hrHistogram: { "125": 3600 } } }) as any;
const build = effortSessions(Array.from({ length: 60 }, (_, i) => run(i + 10)), [], zones);
const ff = fitnessFreshness(build, 90, now);
const peak = ff[ff.length - 11];
const today = ff[ff.length - 1];
assert.ok(peak.fatigue > peak.fitness && peak.form < 0, "building → negative form");
assert.ok(today.form > 0 && today.fatigue < today.fitness, "rest → positive form");
assert.ok(ff.length <= 90);
assert.deepEqual(fitnessFreshness([]), []);
assert.equal(ff.find((d) => d.effort)!.sessionHref?.startsWith("/runs/"), true);

// Gym: whole session at avg HR.
const gym = effortSessions([], [{ id: 1, type: "push", name: "Push", startedAt: new Date(now).toISOString(), durationSec: 1800, avgHr: 125 }] as any, zones);
assert.equal(gym[0].effort, relativeEffort({ "125": 1800 }, zones));
assert.equal(gym[0].href, "/gym/1");
assert.equal(effortSessions([], [{ id: 2, avgHr: null, durationSec: 1800 }] as any, zones).length, 0);

// Weekly: 2026-06-29 is a Monday. 3 prior weeks of 1 session/day → band ±35% of 7×RE.
const mon = Date.parse("2026-06-29T12:00:00");
const daily = effortSessions(Array.from({ length: 21 }, (_, i) => run(0, i)).map((r: any, i: number) => ({ ...r, startedAt: new Date(mon - (i + 1) * 86400000).toISOString() })), [], zones);
const thisWeek = effortSessions([{ ...run(0, 99), startedAt: new Date(mon + 2 * 86400000).toISOString() }], [], zones);
const all = weeklyEffort([...daily, ...thisWeek], mon + 3 * 86400000, 12, mon + 30 * 86400000);
const wk = all.weeks[all.selected];
assert.equal(wk.weekStart, "2026-06-29");
assert.equal(wk.weekEnd, "2026-07-05");
assert.equal(wk.total, RE);
assert.deepEqual(wk.days, [0, 0, RE, 0, 0, 0, 0]);
assert.equal(wk.low, Math.round(7 * RE * 0.65));
assert.equal(wk.high, Math.round(7 * RE * 1.35));
assert.equal(wk.status, "recovery");
// Above the range: "above" up to 20% past the top, "wayAbove" beyond.
const statusAt = (effort: number) => {
  const w = weeklyEffort([...daily, { ...thisWeek[0], effort }], mon + 3 * 86400000, 12, mon + 30 * 86400000);
  return w.weeks[w.selected].status;
};
assert.equal(statusAt(Math.round(7 * RE * 1.35) + 5), "above");
assert.equal(statusAt(Math.round(7 * RE * 1.35 * 1.25)), "wayAbove");
const ongoing = weeklyEffort([...daily, ...thisWeek], mon, 12, mon);
assert.equal(ongoing.weeks[ongoing.selected].status, "progress", "unfinished week");
// Window runs up to the current week; the selected week sits inside it.
assert.equal(all.weeks.length, 12);
assert.equal(all.weeks[11].weekStart, "2026-07-27"); // now = mon + 30d → week of 27 Jul
assert.equal(all.selected, 7);
assert.deepEqual(all.weeks[6].days, [RE, RE, RE, RE, RE, RE, RE]);
assert.equal(wk.sessions.length, 1);

// Verdict: 1.5× the usual effort → Tough, "stronger than usual".
const hard = { ...thisWeek[0], effort: Math.round(RE * 1.5) };
const v = effortVerdict(hard.effort, [...daily, hard], hard);
assert.equal(v.label, "Tough");
assert.match(v.message, /stronger/);
assert.equal(v.band, "higher");
assert.equal(effortVerdict(RE, [...daily, { ...hard, effort: RE }], { ...hard, effort: RE }).band, "average");
assert.equal(effortVerdict(RE, [hard], hard).band, null, "no history");

// Fitness change: a hard session (300) adds fitness on its day: (300 − ~11)/42 ≈ +7.
const big = { ...thisWeek[0], effort: 300 };
const fc = fitnessChange([...daily, big], Date.parse(big.startedAt))!;
assert.ok(fc.delta >= 6 && fc.delta <= 8, `delta ${fc.delta}`);
assert.ok(fc.trend.length <= 29 && fc.trend.at(-1) === fc.fitness);

// GAP: flat → equals pace; uphill → faster than actual pace.
assert.equal(gradeCostFactor(0), 1);
const flat = [0, 1, 2].map((i) => ({ t: i * 150, distM: i * 500, elevM: 10 }) as any);
assert.equal(Math.round(runGap(flat)!), 300);
const hill = [0, 1, 2].map((i) => ({ t: i * 180, distM: i * 500, elevM: i * 25 }) as any); // 5% up
assert.ok(runGap(hill)! < 360, "uphill GAP is faster than actual 6:00/km");
const gaps = splitGaps(flat, [{ distanceM: 1000 } as any]);
assert.equal(Math.round(gaps[0]!), 300);
assert.equal(runGap([{ t: 0, distM: 0, elevM: null }, { t: 300, distM: 1000, elevM: null }] as any), null);

console.log("fitness-check: ok");
