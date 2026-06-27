import { NextRequest, NextResponse } from "next/server";
import {
  listMessages,
  insertMessage,
  clearMessages,
  listRuns,
  listGymSessions,
  listGoals,
  getPlan,
  getUserById,
  getLatestLthrTest,
  getLatestBodyMetric,
} from "@/lib/db";
import { getClient, resolveCoachModel, supportsEffort, SYSTEM_PROMPT, buildContextBlock } from "@/lib/coach";
import { COACH_TOOLS, executeTool } from "@/lib/coachTools";
import { getCurrentUserId, unauthorized } from "@/lib/auth";
import type Anthropic from "@anthropic-ai/sdk";

export const runtime = "nodejs";
export const maxDuration = 120;

export async function GET() {
  const userId = await getCurrentUserId();
  if (!userId) return unauthorized();
  return NextResponse.json({ messages: await listMessages(userId) });
}

export async function DELETE() {
  const userId = await getCurrentUserId();
  if (!userId) return unauthorized();
  await clearMessages(userId);
  return NextResponse.json({ ok: true });
}

export async function POST(req: NextRequest) {
  const userId = await getCurrentUserId();
  if (!userId) return unauthorized();

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

  await insertMessage(userId, "user", userText);

  // Build the model conversation from stored plain-text history.
  const history = (await listMessages(userId)).slice(-30);
  const messages: Anthropic.MessageParam[] = history.map((m) => ({
    role: m.role,
    content: m.content,
  }));

  const encoder = new TextEncoder();
  let persisted = ""; // text + action notes saved to history

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (s: string) => {
        persisted += s;
        controller.enqueue(encoder.encode(s));
      };

      try {
        // Rebuild fresh context each request (goals/plan/runs may have changed).
        const [goals, plan, runs, gymSessions, user, lastLthrTest, bodyMetric] = await Promise.all([
          listGoals(userId),
          getPlan(userId),
          listRuns(userId),
          listGymSessions(userId),
          getUserById(userId),
          getLatestLthrTest(userId),
          getLatestBodyMetric(userId),
        ]);
        const context = buildContextBlock({
          goals,
          plan,
          runs,
          gymSessions,
          userName: user?.name,
          maxHr: user?.maxHr,
          lactateThresholdHr: user?.lactateThresholdHr,
          hrZones: user?.hrZones,
          lastLthrTestOn: lastLthrTest?.testedOn ?? null,
          lthrTestIntervalWeeks: user?.lthrTestIntervalWeeks ?? null,
          bodyMetric,
        });
        const system = `${SYSTEM_PROMPT}\n\n---\nCURRENT CONTEXT (refreshed each message):\n${context}`;
        const model = resolveCoachModel(user?.coachModel);

        // Agentic loop: stream text, run any tools, feed results back, repeat.
        for (let turn = 0; turn < 6; turn++) {
          const ms = client.messages.stream({
            model,
            // Generous cap: a full weekly + macro plan tool call (7 days of
            // detail) plus the surrounding reply can run well past a few
            // thousand tokens. Too low here truncates the tool_use block, so the
            // plan update never executes. Streaming, so no HTTP-timeout risk.
            max_tokens: 16000,
            // Low effort = terser, cheaper replies. Not supported on Haiku.
            ...(supportsEffort(model) ? { output_config: { effort: "low" as const } } : {}),
            // Top-level automatic caching: caches everything up to the last
            // block (the growing conversation history) and moves the breakpoint
            // forward each turn — so prior messages read from cache too.
            cache_control: { type: "ephemeral" },
            // Explicit breakpoint on the big static prefix (tools + system +
            // context) so it always caches as a unit, re-read at ~10% cost
            // instead of paying full price to "read everything" each message.
            system: [{ type: "text", text: system, cache_control: { type: "ephemeral" } }],
            tools: COACH_TOOLS,
            messages,
          });
          ms.on("text", (delta: string) => send(delta));
          const final = await ms.finalMessage();

          if (final.stop_reason !== "tool_use") {
            if (final.stop_reason === "max_tokens") {
              send("\n\n_(My reply was cut off before I finished — ask me to continue.)_");
            }
            break;
          }

          // Record the assistant turn (with tool_use blocks) verbatim.
          messages.push({ role: "assistant", content: final.content });

          const toolResults: Anthropic.ToolResultBlockParam[] = [];
          for (const block of final.content) {
            if (block.type !== "tool_use") continue;
            const result = await executeTool(
              userId,
              block.name,
              block.input as Record<string, unknown>
            );
            send(`\n\n_✓ ${result.summary}_\n\n`);
            toolResults.push({
              type: "tool_result",
              tool_use_id: block.id,
              content: JSON.stringify(result.data),
            });
          }
          messages.push({ role: "user", content: toolResults });
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : "Coach failed to respond.";
        send(`\n\n[Error: ${message}]`);
      } finally {
        if (persisted.trim()) await insertMessage(userId, "assistant", persisted);
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
