// NVIDIA model bench for the running coach.
//
// Runs the EXACT production system prompt + tools (from lib/coachDefs.ts)
// against candidate NVIDIA models on build.nvidia.com, through the same agentic
// tool loop the app uses, and scores each model on the only thing that matters
// for this app: does it reliably call the right tool with valid arguments?
//
// Tool execution is stubbed (no DB) — we only care about the model's tool calls.
//
// Run:
//   NODE_OPTIONS=--no-warnings node --env-file=.env.local bench/run.mts
//   # optionally override the model list from the CLI:
//   NODE_OPTIONS=--no-warnings node --env-file=.env.local bench/run.mts meta/llama-3.3-70b-instruct qwen/qwen2.5-72b-instruct
//
// Requires NVIDIA_API_KEY in .env.local (get one free at https://build.nvidia.com).

import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { SYSTEM_PROMPT, COACH_TOOLS } from "../lib/coachDefs.ts";

const __dirname = dirname(fileURLToPath(import.meta.url));

// ───────────────────────────────────────────────────────────────────────────
// CANDIDATE MODELS — edit freely. VERIFY each id against the live catalog at
// https://build.nvidia.com/explore/discover (ids drift; a wrong id 404s and is
// reported as an error, not a crash). Only models that support tool/function
// calling are worth testing. CLI args override this list.
// ───────────────────────────────────────────────────────────────────────────
// These ids were live-probed against build.nvidia.com on 2026-06-27 and confirmed
// reachable. The catalog drifts (models get added / moved to 410 Gone), so
// re-probe before trusting. A wrong id just reports as an error and the run continues.
const DEFAULT_MODELS = [
  "meta/llama-3.3-70b-instruct",
  "nvidia/llama-3.3-nemotron-super-49b-v1",
  "mistralai/mistral-large-3-675b-instruct-2512",
  "deepseek-ai/deepseek-v4-pro",
  "qwen/qwen3-next-80b-a3b-instruct",
  "openai/gpt-oss-120b",
  "meta/llama-4-maverick-17b-128e-instruct",
  "nvidia/nvidia-nemotron-nano-9b-v2",
];

// How many models to bench at once. Higher = faster, but more likely to hit the
// free tier's rate limit (429s are retried once).
const MODEL_CONCURRENCY = 3;

const NVIDIA_BASE = "https://integrate.api.nvidia.com/v1/chat/completions";
const MAX_TURNS = 6;
const MAX_TOKENS = 8000;
const TEMPERATURE = 0.2;
const REQUEST_TIMEOUT_MS = 120_000;

// ───────────────────────────────────────────────────────────────────────────
// SEED CONTEXT — a compact, realistic version of what buildContextBlock()
// produces, so scenarios are grounded the way the real app grounds them.
// ───────────────────────────────────────────────────────────────────────────
const BASE_CONTEXT = `TODAY: 2026-06-27 (Saturday)
RUNNER: Alex
GOALS (1 active):
- [id 7] Sub-1:45 Half Marathon (Half Marathon, active), target 1:45:00 @ 4:58/km, 21.1km, by 2026-10-04
HR: max 188 bpm, LTHR 168 bpm. Zones: Z1 <139, Z2 139-152, Z3 152-161, Z4 161-170, Z5 >170.
MACRO PLAN: (none yet — create one with set_macro_plan once goals exist.)
WEEKLY PLAN: (none yet — create one with set_weekly_plan.)
RECENT RUNS: latest 2026-06-25 easy 8.0km @ 5:40/km avg HR 145; 2026-06-22 long 16km @ 5:55/km avg HR 150; weekly volume ~38km, consistent for 6 weeks.
GYM: trains 2x/week; last 2026-06-24 lower body, RPE 7.
TRAINING LOAD: acute:chronic 1.0 (balanced, low injury risk).`;

