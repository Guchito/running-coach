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
  GymSession,
  GymSummary,
  GymType,
  LthrTest,
  BodyMetric,
} from "./types";
import { encryptSecret, decryptSecret } from "./secrets";

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
  ALTER TABLE users ADD COLUMN IF NOT EXISTS lactate_threshold_hr INTEGER;
  ALTER TABLE users ADD COLUMN IF NOT EXISTS hr_zones JSONB;
  ALTER TABLE users ADD COLUMN IF NOT EXISTS drive_folder_id TEXT;
  ALTER TABLE users ADD COLUMN IF NOT EXISTS drive_last_sync TIMESTAMPTZ;
  ALTER TABLE users ADD COLUMN IF NOT EXISTS coach_model TEXT;
  ALTER TABLE users ADD COLUMN IF NOT EXISTS lthr_test_interval_weeks INTEGER;
  ALTER TABLE users ADD COLUMN IF NOT EXISTS anthropic_api_key_enc TEXT;
  ALTER TABLE users ADD COLUMN IF NOT EXISTS auto_name_runs BOOLEAN NOT NULL DEFAULT false;
  ALTER TABLE users ADD COLUMN IF NOT EXISTS garmin_token_enc TEXT;
  ALTER TABLE users ADD COLUMN IF NOT EXISTS garmin_last_sync TIMESTAMPTZ;

  CREATE TABLE IF NOT EXISTS lthr_tests (
    id          SERIAL PRIMARY KEY,
    user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    tested_on   DATE NOT NULL,
    lthr        INTEGER NOT NULL,
    max_hr      INTEGER,
    notes       TEXT,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
  );
  CREATE INDEX IF NOT EXISTS lthr_tests_user_idx ON lthr_tests(user_id, tested_on DESC);

  CREATE TABLE IF NOT EXISTS body_metrics (
    id          SERIAL PRIMARY KEY,
    user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    recorded_on DATE NOT NULL,
    resting_hr  INTEGER,
    weight_kg   NUMERIC(5,1),
    notes       TEXT,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
  );
  CREATE INDEX IF NOT EXISTS body_metrics_user_idx ON body_metrics(user_id, recorded_on DESC);

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
  ALTER TABLE goals ADD COLUMN IF NOT EXISTS projected_time_s DOUBLE PRECISION;
  ALTER TABLE goals ADD COLUMN IF NOT EXISTS result_run_id INTEGER;
  ALTER TABLE goals ADD COLUMN IF NOT EXISTS result_time_s DOUBLE PRECISION;
  ALTER TABLE goals ADD COLUMN IF NOT EXISTS raced_on DATE;
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

  CREATE TABLE IF NOT EXISTS gym_sessions (
    id             SERIAL PRIMARY KEY,
    user_id        INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name           TEXT NOT NULL,
    type           TEXT NOT NULL,
    started_at     TIMESTAMPTZ NOT NULL,
    duration_s     DOUBLE PRECISION NOT NULL,
    rpe            INTEGER,
    avg_hr         DOUBLE PRECISION,
    max_hr         DOUBLE PRECISION,
    calories       DOUBLE PRECISION,
    notes          TEXT,
    summary_json   JSONB NOT NULL,
    source_file_id TEXT,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
  );
  CREATE INDEX IF NOT EXISTS gym_user_started_idx ON gym_sessions(user_id, started_at DESC);
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
    lactateThresholdHr:
      r.lactate_threshold_hr === null || r.lactate_threshold_hr === undefined
        ? null
        : Number(r.lactate_threshold_hr),
    hrZones: jsonField<HrZone[]>(r.hr_zones),
    driveFolderId: (r.drive_folder_id as string) ?? null,
    driveLastSync: r.drive_last_sync ? new Date(r.drive_last_sync as string).toISOString() : null,
    coachModel: (r.coach_model as string) ?? null,
    // Never expose the key itself on the User object (it can be serialized to the
    // client); just whether one is stored, so the UI can show "key set".
    hasAnthropicKey: r.anthropic_api_key_enc != null,
    lthrTestIntervalWeeks:
      r.lthr_test_interval_weeks === null || r.lthr_test_interval_weeks === undefined
        ? null
        : Number(r.lthr_test_interval_weeks),
    autoNameRuns: r.auto_name_runs === true,
    garminConnected: r.garmin_token_enc != null,
    garminLastSync: r.garmin_last_sync
      ? new Date(r.garmin_last_sync as string).toISOString()
      : null,
    createdAt: new Date(r.created_at as string).toISOString(),
  };
}

