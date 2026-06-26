import { Pool } from "pg";
import type {
  RunRow,
  RunSummary,
  Goal,
  GoalStatus,
  ChatMessage,
  User,
  HrZone,
  MacroPlan,
  WeeklyPlan,
  Plan,
} from "./types";

// Single shared pool. On serverless platforms (Vercel) this is created per
// instance; point DATABASE_URL at a pooled connection string (e.g. Neon's
// -pooler host) for best results.
declare global {
  // eslint-disable-next-line no-var
  var _pgPool: Pool | undefined;
  // eslint-disable-next-line no-var
  var _schemaReady: Promise<void> | undefined;
}

function pool(): Pool {
  if (!global._pgPool) {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) {
      throw new Error(
        "DATABASE_URL is not set. Add a Postgres connection string to .env.local."
      );
    }
    global._pgPool = new Pool({
      connectionString,
      // Most hosted Postgres (Neon/Supabase/Railway) require TLS. Allow opting
      // out for a plain local server via DATABASE_SSL=disable.
      ssl:
        process.env.DATABASE_SSL === "disable"
          ? undefined
          : /localhost|127\.0\.0\.1/.test(connectionString)
          ? undefined
          : { rejectUnauthorized: false },
      max: 10,
    });
  }
  return global._pgPool;
}

const SCHEMA = `
  CREATE TABLE IF NOT EXISTS users (
    id            SERIAL PRIMARY KEY,
    email         TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    name          TEXT,
    max_hr        INTEGER,
    hr_zones      JSONB,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
  );
  ALTER TABLE users ADD COLUMN IF NOT EXISTS max_hr INTEGER;
  ALTER TABLE users ADD COLUMN IF NOT EXISTS hr_zones JSONB;
  ALTER TABLE users ADD COLUMN IF NOT EXISTS drive_folder_id TEXT;
  ALTER TABLE users ADD COLUMN IF NOT EXISTS drive_last_sync TIMESTAMPTZ;

  CREATE TABLE IF NOT EXISTS runs (
    id            SERIAL PRIMARY KEY,
    user_id       INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name          TEXT NOT NULL,
    started_at    TIMESTAMPTZ NOT NULL,
    distance_m    DOUBLE PRECISION NOT NULL,
    duration_s    DOUBLE PRECISION NOT NULL,
    avg_pace_s    DOUBLE PRECISION NOT NULL,
    avg_hr        DOUBLE PRECISION,
    max_hr        DOUBLE PRECISION,
    avg_cadence   DOUBLE PRECISION,
    avg_power     DOUBLE PRECISION,
    elev_gain_m   DOUBLE PRECISION NOT NULL,
    summary_json  JSONB NOT NULL,
    source_file_id TEXT,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
  );
  ALTER TABLE runs ADD COLUMN IF NOT EXISTS source_file_id TEXT;
  CREATE INDEX IF NOT EXISTS runs_user_started_idx ON runs(user_id, started_at DESC);
  CREATE UNIQUE INDEX IF NOT EXISTS runs_user_source_idx
    ON runs(user_id, source_file_id) WHERE source_file_id IS NOT NULL;

  CREATE TABLE IF NOT EXISTS goals (
    id                SERIAL PRIMARY KEY,
    user_id           INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    title             TEXT NOT NULL,
    race_type         TEXT NOT NULL,
    target_distance_m DOUBLE PRECISION,
    target_time_s     DOUBLE PRECISION,
    target_date       TEXT,
    notes             TEXT,
    status            TEXT NOT NULL DEFAULT 'active',
    created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
  );
  CREATE INDEX IF NOT EXISTS goals_user_idx ON goals(user_id);

  CREATE TABLE IF NOT EXISTS plans (
    user_id     INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    macro_json  JSONB,
    weekly_json JSONB,
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
  );

  CREATE TABLE IF NOT EXISTS messages (
    id         SERIAL PRIMARY KEY,
    user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role       TEXT NOT NULL,
    content    TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
  );
  CREATE INDEX IF NOT EXISTS messages_user_idx ON messages(user_id, id);
`;

// Run schema creation once per process.
export function ensureSchema(): Promise<void> {
  if (!global._schemaReady) {
    global._schemaReady = pool()
      .query(SCHEMA)
      .then(() => undefined);
  }
  return global._schemaReady;
}

async function q<T = Record<string, unknown>>(
  text: string,
  params: unknown[] = []
): Promise<T[]> {
  await ensureSchema();
  const res = await pool().query(text, params);
  return res.rows as T[];
}

// ---------- users ----------

function jsonField<T>(v: unknown): T | null {
  if (v === null || v === undefined) return null;
  return (typeof v === "string" ? JSON.parse(v) : v) as T;
}

function rowToUser(r: Record<string, unknown>): User {
  return {
    id: r.id as number,
    email: r.email as string,
    name: (r.name as string) ?? null,
    maxHr: r.max_hr === null || r.max_hr === undefined ? null : Number(r.max_hr),
    hrZones: jsonField<HrZone[]>(r.hr_zones),
    driveFolderId: (r.drive_folder_id as string) ?? null,
    driveLastSync: r.drive_last_sync ? new Date(r.drive_last_sync as string).toISOString() : null,
    createdAt: new Date(r.created_at as string).toISOString(),
  };
}

