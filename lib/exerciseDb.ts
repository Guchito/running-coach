import { exerciseKey } from "./gymProgress";
import {
  getExerciseMedia,
  getExerciseMediaMany,
  upsertExerciseMedia,
  countExerciseIndex,
  bulkUpsertExerciseIndex,
  searchExerciseIndex,
  browseExerciseIndexByBodyPart,
  getExerciseIndexById,
  getAppState,
  setAppState,
  listPendingVideoChecks,
  countPendingVideoChecks,
  type ExerciseIndexRow,
} from "./db";
import type { ExerciseMedia, ExerciseCandidate } from "./types";

// Server-only client for AscendAPI / ExerciseDB.
//
// The matching problem: the classic ExerciseDB (~1,500 real gym movements —
// "lever lying leg curl", equipment-prefixed names, GIFs) lives on the free
// host oss.exercisedb.dev, whose *search* ranks well but which 503s in bursts.
// The RapidAPI hosts are reliable but their search is poor and v2's dataset is
// padded with bodyweight/towel junk. So neither host is both reliable and good
// on its own.
//
// The fix: sync that 1,500-exercise catalog into our own table ONCE, then run
// all matching / search / browse locally against it — reliable and instant. The
// flaky host is only touched during the one-time sync. v2 is used purely to
// enrich a confident match with an HD video when it cleanly has one.

const V2_HOST = "edb-with-videos-and-images-by-ascendapi.p.rapidapi.com";
const VIZ_HOST = "muscle-visualizer-api.p.rapidapi.com";
const V1_BASE = "https://oss.exercisedb.dev/api/v1";

function rapidKey(): string | null {
  return process.env.RAPIDAPI_KEY || null;
}

export function hasRapidApiKey(): boolean {
  return rapidKey() != null;
}

async function rapidGet(host: string, path: string): Promise<unknown> {
  const key = rapidKey();
  if (!key) throw new Error("RAPIDAPI_KEY not set");
  const res = await fetch(`https://${host}${path}`, {
    headers: { "X-RapidAPI-Key": key, "X-RapidAPI-Host": host },
    next: { revalidate: 60 * 60 * 24 },
  });
  if (!res.ok) throw new Error(`${host} ${path} → ${res.status}`);
  return res.json();
}

// oss returns 503s in bursts; retry with backoff. Only ever called during the
// one-time index sync, so a little latency is fine.
async function v1Get(path: string, retries = 4): Promise<unknown> {
  for (let attempt = 0; ; attempt++) {
    try {
      const res = await fetch(`${V1_BASE}${path}`, { next: { revalidate: 60 * 60 * 24 } });
      if (!res.ok) throw new Error(`v1 ${path} → ${res.status}`);
      const text = await res.text();
      if (!text) throw new Error(`v1 ${path} → empty body`);
      return JSON.parse(text);
    } catch (e) {
      if (attempt >= retries) throw e;
      await new Promise((r) => setTimeout(r, 400 * 2 ** attempt));
    }
  }
}

// ---- index sync ----

type OssExercise = {
  exerciseId: string;
  name: string;
  gifUrl?: string;
  targetMuscles?: string[];
  secondaryMuscles?: string[];
  bodyParts?: string[];
  equipments?: string[];
  instructions?: string[];
};

const SYNC_KEY = "catalog_sync";
const CATALOG_TOTAL = 1500; // oss reports meta.total = 1500

type SyncState = { cursor: string | null; complete: boolean };

export type CatalogStatus = {
  indexed: number;
  total: number;
  complete: boolean;
  pendingVideos: number; // matches still awaiting a v2 video check
};

function mapOss(e: OssExercise): ExerciseIndexRow {
  return {
    exerciseId: e.exerciseId,
    name: e.name,
    nameKey: exerciseKey(e.name),
    gifUrl: e.gifUrl ?? null,
    targetMuscles: e.targetMuscles ?? [],
    secondaryMuscles: e.secondaryMuscles ?? [],
    bodyParts: e.bodyParts ?? [],
    equipments: e.equipments ?? [],
    instructions: e.instructions ?? [],
  };
}