export async function setAutoNameRuns(userId: number, enabled: boolean): Promise<User> {
  const rows = await q(`UPDATE users SET auto_name_runs = $2 WHERE id = $1 RETURNING *`, [
    userId,
    enabled,
  ]);
  return rowToUser(rows[0]);
}

export async function setCoachModel(userId: number, model: string | null): Promise<User> {
  const rows = await q(`UPDATE users SET coach_model = $2 WHERE id = $1 RETURNING *`, [
    userId,
    model,
  ]);
  return rowToUser(rows[0]);
}

// Store (encrypted) or clear the runner's own Anthropic API key. Pass null to
// remove it. The plaintext never touches the database — only the AES-GCM blob.
export async function setAnthropicApiKey(userId: number, plaintext: string | null): Promise<User> {
  const enc = plaintext ? encryptSecret(plaintext) : null;
  const rows = await q(`UPDATE users SET anthropic_api_key_enc = $2 WHERE id = $1 RETURNING *`, [
    userId,
    enc,
  ]);
  return rowToUser(rows[0]);
}

// Fetch and decrypt the runner's own Anthropic API key for server-side use
// (the chat route). Returns null if they haven't set one.
export async function getAnthropicApiKey(userId: number): Promise<string | null> {
  const rows = await q<{ anthropic_api_key_enc: string | null }>(
    `SELECT anthropic_api_key_enc FROM users WHERE id = $1`,
    [userId]
  );
  return decryptSecret(rows[0]?.anthropic_api_key_enc);
}

export async function setLthrTestInterval(userId: number, weeks: number | null): Promise<User> {
  const rows = await q(
    `UPDATE users SET lthr_test_interval_weeks = $2 WHERE id = $1 RETURNING *`,
    [userId, weeks]
  );
  return rowToUser(rows[0]);
}

// ---------- lactate-threshold tests ----------

function rowToLthrTest(r: Record<string, unknown>): LthrTest {
  return {
    id: r.id as number,
    testedOn: new Date(r.tested_on as string).toISOString().slice(0, 10),
    lthr: Number(r.lthr),
    maxHr: r.max_hr === null || r.max_hr === undefined ? null : Number(r.max_hr),
    notes: (r.notes as string) ?? null,
    createdAt: new Date(r.created_at as string).toISOString(),
  };
}

export async function listLthrTests(userId: number): Promise<LthrTest[]> {
  const rows = await q(
    `SELECT * FROM lthr_tests WHERE user_id = $1 ORDER BY tested_on DESC, id DESC`,
    [userId]
  );
  return rows.map(rowToLthrTest);
}

export async function getLatestLthrTest(userId: number): Promise<LthrTest | null> {
  const rows = await q(
    `SELECT * FROM lthr_tests WHERE user_id = $1 ORDER BY tested_on DESC, id DESC LIMIT 1`,
    [userId]
  );
  return rows[0] ? rowToLthrTest(rows[0]) : null;
}

// Log a test result and adopt it as the runner's current LTHR (and max HR, if
// the test recorded one). Zones aren't regenerated automatically.
export async function insertLthrTest(
  userId: number,
  input: { testedOn: string; lthr: number; maxHr: number | null; notes: string | null }
): Promise<LthrTest> {
  const rows = await q(
    `INSERT INTO lthr_tests (user_id, tested_on, lthr, max_hr, notes)
     VALUES ($1, $2, $3, $4, $5) RETURNING *`,
    [userId, input.testedOn, input.lthr, input.maxHr, input.notes]
  );
  await q(
    `UPDATE users
       SET lactate_threshold_hr = $2,
           max_hr = COALESCE($3, max_hr)
     WHERE id = $1`,
    [userId, input.lthr, input.maxHr]
  );
  return rowToLthrTest(rows[0]);
}

export async function deleteLthrTest(userId: number, id: number): Promise<boolean> {
  const rows = await q(
    `DELETE FROM lthr_tests WHERE id = $1 AND user_id = $2 RETURNING id`,
    [id, userId]
  );
  return rows.length > 0;
}

// ---------- body metrics (resting HR / weight) ----------

function rowToBodyMetric(r: Record<string, unknown>): BodyMetric {
  return {
    id: r.id as number,
    recordedOn: new Date(r.recorded_on as string).toISOString().slice(0, 10),
    restingHr: r.resting_hr === null || r.resting_hr === undefined ? null : Number(r.resting_hr),
    weightKg: r.weight_kg === null || r.weight_kg === undefined ? null : Number(r.weight_kg),
    notes: (r.notes as string) ?? null,
    createdAt: new Date(r.created_at as string).toISOString(),
  };
}