export async function setDriveFolder(userId: number, folderId: string | null): Promise<User> {
  const rows = await q(`UPDATE users SET drive_folder_id = $2 WHERE id = $1 RETURNING *`, [
    userId,
    folderId,
  ]);
  return rowToUser(rows[0]);
}

export async function touchDriveSync(userId: number): Promise<void> {
  await q(`UPDATE users SET drive_last_sync = now() WHERE id = $1`, [userId]);
}

export async function getImportedFileIds(userId: number): Promise<Set<string>> {
  const rows = await q<{ source_file_id: string }>(
    `SELECT source_file_id FROM runs WHERE user_id = $1 AND source_file_id IS NOT NULL`,
    [userId]
  );
  return new Set(rows.map((r) => r.source_file_id));
}

// Start times (to the second) of existing runs, used to avoid importing a run
// that was already added by another source.
export async function getRunStartKeys(userId: number): Promise<Set<string>> {
  const rows = await q<{ started_at: string }>(
    `SELECT started_at FROM runs WHERE user_id = $1`,
    [userId]
  );
  return new Set(rows.map((r) => new Date(r.started_at).toISOString().slice(0, 19)));
}

export async function updateUserHr(
  userId: number,
  maxHr: number | null,
  hrZones: HrZone[] | null
): Promise<User> {
  const rows = await q(
    `UPDATE users SET max_hr = $2, hr_zones = $3 WHERE id = $1 RETURNING *`,
    [userId, maxHr, hrZones ? JSON.stringify(hrZones) : null]
  );
  return rowToUser(rows[0]);
}

export async function createUser(
  email: string,
  passwordHash: string,
  name: string | null
): Promise<User> {
  const rows = await q(
    `INSERT INTO users (email, password_hash, name) VALUES ($1, $2, $3) RETURNING *`,
    [email.toLowerCase(), passwordHash, name]
  );
  return rowToUser(rows[0]);
}

export async function getUserByEmail(
  email: string
): Promise<(User & { passwordHash: string }) | null> {
  const rows = await q(`SELECT * FROM users WHERE email = $1`, [email.toLowerCase()]);
  if (!rows[0]) return null;
  return { ...rowToUser(rows[0]), passwordHash: rows[0].password_hash as string };
}

export async function getUserById(id: number): Promise<User | null> {
  const rows = await q(`SELECT * FROM users WHERE id = $1`, [id]);
  return rows[0] ? rowToUser(rows[0]) : null;
}

export async function countUsers(): Promise<number> {
  const rows = await q<{ count: string }>(`SELECT COUNT(*)::int AS count FROM users`);
  return Number(rows[0].count);
}

// ---------- runs ----------

function rowToRun(r: Record<string, unknown>): RunRow {
  const summary = (typeof r.summary_json === "string"
    ? JSON.parse(r.summary_json as string)
    : r.summary_json) as RunSummary;
  return {
    id: r.id as number,
    name: r.name as string,
    startedAt: new Date(r.started_at as string).toISOString(),
    distanceM: Number(r.distance_m),
    durationSec: Number(r.duration_s),
    avgPaceSecPerKm: Number(r.avg_pace_s),
    avgHr: r.avg_hr === null ? null : Number(r.avg_hr),
    maxHr: r.max_hr === null ? null : Number(r.max_hr),
    avgCadence: r.avg_cadence === null ? null : Number(r.avg_cadence),
    avgPower: r.avg_power === null ? null : Number(r.avg_power),
    elevGainM: Number(r.elev_gain_m),
    summary,
    createdAt: new Date(r.created_at as string).toISOString(),
  };
}

export async function insertRun(
  userId: number,
  name: string,
  summary: RunSummary,
  sourceFileId: string | null = null
): Promise<RunRow> {
  const rows = await q(
    `INSERT INTO runs (user_id, name, started_at, distance_m, duration_s, avg_pace_s,
       avg_hr, max_hr, avg_cadence, avg_power, elev_gain_m, summary_json, source_file_id)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING *`,
    [
      userId,
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
      sourceFileId,
    ]
  );
  return rowToRun(rows[0]);
}

export async function listRuns(userId: number): Promise<RunRow[]> {
  const rows = await q(
    `SELECT * FROM runs WHERE user_id = $1 ORDER BY started_at DESC`,
    [userId]
  );
  return rows.map(rowToRun);
}

export async function getRun(userId: number, id: number): Promise<RunRow | null> {
  const rows = await q(`SELECT * FROM runs WHERE id = $1 AND user_id = $2`, [id, userId]);
  return rows[0] ? rowToRun(rows[0]) : null;
}

export async function deleteRun(userId: number, id: number): Promise<void> {
  await q(`DELETE FROM runs WHERE id = $1 AND user_id = $2`, [id, userId]);
}

// ---------- goals (multiple per user) ----------

