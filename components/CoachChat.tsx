"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Markdown } from "@/components/Markdown";
import { CoachModelPicker } from "@/components/CoachModelPicker";

type Msg = { role: "user" | "assistant"; content: string };

const SUGGESTIONS = [
  "Give me feedback on my latest run.",
  "Am I on track for my goal?",
  "What workout should I do next?",
  "How's my pacing and heart rate looking?",
];

export function CoachChat({
  hasGoal,
  hasRuns,
  model,
  hasAnthropicKey,
}: {
  hasGoal: boolean;
  hasRuns: boolean;
  model: string;
  hasAnthropicKey: boolean;
}) {
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const askedRef = useRef(false);
  const router = useRouter();

  const scrollToBottom = useCallback(() => {
    requestAnimationFrame(() => {
      scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
    });
  }, []);

  const send = useCallback(
    async (text: string) => {
      const trimmed = text.trim();
      if (!trimmed || sending) return;
      setInput("");
      setSending(true);
      setMessages((m) => [...m, { role: "user", content: trimmed }, { role: "assistant", content: "" }]);
      scrollToBottom();

      try {
        const res = await fetch("/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ message: trimmed }),
        });

        if (!res.ok || !res.body) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.error || "The coach could not respond.");
        }

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let acc = "";
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          acc += decoder.decode(value, { stream: true });
          setMessages((m) => {
            const copy = [...m];
            copy[copy.length - 1] = { role: "assistant", content: acc };
            return copy;
          });
          scrollToBottom();
        }

        // The coach edits goals/plans/projections via tools. Each executed tool
        // streams a "✓ …" action line — when one ran, invalidate the cached
        // server components so the dashboard / plan / goals pages show the change
        // (without this, those pages keep serving stale data until a hard reload).
        if (acc.includes("✓")) router.refresh();
      } catch (e) {
        const msg = e instanceof Error ? e.message : "Something went wrong.";
        setMessages((m) => {
          const copy = [...m];
          copy[copy.length - 1] = { role: "assistant", content: `**Something went wrong.** ${msg}` };
          return copy;
        });
      } finally {
        setSending(false);
        scrollToBottom();
      }
    },
    [sending, scrollToBottom, router]
  );

  // Load history, then auto-send any ?ask= prompt once.
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/chat");
        const data = await res.json();
        setMessages(data.messages?.map((m: Msg) => ({ role: m.role, content: m.content })) ?? []);
      } catch {
        /* ignore */
      } finally {
        setLoaded(true);
      }
    })();
  }, []);

  useEffect(() => {
    if (!loaded || askedRef.current) return;
    const params = new URLSearchParams(window.location.search);
    const ask = params.get("ask");
    if (ask) {
      askedRef.current = true;
      window.history.replaceState({}, "", window.location.pathname);
      send(ask);
    }
  }, [loaded, send]);

  useEffect(() => {
    scrollToBottom();
  }, [loaded, scrollToBottom]);

  async function clearChat() {
    if (!confirm("Clear the whole conversation?")) return;
    await fetch("/api/chat", { method: "DELETE" });
    setMessages([]);
  }

  const empty = messages.length === 0;

  return (
    <div className="flex flex-col h-[calc(100vh-2rem)] md:h-[calc(100vh-1rem)] max-w-3xl mx-auto px-4 md:px-6 pt-16 md:pt-4 pb-20 md:pb-4">
      {/* Header */}
      <div className="flex items-center justify-between pb-3 border-b border-border">
        <div className="flex items-center gap-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo.png" alt="" className="w-9 h-9 rounded-full object-contain bg-accent-soft" />
          <div>
            <div className="font-semibold leading-tight">Coach</div>
            <div className="mt-0.5">
              <CoachModelPicker initialModel={model} hasAnthropicKey={hasAnthropicKey} />
            </div>
          </div>
        </div>
        {!empty && (
          <button
            onClick={clearChat}
            className="text-sm text-muted hover:text-red-600 transition-colors duration-150"
          >
            Clear
          </button>
        )}
      </div>

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto py-4 space-y-4">
        {empty && loaded && (
          <div className="text-center mt-10 animate-in">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/logo.png" alt="" className="w-14 h-14 rounded-2xl object-contain mx-auto mb-4" />
            <h2 className="text-lg font-medium">Hi! I&apos;m your running coach.</h2>
            <p className="text-muted text-sm mt-1 max-w-md mx-auto">
              {hasRuns
                ? "Ask me anything about your training, or pick a starter below."
                : "Upload a run and set a goal, then ask me for feedback and a plan."}
            </p>
            {!hasGoal && (
              <p className="text-sm mt-3">
                <a href="/goal" className="text-accent underline">Set a goal</a> so I can tailor your plan.
              </p>
            )}
            <div className="flex flex-wrap gap-2 justify-center mt-5">
              {SUGGESTIONS.map((s) => (
                <button
                  key={s}
                  onClick={() => send(s)}
                  className="text-sm px-3 py-1.5 rounded-full border border-border hover:border-accent hover:text-accent transition-[border-color,color,transform] duration-150 ease-out active:scale-[0.97]"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((m, i) => (
          <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
            <div
              className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-sm animate-in ${
                m.role === "user"
                  ? "bg-accent text-white rounded-br-md"
                  : "bg-card border border-border rounded-bl-md"
              }`}
            >
              {m.role === "assistant" ? (
                m.content ? (
                  <Markdown text={m.content} />
                ) : (
                  <span className="flex gap-1 py-1">
                    <span className="typing-dot w-1.5 h-1.5 rounded-full bg-muted" />
                    <span className="typing-dot w-1.5 h-1.5 rounded-full bg-muted" style={{ animationDelay: "0.2s" }} />
                    <span className="typing-dot w-1.5 h-1.5 rounded-full bg-muted" style={{ animationDelay: "0.4s" }} />
                  </span>
                )
              ) : (
                <span className="whitespace-pre-wrap">{m.content}</span>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Composer */}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          send(input);
        }}
        className="border-t border-border pt-3"
      >
        <div className="flex items-end gap-2 bg-card border border-border rounded-2xl px-3 py-2 transition-[border-color,box-shadow] duration-150 focus-within:border-accent focus-within:shadow-[0_0_0_3px_var(--accent-soft)]">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                send(input);
              }
            }}
            rows={1}
            placeholder="Ask your coach…"
            className="no-ring flex-1 resize-none bg-transparent outline-none text-sm max-h-32 py-1"
          />
          <button
            type="submit"
            disabled={sending || !input.trim()}
            className="shrink-0 grid place-items-center w-9 h-9 rounded-xl bg-accent text-white transition-[transform,opacity] duration-150 ease-out active:scale-[0.94] disabled:opacity-40 disabled:active:scale-100"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 12h14M12 5l7 7-7 7" />
            </svg>
          </button>
        </div>
      </form>
    </div>
  );
}
