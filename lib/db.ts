import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import path from "node:path";
import type { RunRow, RunSummary, Goal, ChatMessage } from "./types";

// Single shared connection. The DB file lives in ./data so it persists
// across restarts and is easy to back up.
const DATA_DIR = path.join(process.cwd(), "data");
mkdirSync(DATA_DIR, { recursive: true });

let _db: DatabaseSync | null = null;

function db(): DatabaseSync {
  if (_db) return _db;
  const conn = new DatabaseSync(path.join(DATA_DIR, "coach.db"));
  conn.exec(`
    PRAGMA journal_mode = WAL;

    CREATE TABLE IF NOT EXISTS runs (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      name          TEXT NOT NULL,
      started_at    TEXT NOT NULL,
      distance_m    REAL NOT NULL,
      duration_s    REAL NOT NULL,
      avg_pace_s    REAL NOT NULL,
      avg_hr        REAL,
      max_hr        REAL,
      avg_cadence   REAL,
      avg_power     REAL,
      elev_gain_m   REAL NOT NULL,
      summary_json  TEXT NOT NULL,
      created_at    TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS goal (
      id                INTEGER PRIMARY KEY CHECK (id = 1),
      title             TEXT NOT NULL,
      race_type         TEXT NOT NULL,
      target_distance_m REAL,
      target_time_s     REAL,
      target_date       TEXT,
      notes             TEXT,
      updated_at        TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS messages (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      role       TEXT NOT NULL,
      content    TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
  `);
  _db = conn;
  return conn;
}

function rowToRun(r: Record<string, unknown>): RunRow {
  return {
    id: r.id as number,
    name: r.name as string,
    startedAt: r.started_at as string,
    distanceM: r.distance_m as number,
    durationSec: r.duration_s as number,
    avgPaceSecPerKm: r.avg_pace_s as number,
    avgHr: (r.avg_hr as number) ?? null,
    maxHr: (r.max_hr as number) ?? null,
    avgCadence: (r.avg_cadence as number) ?? null,
    avgPower: (r.avg_power as number) ?? null,
    elevGainM: r.elev_gain_m as number,
    summary: JSON.parse(r.summary_json as string) as RunSummary,
    createdAt: r.created_at as string,
  };
}

export function insertRun(name: string, summary: RunSummary): RunRow {
  const now = new Date().toISOString();
  const stmt = db().prepare(`
    INSERT INTO runs (name, started_at, distance_m, duration_s, avg_pace_s,
      avg_hr, max_hr, avg_cadence, avg_power, elev_gain_m, summary_json, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const info = stmt.run(
    name,
    summary.startedAt,
    summary.distanceM,
    summary.durationSec,
    summary.avgPaceSecPerKm,
    summary.avgHr,
    summary.maxHr,
    summary.avgCadence,
    summary.avgPower,
    summary.elevGainM,
    JSON.stringify(summary),
    now
  );
  return getRun(Number(info.lastInsertRowid))!;
}

export function listRuns(): RunRow[] {
  const rows = db()
    .prepare(`SELECT * FROM runs ORDER BY started_at DESC`)
    .all() as Record<string, unknown>[];
  return rows.map(rowToRun);
}

export function getRun(id: number): RunRow | null {
  const row = db().prepare(`SELECT * FROM runs WHERE id = ?`).get(id) as
    | Record<string, unknown>
    | undefined;
  return row ? rowToRun(row) : null;
}

export function deleteRun(id: number): void {
  db().prepare(`DELETE FROM runs WHERE id = ?`).run(id);
}

export function getGoal(): Goal | null {
  const row = db().prepare(`SELECT * FROM goal WHERE id = 1`).get() as
    | Record<string, unknown>
    | undefined;
  if (!row) return null;
  return {
    id: 1,
    title: row.title as string,
    raceType: row.race_type as string,
    targetDistanceM: (row.target_distance_m as number) ?? null,
    targetTimeSec: (row.target_time_s as number) ?? null,
    targetDate: (row.target_date as string) ?? null,
    notes: (row.notes as string) ?? null,
    updatedAt: row.updated_at as string,
  };
}

export function upsertGoal(g: Omit<Goal, "id" | "updatedAt">): Goal {
  const now = new Date().toISOString();
  db()
    .prepare(
      `INSERT INTO goal (id, title, race_type, target_distance_m, target_time_s, target_date, notes, updated_at)
       VALUES (1, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         title=excluded.title, race_type=excluded.race_type,
         target_distance_m=excluded.target_distance_m, target_time_s=excluded.target_time_s,
         target_date=excluded.target_date, notes=excluded.notes, updated_at=excluded.updated_at`
    )
    .run(g.title, g.raceType, g.targetDistanceM, g.targetTimeSec, g.targetDate, g.notes, now);
  return getGoal()!;
}

export function listMessages(): ChatMessage[] {
  const rows = db()
    .prepare(`SELECT * FROM messages ORDER BY id ASC`)
    .all() as Record<string, unknown>[];
  return rows.map((r) => ({
    id: r.id as number,
    role: r.role as "user" | "assistant",
    content: r.content as string,
    createdAt: r.created_at as string,
  }));
}

export function insertMessage(role: "user" | "assistant", content: string): ChatMessage {
  const now = new Date().toISOString();
  const info = db()
    .prepare(`INSERT INTO messages (role, content, created_at) VALUES (?, ?, ?)`)
    .run(role, content, now);
  return {
    id: Number(info.lastInsertRowid),
    role,
    content,
    createdAt: now,
  };
}

export function clearMessages(): void {
  db().prepare(`DELETE FROM messages`).run();
}
