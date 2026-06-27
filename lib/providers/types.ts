// Provider-neutral types for the coach. The chat route talks to a CoachProvider
// in these terms; each provider (Anthropic, NVIDIA) translates to/from its own
// wire format. This is what lets one agentic loop drive multiple providers.

// A tool call the model wants to make.
export type ToolCallRequest = { id: string; name: string; input: Record<string, unknown> };

// The result of running one tool call, fed back to the model.
export type ToolResultMsg = { id: string; content: string };

// Conversation history in neutral form:
// - user/assistant text turns (plain text, from stored history)
// - an assistant turn that made tool calls (with the text it said alongside)
// - a turn carrying the tool results back to the model
export type ProviderMessage =
  | { role: "user"; text: string }
  | { role: "assistant"; text: string; toolCalls?: ToolCallRequest[] }
  | { role: "tool"; toolResults: ToolResultMsg[] };

export type StopReason = "stop" | "tool_use" | "max_tokens";

export type StreamTurnResult = {
  text: string; // the full assistant text this turn (already streamed via onText)
  toolCalls: ToolCallRequest[];
  stopReason: StopReason;
};

export interface CoachProvider {
  // Stream one assistant turn. Text deltas are delivered through onText as they
  // arrive; the returned text is the same content assembled for history.
  streamTurn(opts: {
    model: string;
    system: string;
    messages: ProviderMessage[];
    onText: (delta: string) => void;
  }): Promise<StreamTurnResult>;
}