function rowToGoal(r: Record<string, unknown>): Goal {
  return {
    id: r.id as number,
    title: r.title as string,
    raceType: r.race_type as string,
    targetDistanceM: r.target_distance_m === null ? null : Number(r.target_distance_m),
    targetTimeSec: r.target_time_s === null ? null : Number(r.target_time_s),
    targetDate: (r.target_date as string) ?? null,
    notes: (r.notes as string) ?? null,
    status: (r.status as GoalStatus) ?? "active",
    createdAt: new Date(r.created_at as string).toISOString(),
    updatedAt: new Date(r.updated_at as string).toISOString(),
  };
}

export type GoalInput = {
  title: string;
  raceType: string;
  targetDistanceM: number | null;
  targetTimeSec: number | null;
  targetDate: string | null;
  notes: string | null;
  status?: GoalStatus;
};

// Active goals first, then by soonest target date.
export async function listGoals(userId: number): Promise<Goal[]> {
  const rows = await q(
    `SELECT * FROM goals WHERE user_id = $1
     ORDER BY (status = 'active') DESC,
              target_date ASC NULLS LAST,
              created_at ASC`,
    [userId]
  );
  return rows.map(rowToGoal);
}

export async function getGoalById(userId: number, id: number): Promise<Goal | null> {
  const rows = await q(`SELECT * FROM goals WHERE id = $1 AND user_id = $2`, [id, userId]);
  return rows[0] ? rowToGoal(rows[0]) : null;
}

export async function createGoal(userId: number, g: GoalInput): Promise<Goal> {
  const rows = await q(
    `INSERT INTO goals (user_id, title, race_type, target_distance_m, target_time_s, target_date, notes, status)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
    [
      userId,
      g.title,
      g.raceType,
      g.targetDistanceM,
      g.targetTimeSec,
      g.targetDate,
      g.notes,
      g.status ?? "active",
    ]
  );
  return rowToGoal(rows[0]);
}

export async function updateGoal(
  userId: number,
  id: number,
  g: Partial<GoalInput>
): Promise<Goal | null> {
  const rows = await q(
    `UPDATE goals SET
       title = COALESCE($3, title),
       race_type = COALESCE($4, race_type),
       target_distance_m = $5,
       target_time_s = $6,
       target_date = $7,
       notes = $8,
       status = COALESCE($9, status),
       updated_at = now()
     WHERE id = $2 AND user_id = $1 RETURNING *`,
    [
      userId,
      id,
      g.title ?? null,
      g.raceType ?? null,
      g.targetDistanceM ?? null,
      g.targetTimeSec ?? null,
      g.targetDate ?? null,
      g.notes ?? null,
      g.status ?? null,
    ]
  );
  return rows[0] ? rowToGoal(rows[0]) : null;
}

export async function deleteGoal(userId: number, id: number): Promise<void> {
  await q(`DELETE FROM goals WHERE id = $1 AND user_id = $2`, [id, userId]);
}

// ---------- plans ----------

export async function getPlan(userId: number): Promise<Plan> {
  const rows = await q(`SELECT * FROM plans WHERE user_id = $1`, [userId]);
  if (!rows[0]) return { macro: null, weekly: null };
  return {
    macro: jsonField<MacroPlan>(rows[0].macro_json),
    weekly: jsonField<WeeklyPlan>(rows[0].weekly_json),
  };
}

async function upsertPlanField(
  userId: number,
  field: "macro_json" | "weekly_json",
  value: unknown
): Promise<void> {
  await q(
    `INSERT INTO plans (user_id, ${field}, updated_at) VALUES ($1, $2, now())
     ON CONFLICT (user_id) DO UPDATE SET ${field} = EXCLUDED.${field}, updated_at = now()`,
    [userId, JSON.stringify(value)]
  );
}

export async function setMacroPlan(userId: number, macro: MacroPlan): Promise<void> {
  await upsertPlanField(userId, "macro_json", macro);
}

export async function setWeeklyPlan(userId: number, weekly: WeeklyPlan): Promise<void> {
  await upsertPlanField(userId, "weekly_json", weekly);
}

// ---------- messages ----------

export async function listMessages(userId: number): Promise<ChatMessage[]> {
  const rows = await q(`SELECT * FROM messages WHERE user_id = $1 ORDER BY id ASC`, [userId]);
  return rows.map((r) => ({
    id: r.id as number,
    role: r.role as "user" | "assistant",
    content: r.content as string,
    createdAt: new Date(r.created_at as string).toISOString(),
  }));
}

export async function insertMessage(
  userId: number,
  role: "user" | "assistant",
  content: string
): Promise<ChatMessage> {
  const rows = await q(
    `INSERT INTO messages (user_id, role, content) VALUES ($1,$2,$3) RETURNING *`,
    [userId, role, content]
  );
  const r = rows[0];
  return {
    id: r.id as number,
    role,
    content,
    createdAt: new Date(r.created_at as string).toISOString(),
  };
}

export async function clearMessages(userId: number): Promise<void> {
  await q(`DELETE FROM messages WHERE user_id = $1`, [userId]);
}