// One bounded, paced pass over oss. Upserts each page immediately and persists
// the resume cursor, so an outage mid-sync just stops with progress saved — the
// next pass picks up where this one left off. Never re-fetches from the start
// once any progress exists.
async function syncPass(maxPages = 60): Promise<void> {
  const state = (await getAppState<SyncState>(SYNC_KEY)) ?? { cursor: null, complete: false };
  if (state.complete) return;
  let after = state.cursor;

  for (let i = 0; i < maxPages; i++) {
    let body: { data?: OssExercise[]; meta?: { hasNextPage?: boolean; nextCursor?: string | null } };
    try {
      body = (await v1Get(
        `/exercises?limit=100${after ? `&after=${encodeURIComponent(after)}` : ""}`
      )) as typeof body;
    } catch {
      return; // outage — progress already persisted, resume next pass
    }
    const data = body.data ?? [];
    if (data.length) await bulkUpsertExerciseIndex(data.map(mapOss));

    const next = body.meta?.nextCursor ?? null;
    const hasNext = !!body.meta?.hasNextPage && !!next;
    await setAppState<SyncState>(SYNC_KEY, { cursor: next, complete: !hasNext });
    if (!hasNext) return;
    after = next;
    await new Promise((r) => setTimeout(r, 500)); // pace, to not trip the 503s
  }
}

let syncInFlight: Promise<void> | null = null;
let seedInFlight: Promise<void> | null = null;

// Fire-and-forget: keep running passes in the background until the catalog is
// complete or a pass stops making progress. Deduped so only one runs at a time.
// Callers never await this — user requests must not block on the flaky source.
function kickSync(): void {
  if (syncInFlight) return;
  syncInFlight = (async () => {
    try {
      let prev = -1;
      for (;;) {
        await syncPass();
        const state = await getAppState<SyncState>(SYNC_KEY);
        if (state?.complete) break;
        const count = await countExerciseIndex();
        if (count === prev) break; // a full pass added nothing — stop hammering
        prev = count;
      }
    } catch {
      // swallow — best effort
    } finally {
      syncInFlight = null;
    }
  })();
}

// Make sure there's a catalog to match against. On a cold (empty) index, seed a
// few pages synchronously so the first view isn't blank; otherwise just keep
// filling in the background. Never blocks once anything is indexed.
async function ensureIndex(): Promise<void> {
  const state = await getAppState<SyncState>(SYNC_KEY);
  if (state?.complete) return;
  if ((await countExerciseIndex()) === 0) {
    // cold start — seed synchronously (deduped so parallel first requests don't
    // both fetch), best effort.
    if (!seedInFlight) seedInFlight = syncPass(6).finally(() => (seedInFlight = null));
    await seedInFlight;
  }
  kickSync();
  kickVideoEnrich(); // opportunistically backfill any videos still pending
}

export async function catalogStatus(): Promise<CatalogStatus> {
  const [indexed, state, pendingVideos] = await Promise.all([
    countExerciseIndex(),
    getAppState<SyncState>(SYNC_KEY),
    countPendingVideoChecks(),
  ]);
  return { indexed, total: CATALOG_TOTAL, complete: !!state?.complete, pendingVideos };
}

// The manual "load more" control: push through as many pages as the source
// allows right now (several passes, stopping when a pass adds nothing), so one
// click makes real progress instead of a single flaky page.
export async function syncCatalog(): Promise<CatalogStatus> {
  let prev = -1;
  for (let i = 0; i < 5; i++) {
    await syncPass();
    const status = await catalogStatus();
    if (status.complete || status.indexed === prev) return status;
    prev = status.indexed;
  }
  return catalogStatus();
}

// ---- name matching ----

const STOP = new Set([
  "the", "a", "an", "with", "and", "or", "to", "of", "on", "in", "for", "your",
]);

// Equipment words a lifting app writes in parentheses, mapped to the vocabulary
// ExerciseDB uses in names — "(Machine)" is "lever", etc.
const EQUIP_SYNONYMS: Record<string, string[]> = {
  machine: ["lever", "leverage"],
  "smith machine": ["smith"],
  smith: ["smith"],
  cable: ["cable"],
  barbell: ["barbell"],
  dumbbell: ["dumbbell"],
  "ez bar": ["ez"],
  "ez barbell": ["ez"],
  kettlebell: ["kettlebell"],
  band: ["band", "resistance"],
  "resistance band": ["band", "resistance"],
  sled: ["sled"],
  weighted: ["weighted"],
  bodyweight: [],
  "body weight": [],
};

function tokenize(s: string): string[] {
  return s
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length > 0 && !STOP.has(w));
}

function stripParens(name: string): string {
  return name.replace(/\([^)]*\)/g, " ").replace(/\s+/g, " ").trim();
}