const NO_GOALS_CONTEXT = BASE_CONTEXT.replace(
  /GOALS \(1 active\):\n- \[id 7\].*/,
  "GOALS: (none set yet — encourage the runner to set one or more.)"
);

const WITH_WEEK_CONTEXT = BASE_CONTEXT.replace(
  "WEEKLY PLAN: (none yet — create one with set_weekly_plan.)",
  `WEEKLY PLAN: Build week, ~40km. Week of 2026-06-22 (Mon).
  • Mon: Rest (rest)
  • Tue: 5×1km @ threshold (intervals, 10km)
  • Wed: Tempo 6km (tempo, 8km)
  • Thu: Easy 6km (easy, 6km)
  • Fri: Lower body — squat focus (strength)
  • Sat: Easy 5km (easy, 5km)
  • Sun: Long run 18km (long, 18km)`
);

// ───────────────────────────────────────────────────────────────────────────
// SCENARIOS — each is a realistic coaching turn. `checks` are the pass criteria
// (in addition to the implicit "all tool-call args are schema-valid" check that
// runs on every scenario). `calls` passed to a check is the list of every tool
// call the model made across all turns: { name, args, parseError }.
// ───────────────────────────────────────────────────────────────────────────
type ToolCall = { name: string; args: Record<string, unknown>; raw: string; parseError?: string };
type Scenario = {
  id: string;
  desc: string;
  context: string;
  user: string;
  checks: { label: string; fn: (calls: ToolCall[]) => boolean }[];
};

const called = (calls: ToolCall[], name: string) => calls.some((c) => c.name === name);
const firstArgs = (calls: ToolCall[], name: string) =>
  calls.find((c) => c.name === name)?.args ?? null;

const SCENARIOS: Scenario[] = [
  {
    id: "build-plan",
    desc: "Build a full plan (flagship: multi-tool, multi-turn)",
    context: BASE_CONTEXT,
    user: "Can you build me a full training plan for my half marathon? Macro plan and this week.",
    checks: [
      { label: "called set_macro_plan", fn: (c) => called(c, "set_macro_plan") },
      { label: "called set_weekly_plan", fn: (c) => called(c, "set_weekly_plan") },
      {
        label: "macro has ≥3 phases",
        fn: (c) => {
          const a = firstArgs(c, "set_macro_plan");
          return Array.isArray(a?.phases) && (a!.phases as unknown[]).length >= 3;
        },
      },
      {
        label: "weekly has all 7 days",
        fn: (c) => {
          const a = firstArgs(c, "set_weekly_plan");
          return Array.isArray(a?.days) && (a!.days as unknown[]).length === 7;
        },
      },
    ],
  },
  {
    id: "create-goal",
    desc: "Create a new goal from natural language",
    context: NO_GOALS_CONTEXT,
    user: "I want to run a sub-50-minute 10K on November 8th 2026.",
    checks: [
      { label: "called upsert_goal", fn: (c) => called(c, "upsert_goal") },
      {
        label: "raceType = 10K",
        fn: (c) => firstArgs(c, "upsert_goal")?.raceType === "10K",
      },
      {
        label: "targetTimeSec under 3000s",
        fn: (c) => {
          const t = firstArgs(c, "upsert_goal")?.targetTimeSec;
          return typeof t === "number" && t > 0 && t <= 3000;
        },
      },
      {
        label: "targetDate = 2026-11-08",
        fn: (c) => firstArgs(c, "upsert_goal")?.targetDate === "2026-11-08",
      },
    ],
  },
  {
    id: "log-lthr",
    desc: "Log an LTHR test result",
    context: BASE_CONTEXT,
    user: "Just finished a lactate threshold test — it came out to 171 bpm.",
    checks: [
      { label: "called log_lthr_test", fn: (c) => called(c, "log_lthr_test") },
      { label: "lthr = 171", fn: (c) => firstArgs(c, "log_lthr_test")?.lthr === 171 },
    ],
  },
  {
    id: "edit-week",
    desc: "Edit one day → must resend the FULL 7-day week",
    context: WITH_WEEK_CONTEXT,
    user: "Swap Wednesday's tempo to Thursday, and make Wednesday an easy 6k instead.",
    checks: [
      { label: "called set_weekly_plan", fn: (c) => called(c, "set_weekly_plan") },
      {
        label: "resent all 7 days (not just edits)",
        fn: (c) => {
          const a = firstArgs(c, "set_weekly_plan");
          return Array.isArray(a?.days) && (a!.days as unknown[]).length === 7;
        },
      },
    ],
  },
  {
    id: "set-projection",
    desc: "Set a race-day projection on an existing goal",
    context: BASE_CONTEXT,
    user: "Honestly, what time do you think I'll actually run on race day? Lock in your prediction.",
    checks: [
      { label: "called set_goal_projection", fn: (c) => called(c, "set_goal_projection") },
      { label: "id = 7", fn: (c) => firstArgs(c, "set_goal_projection")?.id === 7 },
      {
        label: "projectedTime is a clock string",
        fn: (c) => {
          const t = firstArgs(c, "set_goal_projection")?.projectedTime;
          return typeof t === "string" && /^\d+:\d{2}(:\d{2})?$/.test(t.trim());
        },
      },
    ],
  },
  {
    id: "no-tool",
    desc: "Plain feedback request → must NOT call any tool",
    context: BASE_CONTEXT,
    user: "How did my last run look?",
    checks: [{ label: "made zero tool calls", fn: (c) => c.length === 0 }],
  },
];

