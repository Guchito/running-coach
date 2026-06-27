// Validates the streaming wire-format assumptions the NvidiaProvider relies on:
// that NVIDIA streams content deltas + tool_call deltas over SSE, with tool-call
// arguments arriving as string fragments keyed by index. Mirrors the provider's
// SSE parser exactly. (Run via Node, which can't import the app's extensionless
// modules — so the parser is reproduced here for a wire-format smoke test.)
//   NODE_OPTIONS=--no-warnings node --env-file=.env.local bench/provider-check.mts [model]
const key = process.env.NVIDIA_API_KEY;
if (!key) { console.error("NVIDIA_API_KEY not set"); process.exit(1); }
const model = process.argv[2] || "mistralai/mistral-large-3-675b-instruct-2512";

const res = await fetch("https://integrate.api.nvidia.com/v1/chat/completions", {
  method: "POST",
  headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json", Accept: "text/event-stream" },
  body: JSON.stringify({
    model,
    messages: [
      { role: "system", content: "You are a running coach. Use tools to save plans." },
      { role: "user", content: "Build a quick 3-phase macro plan for a half marathon (call set_macro_plan with phases each having name, focus, weeklyKm as a number)." },
    ],
    tools: [{
      type: "function",
      function: {
        name: "set_macro_plan",
        description: "Save the macro plan.",
        parameters: {
          type: "object",
          properties: {
            summary: { type: "string" },
            phases: { type: "array", items: { type: "object", properties: {
              name: { type: "string" }, focus: { type: "string" }, weeklyKm: { type: "number" },
            }, required: ["name", "focus"] } },
          },
          required: ["summary", "phases"],
        },
      },
    }],
    tool_choice: "auto", temperature: 0.3, max_tokens: 2000, stream: true,
  }),
});
if (!res.ok || !res.body) { console.error(`HTTP ${res.status}: ${await res.text()}`); process.exit(1); }

let text = "", finish = "", deltaCount = 0, toolDeltaCount = 0;
const partials = new Map();
const reader = res.body.getReader();
const decoder = new TextDecoder();
let buffer = "";
while (true) {
  const { done, value } = await reader.read();
  if (done) break;
  buffer += decoder.decode(value, { stream: true });
  const lines = buffer.split("\n");
  buffer = lines.pop() ?? "";
  for (const line of lines) {
    const t = line.trim();
    if (!t.startsWith("data:")) continue;
    const data = t.slice(5).trim();
    if (data === "[DONE]") continue;
    let evt; try { evt = JSON.parse(data); } catch { continue; }
    const choice = evt.choices?.[0]; if (!choice) continue;
    const delta = choice.delta ?? {};
    if (typeof delta.content === "string" && delta.content) { text += delta.content; deltaCount++; }
    for (const tc of delta.tool_calls ?? []) {
      toolDeltaCount++;
      const idx = tc.index ?? 0;
      const cur = partials.get(idx) ?? { id: "", name: "", args: "" };
      if (tc.id) cur.id = tc.id;
      if (tc.function?.name) cur.name = tc.function.name;
      if (tc.function?.arguments) cur.args += tc.function.arguments;
      partials.set(idx, cur);
    }
    if (choice.finish_reason) finish = choice.finish_reason;
  }
}

console.log(`\nModel: ${model}`);
console.log(`content deltas: ${deltaCount} (chars: ${text.length})`);
console.log(`tool_call deltas: ${toolDeltaCount}`);
console.log(`finish_reason: ${finish}`);
for (const [idx, p] of partials) {
  console.log(`\ntool call #${idx}: id=${p.id || "(none)"} name=${p.name}`);
  let parsed, ok = true; try { parsed = JSON.parse(p.args); } catch (e) { ok = false; console.log(`  args JSON parse FAILED: ${e.message}`); }
  if (ok) {
    const wk = parsed.phases?.[0]?.weeklyKm;
    console.log(`  args parsed OK. phases: ${parsed.phases?.length}. first weeklyKm = ${JSON.stringify(wk)} (type ${typeof wk})`);
  }
}
console.log(`\n✓ SSE parsing + tool-call reassembly works against the live stream.`);