function equipHints(name: string): string[] {
  const hints = new Set<string>();
  for (const m of name.matchAll(/\(([^)]*)\)/g)) {
    for (const syn of EQUIP_SYNONYMS[m[1].toLowerCase().trim()] ?? []) hints.add(syn);
  }
  return [...hints];
}

// How well a candidate name matches what the athlete logged: fraction of the
// movement's words present (prefix-tolerant, so curl≈curls), the last word (the
// movement itself) double-weighted, plus small bonuses for the right equipment
// and a full-phrase hit — minus a precision penalty for junk padding words.
function score(userName: string, candidateName: string): number {
  const core = tokenize(stripParens(userName));
  if (core.length === 0) return 0;
  const cand = tokenize(candidateName);
  const hit = (w: string) =>
    cand.some((c) => c === w || (c.length >= 3 && w.length >= 3 && (c.startsWith(w) || w.startsWith(c))));

  let matched = 0;
  let total = 0;
  core.forEach((w, i) => {
    const weight = i === core.length - 1 ? 2 : 1;
    total += weight;
    if (hit(w)) matched += weight;
  });
  const base = matched / total;

  const hints = equipHints(userName);
  const eqBonus = hints.length && hints.some((h) => cand.includes(h)) ? 0.15 : 0;

  const phrase = stripParens(userName).toLowerCase();
  const subBonus = phrase && candidateName.toLowerCase().includes(phrase) ? 0.1 : 0;

  const expected = new Set([...core, ...hints]);
  const extra = cand.filter(
    (c) => !expected.has(c) && !core.some((w) => hit(w) && (c.startsWith(w) || w.startsWith(c)))
  );
  const noise = Math.min(0.4, extra.length * 0.08);

  return Math.max(0, Math.min(1, base + eqBonus + subBonus) - noise);
}

const ACCEPT = 0.6;

// Best index row for a name, above the acceptance bar.
function bestRow(name: string, rows: ExerciseIndexRow[]): ExerciseIndexRow | null {
  let best: ExerciseIndexRow | null = null;
  let bestScore = ACCEPT;
  for (const r of rows) {
    const s = score(name, r.name);
    if (s >= bestScore) {
      bestScore = s;
      best = r;
    }
  }
  return best;
}

// ---- building the cached record ----

function mediaFromRow(key: string, row: ExerciseIndexRow, verified: boolean): ExerciseMedia {
  const up = (arr: string[]) => arr.map((m) => m.toUpperCase());
  return {
    key,
    exerciseId: row.exerciseId,
    source: "v1",
    matchedName: row.name,
    videoUrl: null,
    gifUrl: row.gifUrl,
    imageUrl: null,
    // v1 muscles are lowercase; upper-case to match the visualizer's vocabulary.
    targetMuscles: up(row.targetMuscles),
    secondaryMuscles: up(row.secondaryMuscles),
    bodyParts: row.bodyParts,
    equipments: row.equipments,
    instructions: row.instructions,
    overview: null,
    verified,
    videoChecked: false,
    resolvedAt: new Date().toISOString(),
  };
}

// Equipment words that lead ExerciseDB names ("barbell bench press", "lever
// lying leg curl"). Stripped before scoring against v2 so a clean v2 name
// ("Bench Press") still matches — v2 names carry no equipment prefix.
const EQUIP_WORDS = new Set([
  "barbell", "dumbbell", "cable", "lever", "leverage", "smith", "band",
  "resistance", "kettlebell", "machine", "weighted", "ez", "sled", "bodyweight",
  "body", "weight",
]);

function movementPhrase(name: string): string {
  return tokenize(stripParens(name))
    .filter((t) => !EQUIP_WORDS.has(t))
    .join(" ");
}