// ───────────────────────────────────────────────────────────────────────────
// Tool-schema conversion (Anthropic → OpenAI function format) + arg validation.
// ───────────────────────────────────────────────────────────────────────────
type JsonSchema = {
  type?: string | string[];
  properties?: Record<string, JsonSchema>;
  required?: string[];
  items?: JsonSchema;
  enum?: unknown[];
};

const OPENAI_TOOLS = COACH_TOOLS.map((t) => ({
  type: "function" as const,
  function: { name: t.name, description: t.description, parameters: t.input_schema as JsonSchema },
}));

const SCHEMA_BY_NAME = new Map<string, JsonSchema>(
  COACH_TOOLS.map((t) => [t.name, t.input_schema as JsonSchema])
);

function typeOk(value: unknown, type: string): boolean {
  switch (type) {
    case "string": return typeof value === "string";
    case "number": case "integer": return typeof value === "number" && Number.isFinite(value);
    case "boolean": return typeof value === "boolean";
    case "null": return value === null;
    case "array": return Array.isArray(value);
    case "object": return typeof value === "object" && value !== null && !Array.isArray(value);
    default: return true;
  }
}

// Recursively validate args against a tool's JSON schema. Returns error strings.
function validate(schema: JsonSchema, value: unknown, path = ""): string[] {
  const errs: string[] = [];
  if (schema.type) {
    const types = Array.isArray(schema.type) ? schema.type : [schema.type];
    if (!types.some((t) => typeOk(value, t))) {
      errs.push(`${path || "(root)"}: expected ${types.join("|")}, got ${value === null ? "null" : typeof value}`);
      return errs; // type wrong → don't recurse
    }
  }
  if (schema.enum && !schema.enum.includes(value as never)) {
    errs.push(`${path}: ${JSON.stringify(value)} not in [${schema.enum.join(", ")}]`);
  }
  if (typeOk(value, "object") && schema.properties) {
    const obj = value as Record<string, unknown>;
    for (const req of schema.required ?? []) {
      if (!(req in obj) || obj[req] === undefined) errs.push(`${path}.${req}: required, missing`);
    }
    for (const [key, sub] of Object.entries(schema.properties)) {
      if (key in obj && obj[key] !== undefined) errs.push(...validate(sub, obj[key], `${path}.${key}`));
    }
  }
  if (Array.isArray(value) && schema.items) {
    value.forEach((item, i) => errs.push(...validate(schema.items!, item, `${path}[${i}]`)));
  }
  return errs;
}

