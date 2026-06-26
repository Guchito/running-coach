import { NextRequest, NextResponse } from "next/server";
import {
  listMessages,
  insertMessage,
  clearMessages,
  listRuns,
  getGoal,
} from "@/lib/db";
import { getClient, COACH_MODEL, SYSTEM_PROMPT, buildContextBlock } from "@/lib/coach";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET() {
  return NextResponse.json({ messages: listMessages() });
}

export async function DELETE() {
  clearMessages();
  return NextResponse.json({ ok: true });
}

export async function POST(req: NextRequest) {
  let client;
  try {
    client = getClient();
  } catch (err) {
    const message = err instanceof Error ? err.message : "Claude is not configured.";
    return NextResponse.json({ error: message }, { status: 500 });
  }

  const body = await req.json().catch(() => ({}));
  const userText = (body.message as string | undefined)?.trim();
  if (!userText) {
    return NextResponse.json({ error: "Empty message." }, { status: 400 });
  }

  // Persist the user's message, then build the model conversation.
  insertMessage("user", userText);

  const history = listMessages().slice(-30);
  const conversation = history.map((m) => ({
    role: m.role,
    content: m.content,
  }));

  const context = buildContextBlock(getGoal(), listRuns());
  const system = `${SYSTEM_PROMPT}\n\n---\nCURRENT CONTEXT (regenerated each message):\n${context}`;

  const encoder = new TextEncoder();
  let full = "";

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        const mStream = client.messages.stream({
          model: COACH_MODEL,
          max_tokens: 1500,
          system,
          messages: conversation as Parameters<typeof client.messages.stream>[0]["messages"],
        });

        mStream.on("text", (delta: string) => {
          full += delta;
          controller.enqueue(encoder.encode(delta));
        });

        await mStream.finalMessage();
      } catch (err) {
        const message = err instanceof Error ? err.message : "Coach failed to respond.";
        controller.enqueue(encoder.encode(`\n\n[Error: ${message}]`));
        full = full || `[Error: ${message}]`;
      } finally {
        if (full.trim()) insertMessage("assistant", full);
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-cache",
    },
  });
}
