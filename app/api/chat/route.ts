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
  listHealthMetrics,
  getAnthropicApiKey,
  getNvidiaApiKey,
} from "@/lib/db";
import { resolveCoachModel, demoModel, SYSTEM_PROMPT, buildContextBlock, providerFor } from "@/lib/coach";
import { executeTool } from "@/lib/coachTools";
import { resolveProvider, type ProviderMessage } from "@/lib/providers";
import { getCurrentUserId, isDemoSession, unauthorized } from "@/lib/auth";

export const runtime = "nodejs";
export const maxDuration = 120;

export async function GET() {
  const userId = await getCurrentUserId();
  if (!userId) return unauthorized();
  // The demo shares the owner's account, so its chat history is private: demo
  // visitors always start from an empty thread (theirs lives in the browser).
  if (await isDemoSession()) return NextResponse.json({ messages: [] });
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

  const demo = await isDemoSession();
  if (!demo) await insertMessage(userId, "user", userText);

  // Build the model conversation. Normally that's the stored history; for the
  // demo nothing is stored (visitors share one account and must not see each
  // other's threads, or the owner's), so the client sends its own transcript
  // back. It's untrusted input, hence the shape/'size caps.
  const stored = demo ? [] : await listMessages(userId);
  const clientHistory = demo
    ? (Array.isArray(body.history) ? body.history : [])
        .filter(
          (m: unknown): m is { role: string; content: string } =>
            !!m &&
            typeof m === "object" &&
            ((m as { role?: unknown }).role === "user" ||
              (m as { role?: unknown }).role === "assistant") &&
            typeof (m as { content?: unknown }).content === "string"
        )
        .slice(-30)
        .map((m: { role: string; content: string }) => ({
          role: m.role as "user" | "assistant",
          content: m.content.slice(0, 8000),
        }))
    : [];
  const history = [...stored, ...clientHistory].slice(-30);
  const messages: ProviderMessage[] = history.map((m): ProviderMessage => ({
    role: m.role,
    text: m.content,
  }));
  if (demo) messages.push({ role: "user", text: userText });

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
        const [goals, plan, runs, gymSessions, user, lastLthrTest, healthMetrics, anthropicKey, nvidiaKey] =
          await Promise.all([
            listGoals(userId),
            getPlan(userId),
            listRuns(userId),
            listGymSessions(userId),
            getUserById(userId),
            getLatestLthrTest(userId),
            listHealthMetrics(userId, 14),
            getAnthropicApiKey(userId),
            getNvidiaApiKey(userId),
          ]);
        // The demo shares the owner's account but must never spend their paid
        // Claude credits: it ignores their Anthropic key and their saved model,
        // and may only pick (per request, nothing saved) among the free ones.
        const model = demo ? demoModel(body.model) : resolveCoachModel(user?.coachModel);
        const claudeKey = demo ? null : anthropicKey;
        // Anthropic caches the static prefix (tools + system + context), so
        // repeat reads in the agentic loop bill at ~10%. The other providers
        // re-send everything at full price each call — give them a leaner
        // context, shorter history, and fewer loop turns so free-tier token
        // quotas last.
        const cached = providerFor(model) === "anthropic";
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
          healthMetrics,
          lean: !cached,
        });
        // Auto-naming is handled reliably server-side (see /api/runs/[id]/autoname),
        // so the coach is NOT asked to rename during analysis — that avoids weak
        // models faking the rename and avoids double-renaming. The rename_run tool
        // stays available for explicit user requests ("rename run #3").
        const system = `${SYSTEM_PROMPT}\n\n---\nCURRENT CONTEXT (refreshed each message):\n${context}`;
        const provider = resolveProvider(model, claudeKey, nvidiaKey);
        const convo = cached ? messages : messages.slice(-12);
        const maxTurns = cached ? 6 : 4;

        // Agentic loop: stream text, run any tools, feed results back, repeat.
        // The provider (Claude or a free NVIDIA model) handles its own wire format.
        for (let turn = 0; turn < maxTurns; turn++) {
          const result = await provider.streamTurn({ model, system, messages: convo, onText: send });

          if (result.stopReason !== "tool_use" || result.toolCalls.length === 0) {
            if (result.stopReason === "max_tokens") {
              send("\n\n_(My reply was cut off before I finished — ask me to continue.)_");
            }
            break;
          }

          // Record the assistant turn (the text it said + the tool calls it made).
          convo.push({ role: "assistant", text: result.text, toolCalls: result.toolCalls });

          const toolResults = [];
          for (const tc of result.toolCalls) {
            const r = await executeTool(userId, tc.name, tc.input, { readOnly: demo });
            send(`\n\n_✓ ${r.summary}_\n\n`);
            toolResults.push({ id: tc.id, content: JSON.stringify(r.data) });
          }
          convo.push({ role: "tool", toolResults });
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : "Coach failed to respond.";
        send(`\n\n[Error: ${message}]`);
      } finally {
        if (!demo && persisted.trim()) await insertMessage(userId, "assistant", persisted);
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