// Best-effort: if v2 cleanly has this movement, attach its HD video. Returns
// `checked` = whether v2 actually answered — true (found a video, or confirmed
// it has none) means done; false means v2 was unreachable (rate limit / network)
// so a later pass should retry. Never throws.
async function enrichWithVideo(
  media: ExerciseMedia,
  refName: string
): Promise<{ media: ExerciseMedia; checked: boolean }> {
  if (!hasRapidApiKey()) return { media, checked: true };
  const phrase = movementPhrase(refName);
  if (!phrase) return { media, checked: true };
  try {
    const found = (await rapidGet(
      V2_HOST,
      `/api/v1/exercises/search?search=${encodeURIComponent(phrase)}`
    )) as { data?: { exerciseId: string; name: string }[] };
    const best = (found.data ?? [])
      .map((c) => ({ c, s: score(phrase, c.name) }))
      .sort((a, b) => b.s - a.s)[0];
    if (!best || best.s < 0.9) return { media, checked: true };

    const detail = (await rapidGet(
      V2_HOST,
      `/api/v1/exercises/${encodeURIComponent(best.c.exerciseId)}`
    )) as { data?: { videoUrl?: string; imageUrls?: Record<string, string>; imageUrl?: string; overview?: string } };
    const d = detail.data;
    if (!d?.videoUrl) return { media, checked: true };
    return {
      media: {
        ...media,
        videoUrl: d.videoUrl,
        imageUrl: d.imageUrls?.["720p"] ?? d.imageUrl ?? media.imageUrl,
        overview: d.overview ?? media.overview,
      },
      checked: true,
    };
  } catch {
    return { media, checked: false };
  }
}

let enrichInFlight: Promise<void> | null = null;

// Background backfill: walk cached matches that haven't had a successful v2
// video check and enrich them. Stops the moment v2 fails (rate limit), leaving
// the rest pending for the next kick — so videos fill in over time once quota is
// available, no user action needed. Deduped; never awaited by request paths.
function kickVideoEnrich(): void {
  if (enrichInFlight || !hasRapidApiKey()) return;
  enrichInFlight = (async () => {
    try {
      for (;;) {
        const pending = await listPendingVideoChecks(25);
        if (pending.length === 0) break;
        for (const m of pending) {
          const { media, checked } = await enrichWithVideo(m, m.matchedName ?? "");
          if (!checked) return; // v2 unreachable — stop, retry on a later kick
          await upsertExerciseMedia({ ...media, videoChecked: true });
          await new Promise((r) => setTimeout(r, 300)); // pace v2 calls
        }
      }
    } catch {
      // best effort
    } finally {
      enrichInFlight = null;
    }
  })();
}

function noMatch(key: string, verified = false): ExerciseMedia {
  return {
    key,
    exerciseId: null,
    source: "none",
    matchedName: null,
    videoUrl: null,
    gifUrl: null,
    imageUrl: null,
    targetMuscles: [],
    secondaryMuscles: [],
    bodyParts: [],
    equipments: [],
    instructions: [],
    overview: null,
    verified,
    videoChecked: true, // nothing matched, so nothing to enrich
    resolvedAt: new Date().toISOString(),
  };
}

// The words we pre-filter the index on: the movement's own words plus its
// equipment synonyms (so "(Machine)" can find a "lever …").
function matchWords(name: string): string[] {
  return [...new Set([...tokenize(stripParens(name)), ...equipHints(name)])];
}

// ---- public API ----

// Resolve one exercise name to its media, cache-first. Matches locally against
// the synced catalog (reliable GIF + muscles + instructions), then best-effort
// enriches with a v2 video. Confident matches are cached; an unmatched name is
// left uncached so it re-resolves after a future sync or a manual fix.
export async function resolveExercise(name: string): Promise<ExerciseMedia> {
  const key = exerciseKey(name);
  const cached = await getExerciseMedia(key);
  if (cached) {
    // A match cached before its video could be fetched (e.g. rate limit) gets
    // upgraded in the background so the video shows next time.
    if (!cached.videoChecked) kickVideoEnrich();
    return cached;
  }

  let row: ExerciseIndexRow | null;
  try {
    await ensureIndex();
    row = bestRow(name, await searchExerciseIndex(matchWords(name)));
  } catch {
    return noMatch(key);
  }
  if (!row) return noMatch(key);

  const { media, checked } = await enrichWithVideo(mediaFromRow(key, row, false), name);
  const saved = await upsertExerciseMedia({ ...media, videoChecked: checked });
  if (!checked) kickVideoEnrich(); // v2 was down — schedule a retry
  return saved;
}

// Resolve a whole session/plan-day of names: one cache read, then resolve only
// the misses.
export async function resolveExercises(names: string[]): Promise<Map<string, ExerciseMedia>> {
  const keyed = names.map((n) => ({ name: n, key: exerciseKey(n) }));
  const uniqueKeys = [...new Set(keyed.map((k) => k.key))];
  const cache = await getExerciseMediaMany(uniqueKeys);
  for (const { name, key } of keyed) {
    if (cache.has(key)) continue;
    cache.set(key, await resolveExercise(name));
  }
  return cache;
}

