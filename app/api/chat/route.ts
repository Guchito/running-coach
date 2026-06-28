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
  getAnthropicApiKey,
} from "@/lib/db";
import { resolveCoachModel, SYSTEM_PROMPT, buildContextBlock } from "@/lib/coach";
import { executeTool } from "@/lib/coachTools";
import { resolveProvider, type ProviderMessage } from "@/lib/providers";
import { getCurrentUserId, unauthorized } from "@/lib/auth";

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

  const body = await req.json().catch(() => ({}));
  const userText = (body.message as string | undefined)?.trim();
  if (!userText) {
    return NextResponse.json({ error: "Empty message." }, { status: 400 });
  }

  await insertMessage(userId, "user", userText);

  // Build the model conversation from stored plain-text history.
  const history = (await listMessages(userId)).slice(-30);
  const messages: ProviderMessage[] = history.map((m): ProviderMessage => ({
    role: m.role,
    text: m.content,
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
        const [goals, plan, runs, gymSessions, user, lastLthrTest, bodyMetric, anthropicKey] =
          await Promise.all([
            listGoals(userId),
            getPlan(userId),
            listRuns(userId),
            listGymSessions(userId),
            getUserById(userId),
            getLatestLthrTest(userId),
            getLatestBodyMetric(userId),
            getAnthropicApiKey(userId),
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
        const provider = resolveProvider(model, anthropicKey);

        // Agentic loop: stream text, run any tools, feed results back, repeat.
        // The provider (Claude or a free NVIDIA model) handles its own wire format.
        for (let turn = 0; turn < 6; turn++) {
          const result = await provider.streamTurn({ model, system, messages, onText: send });

          if (result.stopReason !== "tool_use" || result.toolCalls.length === 0) {
            if (result.stopReason === "max_tokens") {
              send("\n\n_(My reply was cut off before I finished — ask me to continue.)_");
            }
            break;
          }

          // Record the assistant turn (the text it said + the tool calls it made).
          messages.push({ role: "assistant", text: result.text, toolCalls: result.toolCalls });

          const toolResults = [];
          for (const tc of result.toolCalls) {
            const r = await executeTool(userId, tc.name, tc.input);
            send(`\n\n_✓ ${r.summary}_\n\n`);
            toolResults.push({ id: tc.id, content: JSON.stringify(r.data) });
          }
          messages.push({ role: "tool", toolResults });
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
