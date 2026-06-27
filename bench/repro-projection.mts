// Open-ended projection: the coach PICKS the time. Checks whether the time it
// states in prose matches the projectedTimeSec it stores via the tool. A
// mismatch = dashboard shows a different time than the chat claimed.
//   NODE_OPTIONS=--no-warnings node --env-file=.env.local bench/repro-projection.mts [model]
const key = process.env.NVIDIA_API_KEY;
if (!key) { console.error("NVIDIA_API_KEY not set"); process.exit(1); }
const model = process.argv[2] || "mistralai/mistral-large-3-675b-instruct-2512";

const SYSTEM = `You are an expert running coach. Use set_goal_projection to set the runner's realistic projected race-day finish. projectedTimeSec MUST be the finish time IN SECONDS. Also tell the runner the projected time in prose.

CONTEXT:
GOALS (1 active):
- [id 8] Ørestad Half Marathon (21.1 km, active), by 2026-08-15
RECENT RUNS: 7.4 km @ 6:05/km; 16 km long run @ 6:30/km; threshold 5×1km @ 5:30/km. Weekly ~38 km.`;

const TOOL = {
  type: "function",
  function: {
    name: "set_goal_projection",
    description: "Set projected race-day finish. id = goal id. projectedTimeSec = finish time IN SECONDS.",
    parameters: {
      type: "object",
      properties: { id: { type: "number" }, projectedTimeSec: { type: ["number", "null"] } },
      required: ["id", "projectedTimeSec"],
    },
  },
};
const fmt = (sec: number) => {
  const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = Math.round(sec % 60);
  return h > 0 ? `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}` : `${m}:${String(s).padStart(2, "0")}`;
};

const res = await fetch("https://integrate.api.nvidia.com/v1/chat/completions", {
  method: "POST",
  headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
  body: JSON.stringify({
    model,
    messages: [
      { role: "system", content: SYSTEM },
      { role: "user", content: "What time do you realistically think I'll run on race day? Lock in your projection." },
    ],
    tools: [TOOL], tool_choice: "auto", temperature: 0, max_tokens: 1200,
  }),
});
if (!res.ok) { console.log(`HTTP ${res.status}: ${await res.text()}`); process.exit(1); }
const msg = (await res.json()).choices?.[0]?.message ?? {};
const call = msg.tool_calls?.[0];
console.log(`Model: ${model}\n`);
console.log(`PROSE:\n${(msg.content || "(none)").slice(0, 400)}\n`);
if (!call) { console.log("No tool call."); process.exit(0); }
const sent = JSON.parse(call.function.arguments).projectedTimeSec;
console.log(`STORED projectedTimeSec = ${sent}  → dashboard shows: ${typeof sent === "number" ? fmt(sent) : sent}`);