// Hand-pick the right exercise from the catalog, verified so a re-resolve won't
// clobber it.
export async function overrideExerciseMatch(
  name: string,
  exerciseId: string
): Promise<ExerciseMedia> {
  const key = exerciseKey(name);
  const row = await getExerciseIndexById(exerciseId);
  if (!row) throw new Error(`Exercise ${exerciseId} not in catalog`);
  const { media, checked } = await enrichWithVideo(mediaFromRow(key, row, true), row.name);
  const saved = await upsertExerciseMedia({ ...media, videoChecked: checked });
  if (!checked) kickVideoEnrich();
  return saved;
}

export async function clearExerciseMatch(name: string): Promise<ExerciseMedia> {
  return upsertExerciseMedia(noMatch(exerciseKey(name), true));
}

function rowToCandidate(row: ExerciseIndexRow): ExerciseCandidate {
  return { source: "v1", exerciseId: row.exerciseId, name: row.name, thumbUrl: row.gifUrl };
}

// Free-text search over the local catalog for the picker, ranked by relevance.
export async function searchExercises(term: string): Promise<ExerciseCandidate[]> {
  const clean = term.trim();
  if (!clean) return [];
  await ensureIndex();
  const rows = await searchExerciseIndex(tokenize(clean));
  return rows
    .map((r) => ({ r, s: score(clean, r.name) }))
    .filter((x) => x.s > 0)
    .sort((a, b) => b.s - a.s)
    .slice(0, 30)
    .map((x) => rowToCandidate(x.r));
}

// Body parts the athlete can browse (the catalog's own vocabulary).
export const BODY_PARTS = [
  "chest", "back", "shoulders", "upper arms", "lower arms",
  "upper legs", "lower legs", "waist", "cardio", "neck",
] as const;

export async function browseByBodyPart(bodyPart: string): Promise<ExerciseCandidate[]> {
  await ensureIndex();
  const rows = await browseExerciseIndexByBodyPart(bodyPart);
  return rows.map(rowToCandidate);
}

// ---- muscle visualizer ----

// The names the visualizer will highlight. Muscles it doesn't know are dropped
// so a stray name can't 400 the whole render.
const VIZ_MUSCLES = new Set([
  "ABDOMINALS", "ABDUCTORS", "ABS", "ADDUCTOR BREVIS", "ADDUCTOR LONGUS",
  "ADDUCTOR MAGNUS", "ADDUCTORS", "ANTERIOR DELTOID", "BACK", "BICEPS",
  "BICEPS BRACHII", "BRACHIALIS", "BRACHIORADIALIS", "CALVES", "CHEST", "CORE",
  "DEEP HIP EXTERNAL ROTATORS", "DELTOIDS", "DELTS", "ERECTOR SPINAE", "FOREARMS",
  "GASTROCNEMIUS", "GLUTES", "GLUTEUS MAXIMUS", "GLUTEUS MEDIUS", "GLUTEUS MINIMUS",
  "GRIP MUSCLES", "GROIN", "HAMSTRINGS", "HIP FLEXORS", "ILIOPSOAS", "INFRASPINATUS",
  "INNER THIGHS", "LATERAL DELTOID", "LATISSIMUS DORSI", "LATS", "LEGS",
  "LEVATOR SCAPULAE", "LOWER BACK", "NECK", "OBLIQUES", "PECTINEUS",
  "PECTORALIS MAJOR CLAVICULAR HEAD", "PECTORALIS MAJOR STERNAL HEAD", "PECTORALS",
  "POPLITEUS", "POSTERIOR DELTOID", "QUADRICEPS", "QUADS", "REAR DELTOIDS",
  "RECTUS ABDOMINIS", "RHOMBOIDS", "ROTATOR CUFF", "SARTORIUS", "SERRATUS ANTE",
  "SERRATUS ANTERIOR", "SHINS", "SHOULDERS", "SOLEUS", "SPINE", "SPLENIUS",
  "SUBSCAPULARIS", "TENSOR FASCIAE LATAE", "TERES MAJOR", "TERES MINOR",
  "TIBIALIS ANTERIOR", "TRANSVERSUS ABDOMINIS", "TRAPEZIUS", "TRAPEZIUS LOWER FIBERS",
  "TRAPEZIUS MIDDLE FIBERS", "TRAPEZIUS UPPER FIBERS", "TRAPS", "TRICEPS",
  "TRICEPS BRACHII", "UPPER BACK", "UPPER CHEST", "WRIST EXTENSORS", "WRIST FLEXORS",
  "WRISTS",
]);

