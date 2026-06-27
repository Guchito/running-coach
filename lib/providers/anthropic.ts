import Anthropic from "@anthropic-ai/sdk";
import { COACH_TOOLS, supportsEffort } from "../coachDefs";
import type { CoachProvider, ProviderMessage, StreamTurnResult, StopReason } from "./types";

// Translate neutral history into Anthropic's message format.
function toAnthropicMessages(messages: ProviderMessage[]): Anthropic.MessageParam[] {
  return messages.map((m): Anthropic.MessageParam => {
    if (m.role === "user") return { role: "user", content: m.text };
    if (m.role === "assistant") {
      const blocks: Anthropic.ContentBlockParam[] = [];
      if (m.text) blocks.push({ type: "text", text: m.text });
      for (const tc of m.toolCalls ?? []) {
        blocks.push({ type: "tool_use", id: tc.id, name: tc.name, input: tc.input });
      }
      return { role: "assistant", content: blocks };
    }
    // Tool results go back as a user message of tool_result blocks.
    return {
      role: "user",
      content: m.toolResults.map((r) => ({
        type: "tool_result" as const,
        tool_use_id: r.id,
        content: r.content,
      })),
    };
  });
}

// Claude path. Keeps prompt caching and the `effort` knob — these are the things
// the free providers can't do, so the Claude experience is unchanged.
export class AnthropicProvider implements CoachProvider {
  private client: Anthropic;
  constructor(apiKey: string) {
    this.client = new Anthropic({ apiKey });
  }

  async streamTurn(opts: {
    model: string;
    system: string;
    messages: ProviderMessage[];
    onText: (delta: string) => void;
  }): Promise<StreamTurnResult> {
    const { model, system, messages, onText } = opts;
    const ms = this.client.messages.stream({
      model,
      // Generous cap: a full weekly + macro plan tool call plus the reply can run
      // past a few thousand tokens; too low truncates the tool_use block.
      max_tokens: 16000,
      ...(supportsEffort(model) ? { output_config: { effort: "low" as const } } : {}),
      // Cache the big static prefix (tools + system + context) as a unit, re-read
      // at ~10% cost; the top-level breakpoint moves forward over the history.
      cache_control: { type: "ephemeral" },
      system: [{ type: "text", text: system, cache_control: { type: "ephemeral" } }],
      tools: COACH_TOOLS,
      messages: toAnthropicMessages(messages),
    });

    ms.on("text", (delta: string) => onText(delta));
    const final = await ms.finalMessage();

    let text = "";
    const toolCalls = [];
    for (const block of final.content) {
      if (block.type === "text") text += block.text;
      else if (block.type === "tool_use") {
        toolCalls.push({ id: block.id, name: block.name, input: block.input as Record<string, unknown> });
      }
    }
    const stopReason: StopReason =
      final.stop_reason === "tool_use" ? "tool_use" : final.stop_reason === "max_tokens" ? "max_tokens" : "stop";
    return { text, toolCalls, stopReason };
  }
}