export async function listBodyMetrics(userId: number, limit = 60): Promise<BodyMetric[]> {
  const rows = await q(
    `SELECT * FROM body_metrics WHERE user_id = $1 ORDER BY recorded_on DESC, id DESC LIMIT $2`,
    [userId, limit]
  );
  return rows.map(rowToBodyMetric);
}

export async function getLatestBodyMetric(userId: number): Promise<BodyMetric | null> {
  const rows = await q(
    `SELECT * FROM body_metrics WHERE user_id = $1 ORDER BY recorded_on DESC, id DESC LIMIT 1`,
    [userId]
  );
  return rows[0] ? rowToBodyMetric(rows[0]) : null;
}

export async function insertBodyMetric(
  userId: number,
  input: { recordedOn: string; restingHr: number | null; weightKg: number | null; notes: string | null }
): Promise<BodyMetric> {
  const rows = await q(
    `INSERT INTO body_metrics (user_id, recorded_on, resting_hr, weight_kg, notes)
     VALUES ($1, $2, $3, $4, $5) RETURNING *`,
    [userId, input.recordedOn, input.restingHr, input.weightKg, input.notes]
  );
  return rowToBodyMetric(rows[0]);
}

export async function deleteBodyMetric(userId: number, id: number): Promise<boolean> {
  const rows = await q(
    `DELETE FROM body_metrics WHERE id = $1 AND user_id = $2 RETURNING id`,
    [id, userId]
  );
  return rows.length > 0;
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

// ---------- Garmin Connect ----------

// Store (encrypted) or clear the Garmin session token JSON. Only the AES-GCM
// blob is persisted — never the runner's Garmin password.
export async function setGarminToken(userId: number, tokenJson: string | null): Promise<User> {
  const enc = tokenJson ? encryptSecret(tokenJson) : null;
  const rows = await q(`UPDATE users SET garmin_token_enc = $2 WHERE id = $1 RETURNING *`, [
    userId,
    enc,
  ]);
  return rowToUser(rows[0]);
}

// Decrypt the stored Garmin session token JSON (or null if not connected).
export async function getGarminToken(userId: number): Promise<string | null> {
  const rows = await q<{ garmin_token_enc: string | null }>(
    `SELECT garmin_token_enc FROM users WHERE id = $1`,
    [userId]
  );
  return decryptSecret(rows[0]?.garmin_token_enc);
}

export async function touchGarminSync(userId: number): Promise<void> {
  await q(`UPDATE users SET garmin_last_sync = now() WHERE id = $1`, [userId]);
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
  lactateThresholdHr: number | null,
  hrZones: HrZone[] | null
): Promise<User> {
  const rows = await q(
    `UPDATE users SET max_hr = $2, lactate_threshold_hr = $3, hr_zones = $4 WHERE id = $1 RETURNING *`,
    [userId, maxHr, lactateThresholdHr, hrZones ? JSON.stringify(hrZones) : null]
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

export async function renameRun(
  userId: number,
  id: number,
  name: string
): Promise<RunRow | null> {
  const rows = await q(
    `UPDATE runs SET name = $3 WHERE id = $2 AND user_id = $1 RETURNING *`,
    [userId, id, name]
  );
  return rows[0] ? rowToRun(rows[0]) : null;
}

// ---------- gym / strength sessions ----------

function rowToGymSession(r: Record<string, unknown>): GymSession {
  return {
    id: r.id as number,
    name: r.name as string,
    type: r.type as GymType,
    startedAt: new Date(r.started_at as string).toISOString(),
    durationSec: Number(r.duration_s),
    rpe: r.rpe === null || r.rpe === undefined ? null : Number(r.rpe),
    avgHr: r.avg_hr === null || r.avg_hr === undefined ? null : Number(r.avg_hr),
    maxHr: r.max_hr === null || r.max_hr === undefined ? null : Number(r.max_hr),
    calories: r.calories === null || r.calories === undefined ? null : Number(r.calories),
    notes: (r.notes as string) ?? null,
    summary: jsonField<GymSummary>(r.summary_json) as GymSummary,
    createdAt: new Date(r.created_at as string).toISOString(),
  };
}

export async function insertGymSession(
  userId: number,
  fields: { name: string; type: GymType; rpe: number | null; notes: string | null },
  summary: GymSummary,
  sourceFileId: string | null = null
): Promise<GymSession> {
  const rows = await q(
    `INSERT INTO gym_sessions (user_id, name, type, started_at, duration_s, rpe,
       avg_hr, max_hr, calories, notes, summary_json, source_file_id)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING *`,
    [
      userId,
      fields.name,
      fields.type,
      summary.startedAt,
      summary.durationSec,
      fields.rpe,
      summary.avgHr,
      summary.maxHr,
      summary.calories,
      fields.notes,
      JSON.stringify(summary),
      sourceFileId,
    ]
  );
  return rowToGymSession(rows[0]);
}

export async function listGymSessions(userId: number): Promise<GymSession[]> {
  const rows = await q(
    `SELECT * FROM gym_sessions WHERE user_id = $1 ORDER BY started_at DESC`,
    [userId]
  );
  return rows.map(rowToGymSession);
}

export async function getGymSession(userId: number, id: number): Promise<GymSession | null> {
  const rows = await q(`SELECT * FROM gym_sessions WHERE id = $1 AND user_id = $2`, [id, userId]);
  return rows[0] ? rowToGymSession(rows[0]) : null;
}

export async function deleteGymSession(userId: number, id: number): Promise<void> {
  await q(`DELETE FROM gym_sessions WHERE id = $1 AND user_id = $2`, [id, userId]);
}

// Drive file ids already imported as gym sessions (to skip on re-sync).
export async function getImportedGymFileIds(userId: number): Promise<Set<string>> {
  const rows = await q<{ source_file_id: string }>(
    `SELECT source_file_id FROM gym_sessions WHERE user_id = $1 AND source_file_id IS NOT NULL`,
    [userId]
  );
  return new Set(rows.map((r) => r.source_file_id));
}

// Start times (to the second) of existing gym sessions, for start-time dedupe.
export async function getGymStartKeys(userId: number): Promise<Set<string>> {
  const rows = await q<{ started_at: string }>(
    `SELECT started_at FROM gym_sessions WHERE user_id = $1`,
    [userId]
  );
  return new Set(rows.map((r) => new Date(r.started_at).toISOString().slice(0, 19)));
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
    projectedTimeSec:
      r.projected_time_s === null || r.projected_time_s === undefined
        ? null
        : Number(r.projected_time_s),
    notes: (r.notes as string) ?? null,
    status: (r.status as GoalStatus) ?? "active",
    resultRunId:
      r.result_run_id === null || r.result_run_id === undefined ? null : Number(r.result_run_id),
    resultTimeSec:
      r.result_time_s === null || r.result_time_s === undefined ? null : Number(r.result_time_s),
    racedOn: r.raced_on ? new Date(r.raced_on as string).toISOString().slice(0, 10) : null,
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

// The coach's realistic race-day projection — set independently of the goal's
// target so updating other goal fields never wipes it.
export async function setGoalProjection(
  userId: number,
  id: number,
  projectedTimeSec: number | null
): Promise<Goal | null> {
  const rows = await q(
    `UPDATE goals SET projected_time_s = $3, updated_at = now()
     WHERE id = $2 AND user_id = $1 RETURNING *`,
    [userId, id, projectedTimeSec]
  );
  return rows[0] ? rowToGoal(rows[0]) : null;
}

// Record which uploaded run was this goal's race. Copies the run's finish time
// and date onto the goal (denormalized, so it survives run deletion) and marks
// the goal achieved. Returns null if the goal or run isn't the runner's.
export async function setGoalResult(
  userId: number,
  goalId: number,
  runId: number
): Promise<Goal | null> {
  const run = await getRun(userId, runId);
  if (!run) return null;
  const racedOn = run.startedAt.slice(0, 10);
  const rows = await q(
    `UPDATE goals
       SET result_run_id = $3, result_time_s = $4, raced_on = $5,
           status = 'achieved', updated_at = now()
     WHERE id = $2 AND user_id = $1 RETURNING *`,
    [userId, goalId, runId, run.durationSec, racedOn]
  );
  return rows[0] ? rowToGoal(rows[0]) : null;
}

// Undo a recorded race result and reactivate the goal.
export async function clearGoalResult(userId: number, goalId: number): Promise<Goal | null> {
  const rows = await q(
    `UPDATE goals
       SET result_run_id = NULL, result_time_s = NULL, raced_on = NULL,
           status = 'active', updated_at = now()
     WHERE id = $2 AND user_id = $1 RETURNING *`,
    [userId, goalId]
  );
  return rows[0] ? rowToGoal(rows[0]) : null;
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

// Update only the user's free-text plan instructions, preserving everything else.
// If no macro plan exists yet, create a minimal stub so the instructions still persist.
export async function setMacroInstructions(
  userId: number,
  instructions: string | null
): Promise<MacroPlan> {
  const { macro } = await getPlan(userId);
  const next: MacroPlan = macro
    ? { ...macro, instructions }
    : { summary: "", phases: [], instructions, updatedAt: new Date().toISOString() };
  await upsertPlanField(userId, "macro_json", next);
  return next;
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