// Fold catalog muscle names onto one canonical name each, so the same muscle
// never shows up twice (e.g. "quads" primary + "quadriceps" secondary) and
// unrecognized spellings map to what the visualizer draws.
const MUSCLE_ALIASES: Record<string, string> = {
  "LOWER ABS": "ABS",
  ABDOMINALS: "ABS",
  "RECTUS ABDOMINIS": "ABS",
  QUADRICEPS: "QUADS",
  "LATISSIMUS DORSI": "LATS",
  GASTROCNEMIUS: "CALVES",
  "BICEPS BRACHII": "BICEPS",
  "TRICEPS BRACHII": "TRICEPS",
  DELTOIDS: "DELTS",
  STERNOCLEIDOMASTOID: "NECK",
};

// Normalize catalog muscle names to the visualizer's vocabulary, dropping the
// ones it can't draw (feet, cardio, …). Order-preserving, de-duped.
export function toVisualizerMuscles(names: string[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const n of names) {
    const u = n.toUpperCase();
    const mapped = MUSCLE_ALIASES[u] ?? u;
    if (VIZ_MUSCLES.has(mapped) && !seen.has(mapped)) {
      seen.add(mapped);
      out.push(mapped);
    }
  }
  return out;
}

// Roll a session's exercises up into primary/secondary muscle sets for the
// visualizer: a muscle any exercise targets is a primary mover; one only ever
// hit as support is secondary. Names already normalized to the visualizer's set.
export function aggregateSessionMuscles(
  mediaList: { targetMuscles: string[]; secondaryMuscles: string[] }[]
): { target: string[]; secondary: string[] } {
  const target: string[] = [];
  const secondary: string[] = [];
  for (const m of mediaList) {
    target.push(...m.targetMuscles);
    secondary.push(...m.secondaryMuscles);
  }
  const T = toVisualizerMuscles(target);
  const tset = new Set(T);
  const S = toVisualizerMuscles(secondary).filter((m) => !tset.has(m));
  return { target: T, secondary: S };
}

export type VisualizationOptions = {
  targetMuscles: string[];
  secondaryMuscles: string[];
  gender?: "male" | "female";
  targetColor?: string;
  secondaryColor?: string;
};

// Build the workout-visualization request path. The free tier is strict: every
// param is required, size must be `small`, format `jpeg`, background
// `transparent` (jpeg flattens it to white). secondaryMuscles can't be empty, so
// when a session has no distinct secondaries we reuse the target set in the same
// colour (no visible difference).
export function workoutVisualizationPath(opts: VisualizationOptions): string {
  const targetColor = opts.targetColor ?? "#2563eb";
  let secondary = opts.secondaryMuscles;
  let secondaryColor = opts.secondaryColor ?? "#93c5fd";
  if (secondary.length === 0) {
    secondary = opts.targetMuscles;
    secondaryColor = targetColor;
  }
  const p = new URLSearchParams();
  p.set("targetMuscles", opts.targetMuscles.join(","));
  p.set("targetMusclesColor", targetColor);
  p.set("secondaryMuscles", secondary.join(","));
  p.set("secondaryMusclesColor", secondaryColor);
  p.set("gender", opts.gender ?? "male");
  p.set("background", "transparent");
  p.set("size", "small");
  p.set("format", "jpeg");
  return `/api/v1/visualize/workout?${p.toString()}`;
}

export async function fetchWorkoutVisualization(
  opts: VisualizationOptions
): Promise<{ bytes: ArrayBuffer; contentType: string }> {
  const key = rapidKey();
  if (!key) throw new Error("RAPIDAPI_KEY not set");
  // Deliberately uncached at this layer: the caller stores successful renders in
  // the DB, and Next's data cache would otherwise be free to hold a rate-limit
  // or 5xx response under the same key — which fails every later render without
  // ever reaching the API, so the quota looks untouched while nothing draws.
  const res = await fetch(`https://${VIZ_HOST}${workoutVisualizationPath(opts)}`, {
    headers: { "X-RapidAPI-Key": key, "X-RapidAPI-Host": VIZ_HOST },
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`muscle-visualizer → ${res.status}`);
  return {
    bytes: await res.arrayBuffer(),
    contentType: res.headers.get("content-type") ?? "image/jpeg",
  };
}
