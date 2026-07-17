"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Markdown } from "@/components/Markdown";
import { HoldConfirmButton } from "@/components/HoldDeleteButton";
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
  const textareaRef = useRef<HTMLTextAreaElement>(null);
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

  // The composer grows with its content (up to the max-h cap) instead of
  // scrolling inside a one-line box.
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 128)}px`;
  }, [input]);

  // iOS Safari overlays the keyboard instead of resizing the page, so a
  // 100vh column gets scrolled up and the composer floats mid-screen with a
  // dead gap above the keyboard. Track the visual viewport and expose the
  // keyboard overlap as --kb; the column height and bottom padding subtract
  // it so the composer hugs the keyboard.
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    const update = () => {
      const kb = Math.max(0, window.innerHeight - vv.height - vv.offsetTop);
      document.documentElement.style.setProperty("--kb", `${Math.round(kb)}px`);
      if (kb > 0) {
        window.scrollTo(0, 0);
        scrollToBottom();
      }
    };
    update();
    vv.addEventListener("resize", update);
    vv.addEventListener("scroll", update);
    return () => {
      vv.removeEventListener("resize", update);
      vv.removeEventListener("scroll", update);
      document.documentElement.style.removeProperty("--kb");
    };
  }, [scrollToBottom]);

  const [clearing, setClearing] = useState(false);
  async function clearChat() {
    setClearing(true);
    await fetch("/api/chat", { method: "DELETE" });
    setMessages([]);
    setClearing(false);
  }

  const empty = messages.length === 0;

  return (
    <div className="flex flex-col h-[calc(100dvh-var(--kb,0px))] md:h-[calc(100vh-1rem)] max-w-3xl mx-auto px-4 md:px-6 pt-16 md:pt-4 pb-[max(0.5rem,calc(5rem-var(--kb,0px)))] md:pb-4">
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
          <HoldConfirmButton
            label="Clear"
            busyLabel="Clearing…"
            title="Hold to clear the conversation"
            confirmText="Clear the whole conversation?"
            onConfirm={clearChat}
            busy={clearing}
          />
        )}
      </div>

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto overflow-x-hidden py-4 space-y-4">
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
                <a href="/goals" className="text-accent underline">Set a goal</a> so I can tailor your plan.
              </p>
            )}
            <div className="flex flex-wrap gap-2 justify-center mt-5 stagger-in">
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
              className={`max-w-[85%] min-w-0 wrap-anywhere rounded-2xl px-4 py-2.5 text-sm animate-in ${
                m.role === "user"
                  ? "bg-accent-soft text-foreground rounded-br-md"
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
            ref={textareaRef}
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
            className="shrink-0 grid place-items-center w-9 h-9 rounded-xl bg-ink text-white hover:bg-black transition-[transform,background-color,opacity] duration-150 ease-out active:scale-[0.94] disabled:opacity-40 disabled:active:scale-100"
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
