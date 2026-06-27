import { COACH_TOOLS } from "../coachDefs";
import type { CoachProvider, ProviderMessage, StreamTurnResult, StopReason, ToolCallRequest } from "./types";

const NVIDIA_URL = "https://integrate.api.nvidia.com/v1/chat/completions";
const MAX_TOKENS = 8000;
const TEMPERATURE = 0.3;

// COACH_TOOLS is Anthropic-shaped; OpenAI/NVIDIA want {type:"function", function:{...}}.
// The JSON-schema body (input_schema) is identical, so this is a thin wrapper.
const OPENAI_TOOLS = COACH_TOOLS.map((t) => ({
  type: "function" as const,
  function: { name: t.name, description: t.description, parameters: t.input_schema },
}));

type JsonSchema = {
  type?: string | string[];
  properties?: Record<string, JsonSchema>;
  items?: JsonSchema;
};
const SCHEMA_BY_NAME = new Map<string, JsonSchema>(
  COACH_TOOLS.map((t) => [t.name, t.input_schema as JsonSchema])
);

// Many open models emit numbers as JSON strings ("40" not 40, "171" not 171).
// The bench (see /bench) confirmed this is the main failure mode and that it's a
// pure serialization quirk — content is correct. Coerce to the schema's declared
// type so the tool executor receives clean values.
function coerce(schema: JsonSchema, value: unknown): unknown {
  const types = schema.type ? (Array.isArray(schema.type) ? schema.type : [schema.type]) : [];
  const wants = (t: string) => types.includes(t);

  if (typeof value === "string" && !wants("string")) {
    if ((wants("number") || wants("integer")) && value.trim() !== "" && Number.isFinite(Number(value))) {
      return Number(value);
    }
    if (wants("boolean") && (value === "true" || value === "false")) return value === "true";
    if (wants("null") && (value === "null" || value === "")) return null;
  }
  if (value && typeof value === "object" && !Array.isArray(value) && schema.properties) {
    const obj = value as Record<string, unknown>;
    for (const [key, sub] of Object.entries(schema.properties)) {
      if (key in obj && obj[key] !== undefined) obj[key] = coerce(sub, obj[key]);
    }
  }
  if (Array.isArray(value) && schema.items) {
    value.forEach((item, i) => { value[i] = coerce(schema.items!, item); });
  }
  return value;
}

type OpenAIMessage =
  | { role: "system" | "user"; content: string }
  | { role: "assistant"; content: string; tool_calls?: { id: string; type: "function"; function: { name: string; arguments: string } }[] }
  | { role: "tool"; tool_call_id: string; content: string };

function toOpenAIMessages(system: string, messages: ProviderMessage[]): OpenAIMessage[] {
  const out: OpenAIMessage[] = [{ role: "system", content: system }];
  for (const m of messages) {
    if (m.role === "user") {
      out.push({ role: "user", content: m.text });
    } else if (m.role === "assistant") {
      const msg: Extract<OpenAIMessage, { role: "assistant" }> = { role: "assistant", content: m.text || "" };
      if (m.toolCalls?.length) {
        msg.tool_calls = m.toolCalls.map((tc) => ({
          id: tc.id,
          type: "function",
          function: { name: tc.name, arguments: JSON.stringify(tc.input) },
        }));
      }
      out.push(msg);
    } else {
      for (const r of m.toolResults) out.push({ role: "tool", tool_call_id: r.id, content: r.content });
    }
  }
  return out;
}

// Accumulator for a streamed tool call (arguments arrive as string fragments).
type PartialToolCall = { id: string; name: string; args: string };

// Free models on build.nvidia.com via the OpenAI-compatible API. No prompt
// caching (the context is re-sent each turn), and args are coerced to schema type.
export class NvidiaProvider implements CoachProvider {
  private apiKey: string;
  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  // POST with retry on 429 (free-tier rate limit) and transient 5xx. The agentic
  // loop fires several requests per message with no caching, so the shared
  // per-key limit is easy to brush; backing off and retrying recovers silently.
  // Honors a Retry-After header when present, else a linear backoff.
  private async postWithRetry(payload: object): Promise<Response> {
    const MAX_ATTEMPTS = 3;
    for (let attempt = 1; ; attempt++) {
      const res = await fetch(NVIDIA_URL, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          "Content-Type": "application/json",
          Accept: "text/event-stream",
        },
        body: JSON.stringify(payload),
      });
      if (res.ok && res.body) return res;

      const retryable = res.status === 429 || res.status >= 500;
      if (retryable && attempt < MAX_ATTEMPTS) {
        const retryAfter = Number(res.headers.get("retry-after"));
        const waitMs = Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : attempt * 4000;
        await res.text().catch(() => ""); // drain the body so the connection is released
        await new Promise((r) => setTimeout(r, waitMs));
        continue;
      }

      const body = await res.text().catch(() => "");
      const hint = res.status === 429 ? " The free NVIDIA tier is rate-limited — wait a moment and try again." : "";
      throw new Error(`NVIDIA request failed (HTTP ${res.status}).${hint} ${body.slice(0, 160)}`);
    }
  }

  async streamTurn(opts: {
    model: string;
    system: string;
    messages: ProviderMessage[];
    onText: (delta: string) => void;
  }): Promise<StreamTurnResult> {
    const { model, system, messages, onText } = opts;

    const res = await this.postWithRetry({
      model,
      messages: toOpenAIMessages(system, messages),
      tools: OPENAI_TOOLS,
      tool_choice: "auto",
      temperature: TEMPERATURE,
      max_tokens: MAX_TOKENS,
      stream: true,
    });

    let text = "";
    let finish = "";
    const partials = new Map<number, PartialToolCall>(); // keyed by tool_call index
    const reader = res.body!.getReader(); // postWithRetry only returns when body is present
    const decoder = new TextDecoder();
    let buffer = "";

    // Parse the SSE stream: lines of "data: {json}", terminated by "data: [DONE]".
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? ""; // keep the trailing partial line
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed.startsWith("data:")) continue;
        const data = trimmed.slice(5).trim();
        if (data === "[DONE]") continue;
        let evt;
        try { evt = JSON.parse(data); } catch { continue; }
        const choice = evt.choices?.[0];
        if (!choice) continue;
        const delta = choice.delta ?? {};
        // Stream visible content only — never the model's reasoning_content.
        if (typeof delta.content === "string" && delta.content) {
          text += delta.content;
          onText(delta.content);
        }
        for (const tc of delta.tool_calls ?? []) {
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

    const toolCalls: ToolCallRequest[] = [];
    for (const [idx, p] of partials) {
      if (!p.name) continue;
      let input: Record<string, unknown> = {};
      try { input = p.args.trim() ? JSON.parse(p.args) : {}; } catch { input = {}; }
      const schema = SCHEMA_BY_NAME.get(p.name);
      if (schema) input = coerce(schema, input) as Record<string, unknown>;
      toolCalls.push({ id: p.id || `call_${model}_${idx}`, name: p.name, input });
    }

    // Some models report finish_reason "stop" even when they emitted tool calls.
    const stopReason: StopReason =
      toolCalls.length > 0 ? "tool_use" : finish === "length" ? "max_tokens" : "stop";
    return { text, toolCalls, stopReason };
  }
}