// Many open models emit ALL tool args as JSON strings ("40" instead of 40,
// "171" instead of 171). That's a serialization quirk, not a reasoning failure,
// and the real provider adapter will coerce it. This mirrors that: coerce values
// to the schema's declared type and count how many fields needed it, so we can
// score true tool-selection skill while still flagging the quirk. The app's
// executeTool already does Number(...) on most fields, so this is realistic.
function coerce(schema: JsonSchema, value: unknown): { value: unknown; count: number } {
  let count = 0;
  const types = schema.type ? (Array.isArray(schema.type) ? schema.type : [schema.type]) : [];
  const wants = (t: string) => types.includes(t);

  // Scalar string → number / boolean coercion when the schema asks for it.
  if (typeof value === "string" && !wants("string")) {
    if ((wants("number") || wants("integer")) && value.trim() !== "" && Number.isFinite(Number(value))) {
      return { value: Number(value), count: 1 };
    }
    if (wants("boolean") && (value === "true" || value === "false")) {
      return { value: value === "true", count: 1 };
    }
    if (wants("null") && (value === "null" || value === "")) return { value: null, count: 1 };
  }
  if (typeOk(value, "object") && schema.properties) {
    const obj = value as Record<string, unknown>;
    for (const [key, sub] of Object.entries(schema.properties)) {
      if (key in obj && obj[key] !== undefined) {
        const r = coerce(sub, obj[key]);
        obj[key] = r.value; count += r.count;
      }
    }
  }
  if (Array.isArray(value) && schema.items) {
    value.forEach((item, i) => { const r = coerce(schema.items!, item); value[i] = r.value; count += r.count; });
  }
  return { value, count };
}

// ───────────────────────────────────────────────────────────────────────────
// NVIDIA call + agentic loop.
// ───────────────────────────────────────────────────────────────────────────
type Msg =
  | { role: "system" | "user"; content: string }
  | { role: "assistant"; content: string | null; tool_calls?: unknown[] }
  | { role: "tool"; tool_call_id: string; content: string };

async function callNvidia(apiKey: string, model: string, messages: Msg[]): Promise<{ ok: true; message: { content: string | null; tool_calls?: { id: string; function: { name: string; arguments: string } }[] }; finish: string } | { ok: false; error: string }> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), REQUEST_TIMEOUT_MS);
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const res = await fetch(NVIDIA_BASE, {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ model, messages, tools: OPENAI_TOOLS, tool_choice: "auto", temperature: TEMPERATURE, max_tokens: MAX_TOKENS }),
        signal: ctrl.signal,
      });
      if (res.status === 429 || res.status >= 500) {
        if (attempt === 0) { await new Promise((r) => setTimeout(r, 6000)); continue; }
      }
      if (!res.ok) {
        const body = await res.text().catch(() => "");
        clearTimeout(timer);
        return { ok: false, error: `HTTP ${res.status}: ${body.slice(0, 200)}` };
      }
      const json = await res.json();
      clearTimeout(timer);
      const choice = json.choices?.[0];
      return { ok: true, message: choice?.message ?? { content: null }, finish: choice?.finish_reason ?? "unknown" };
    } catch (err) {
      if (attempt === 0) { await new Promise((r) => setTimeout(r, 3000)); continue; }
      clearTimeout(timer);
      return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
  }
  clearTimeout(timer);
  return { ok: false, error: "exhausted retries" };
}

// Stubbed tool result — enough for the model to keep going (esp. get_training_history).
function stubResult(name: string): string {
  if (name === "get_training_history") {
    return JSON.stringify({
      history: "Last 14 runs: mix of easy 6-8km @ ~5:40/km, weekly long run 16-18km, one threshold session/week (5×1km @ 4:45/km). Gym 2x/week lower+upper. Volume steady ~38-42km/wk for 6 weeks. No injuries.",
    });
  }
  return JSON.stringify({ ok: true });
}

