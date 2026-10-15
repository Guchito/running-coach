// Backfill GPS onto runs imported before coordinates were stored, by re-reading
// each run's original Drive file. Only adds lat/lng to the stored series;
// nothing else in the summary changes (a trimmed run is re-trimmed from its
// patched original, exactly as the Trim button does).
//
//   Dry run:  NODE_OPTIONS=--no-warnings node --env-file=.env.local scripts/backfill-gps.mts
//   Write:    NODE_OPTIONS=--no-warnings node --env-file=.env.local scripts/backfill-gps.mts --write
//
// --write first saves every row it will touch to gps-backfill-backup-<time>.json.
import { register } from "node:module";
import fs from "node:fs";
import type { RunSummary, SeriesPoint } from "../lib/types";

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

// Copy lat/lng from a fresh parse onto the stored series, matched on sample
// time. Re-parsing the same file downsamples identically, so times line up.
export function withCoords(stored: SeriesPoint[], fresh: SeriesPoint[]) {
  const at = new Map(fresh.filter((p) => p.lat != null).map((p) => [p.t, p]));
  let matched = 0;
  const series = stored.map((p) => {
    const f = at.get(p.t);
    if (!f) return p;
    matched++;
    return { ...p, lat: f.lat, lng: f.lng };
  });
  return { series, matched };
}

async function main() {
  const write = process.argv.includes("--write");
  const { default: pg } = await import("pg");
  const { downloadFile } = await import("../lib/drive.ts");
  const { parseActivityFile } = await import("../lib/ingest.ts");
  const { trimSummary } = await import("../lib/trimRun.ts");

  const url = process.env.DATABASE_URL!;
  const db = new pg.Client({
    connectionString: url,
    ssl: /localhost|127\.0\.0\.1/.test(url) ? undefined : { rejectUnauthorized: false },
  });
  await db.connect();
  const { rows } = await db.query(
    `SELECT id, name, source_file_id, summary_json FROM runs
     WHERE source_file_id IS NOT NULL AND NOT jsonb_path_exists(summary_json, '$.series[*].lat')
     ORDER BY started_at`
  );
  console.log(`${rows.length} Drive-imported runs without GPS. ${write ? "WRITING." : "Dry run."}`);

  const updates: { id: number; before: unknown; after: RunSummary }[] = [];
  for (const r of rows) {
    const s = r.summary_json as RunSummary;
    try {
      const parsed = parseActivityFile(r.name.endsWith(".csv") ? "x.csv" : "x.fit", await downloadFile(r.source_file_id));
      if (parsed.kind !== "run") { console.log(`skip #${r.id} ${r.name}: file is not a run`); continue; }
      const base = s.untrimmed ?? s;
      const { series, matched } = withCoords(base.series, parsed.summary.series);
      if (matched === 0) { console.log(`skip #${r.id} ${r.name}: file has no GPS`); continue; }
      if (matched < base.series.length * 0.5) { console.log(`skip #${r.id} ${r.name}: only ${matched}/${base.series.length} samples line up`); continue; }
      const patched = { ...base, series };
      const after = s.trim ? trimSummary(patched, s.trim) : patched;
      updates.push({ id: r.id, before: r.summary_json, after });
      console.log(`ok   #${r.id} ${r.name}: ${matched}/${base.series.length} points${s.trim ? " (re-trimmed)" : ""}`);
    } catch (e) {
      console.log(`fail #${r.id} ${r.name}: ${e instanceof Error ? e.message : e}`);
    }
  }

  if (write && updates.length) {
    const file = `gps-backfill-backup-${new Date().toISOString().replace(/[:.]/g, "-")}.json`;
    fs.writeFileSync(file, JSON.stringify(updates.map(({ id, before }) => ({ id, summary_json: before }))));
    console.log(`Backup of ${updates.length} rows: ${file}`);
    for (const u of updates) {
      await db.query(`UPDATE runs SET summary_json = $2 WHERE id = $1`, [u.id, JSON.stringify(u.after)]);
    }
    console.log(`Updated ${updates.length} runs.`);
  } else {
    console.log(`${updates.length} runs would get GPS. Re-run with --write to apply.`);
  }
  await db.end();
}

if (process.argv[1]?.endsWith("backfill-gps.mts")) await main();