async function runScenario(apiKey: string, model: string, sc: Scenario) {
  const system = `${SYSTEM_PROMPT}\n\n---\nCURRENT CONTEXT (refreshed each message):\n${sc.context}`;
  const messages: Msg[] = [
    { role: "system", content: system },
    { role: "user", content: sc.user },
  ];
  const calls: ToolCall[] = [];
  const started = Date.now();

  for (let turn = 0; turn < MAX_TURNS; turn++) {
    const res = await callNvidia(apiKey, model, messages);
    if (!res.ok) return { calls, latencyMs: Date.now() - started, error: res.error };

    const toolCalls = res.message.tool_calls ?? [];
    if (toolCalls.length === 0) break; // model is done talking

    messages.push({ role: "assistant", content: res.message.content ?? "", tool_calls: toolCalls });
    for (const tc of toolCalls) {
      let args: Record<string, unknown> = {};
      let parseError: string | undefined;
      try {
        args = JSON.parse(tc.function.arguments || "{}");
      } catch (e) {
        parseError = `invalid JSON arguments: ${e instanceof Error ? e.message : e}`;
      }
      calls.push({ name: tc.function.name, args, raw: tc.function.arguments, parseError });
      messages.push({ role: "tool", tool_call_id: tc.id, content: stubResult(tc.function.name) });
    }
  }
  return { calls, latencyMs: Date.now() - started, error: undefined as string | undefined };
}

// ───────────────────────────────────────────────────────────────────────────
// Scoring + reporting.
// ───────────────────────────────────────────────────────────────────────────
function scoreScenario(sc: Scenario, calls: ToolCall[]) {
  // Coerce string-encoded numbers/booleans to the schema's type FIRST (mutates
  // calls in place), so checks and validation see the realistic, post-adapter args.
  let coercedFields = 0;
  for (const c of calls) {
    if (c.parseError) continue;
    const schema = SCHEMA_BY_NAME.get(c.name);
    if (schema) coercedFields += coerce(schema, c.args).count;
  }

  const schemaErrors: string[] = [];
  for (const c of calls) {
    if (c.parseError) { schemaErrors.push(`${c.name}: ${c.parseError}`); continue; }
    const schema = SCHEMA_BY_NAME.get(c.name);
    if (!schema) { schemaErrors.push(`${c.name}: unknown tool`); continue; }
    schemaErrors.push(...validate(schema, c.args).map((e) => `${c.name}${e}`));
  }
  const checkResults = sc.checks.map((ch) => ({ label: ch.label, pass: ch.fn(calls) }));
  const checksPass = checkResults.every((r) => r.pass);
  const pass = checksPass && schemaErrors.length === 0;
  return { pass, schemaErrors, checkResults, coercedFields };
}

type ModelResult = {
  model: string;
  passed: number;
  total: number;
  avgMs: number;
  coercedScenarios: number; // scenarios that needed string→number coercion to pass
  fatal?: string;
  lines: string[]; // buffered console output for this model
  perScenario: Record<string, unknown>;
};

async function runModel(apiKey: string, model: string): Promise<ModelResult> {
  const lines = [`\n━━ ${model}`];
  const perScenario: Record<string, unknown> = {};
  let passed = 0;
  let coercedScenarios = 0;
  const latencies: number[] = [];
  let fatal: string | undefined;

  for (const sc of SCENARIOS) {
    const { calls, latencyMs, error } = await runScenario(apiKey, model, sc);
    if (error) {
      lines.push(`   ${sc.id.padEnd(16)} ERROR  ${error}`);
      perScenario[sc.id] = { error, calls };
      if (/HTTP 4(0[0-4]|10)/.test(error)) { fatal = error; break; } // bad id / auth / gone → stop early
      continue;
    }
    const { pass, schemaErrors, checkResults, coercedFields } = scoreScenario(sc, calls);
    if (pass) passed++;
    if (pass && coercedFields > 0) coercedScenarios++;
    latencies.push(latencyMs);
    const failed = checkResults.filter((r) => !r.pass).map((r) => r.label);
    const note = pass
      ? coercedFields > 0 ? `  (coerced ${coercedFields} field${coercedFields > 1 ? "s" : ""})` : ""
      : `  ✗ ${[...failed, ...schemaErrors].slice(0, 3).join("; ")}`;
    lines.push(`   ${sc.id.padEnd(16)} ${pass ? "PASS" : "FAIL"}  ${String(latencyMs).padStart(6)}ms  [${calls.map((c) => c.name).join(", ") || "no calls"}]${note}`);
    perScenario[sc.id] = { pass, latencyMs, coercedFields, schemaErrors, checkResults, calls };
  }

  const avgMs = latencies.length ? Math.round(latencies.reduce((a, b) => a + b, 0) / latencies.length) : 0;
  return { model, passed, total: SCENARIOS.length, avgMs, coercedScenarios, fatal, lines, perScenario };
}

// Run an array of async thunks with a fixed concurrency cap.
async function pool<T>(items: (() => Promise<T>)[], concurrency: number): Promise<T[]> {
  const results: T[] = new Array(items.length);
  let next = 0;
  async function worker() {
    while (next < items.length) {
      const i = next++;
      results[i] = await items[i]();
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, worker));
  return results;
}

async function main() {
  const apiKey = process.env.NVIDIA_API_KEY;
  if (!apiKey) {
    console.error("\n  ✗ NVIDIA_API_KEY is not set. Add it to .env.local (get one free at https://build.nvidia.com).\n");
    process.exit(1);
  }
  const models = process.argv.slice(2).length ? process.argv.slice(2) : DEFAULT_MODELS;

  console.log(`\nBenching ${models.length} model(s) × ${SCENARIOS.length} scenarios against NVIDIA (${MODEL_CONCURRENCY} at a time)...`);

  // Run models concurrently; print each model's block as soon as it finishes.
  const done = new Set<string>();
  const results = await pool(
    models.map((model) => async () => {
      const r = await runModel(apiKey, model);
      done.add(model);
      console.log(r.lines.join("\n"));
      console.log(`   ··· ${done.size}/${models.length} models done`);
      return r;
    }),
    MODEL_CONCURRENCY
  );

  // Scoreboard, best first (most passes, then fewest needing coercion, then fastest).
  results.sort((a, b) => b.passed - a.passed || a.coercedScenarios - b.coercedScenarios || a.avgMs - b.avgMs);
  console.log("\n\n══════════════════ SCOREBOARD ══════════════════");
  console.log(`${"model".padEnd(46)} ${"pass".padEnd(6)} ${"coerced".padEnd(8)} ${"avg".padEnd(9)} note`);
  for (const s of results) {
    const score = `${s.passed}/${s.total}`;
    const coerced = s.fatal ? "—" : `${s.coercedScenarios}/${s.passed || 0}`;
    const avg = s.avgMs ? `${s.avgMs}ms` : "—";
    console.log(`${s.model.padEnd(46)} ${score.padEnd(6)} ${coerced.padEnd(8)} ${avg.padEnd(9)} ${s.fatal ? `FATAL: ${s.fatal.slice(0, 36)}` : ""}`);
  }
  console.log(`\n"coerced" = passing scenarios that needed string→number coercion (the adapter handles this; lower is cleaner).`);

  const report = {
    generatedAtMs: Date.now(),
    models: Object.fromEntries(results.map((r) => [r.model, { fatal: r.fatal, scenarios: r.perScenario }])),
  };
  const outPath = join(__dirname, "results.json");
  writeFileSync(outPath, JSON.stringify(report, null, 2));
  console.log(`\nFull detail (every tool call + args) → ${outPath}\n`);
}

main().catch((e) => { console.error(e); process.exit(1); });
