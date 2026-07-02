"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Markdown } from "@/components/Markdown";
import { formatPace, formatDuration, formatDistance } from "@/lib/parseRun";
import type { RunRow } from "@/lib/types";

// Shown on a freshly uploaded run: automatically asks the coach to review it,
// which (via tools) also updates the training plan and may suggest goal changes.
export function RunReview({ run }: { run: RunRow }) {
  const router = useRouter();
  const [text, setText] = useState("");
  const [done, setDone] = useState(false);
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;

    // Server-side auto-naming (no-op if the toggle is off); refresh so the
    // renamed title shows without a manual reload.
    fetch(`/api/runs/${run.id}/autoname`, { method: "POST" })
      .then((r) => r.json())
      .then((d) => {
        if (d?.name) router.refresh();
      })
      .catch(() => {});

    const prompt =
      `I just uploaded my run "${run.name}" — ${formatDistance(run.distanceM)} in ` +
      `${formatDuration(run.durationSec)}, avg ${formatPace(run.avgPaceSecPerKm)}. ` +
      `Review it and tell me how it went. Update my weekly and macro plan if this run changes anything, ` +
      `and if it suggests my goals should change, tell me what you'd recommend.`;

    (async () => {
      try {
        const res = await fetch("/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ message: prompt }),
        });
        if (!res.ok || !res.body) {
          const d = await res.json().catch(() => ({}));
          throw new Error(d.error || "Coach could not review this run.");
        }
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let acc = "";
        for (;;) {
          const { done: d, value } = await reader.read();
          if (d) break;
          acc += decoder.decode(value, { stream: true });
          setText(acc);
        }
      } catch (e) {
        setText(`⚠️ ${e instanceof Error ? e.message : "Review failed."}`);
      } finally {
        setDone(true);
      }
    })();
  }, [run, router]);

  return (
    <div className="mb-6 rounded-2xl border border-accent/30 bg-accent-soft/40 p-5">
      <div className="flex items-center gap-2 mb-2">
        <span className="grid place-items-center w-7 h-7 rounded-full bg-accent text-white text-sm">🏃</span>
        <span className="font-medium">Coach review</span>
        {!done && (
          <span className="flex gap-1 ml-1">
            <span className="typing-dot w-1.5 h-1.5 rounded-full bg-accent" />
            <span className="typing-dot w-1.5 h-1.5 rounded-full bg-accent" style={{ animationDelay: "0.2s" }} />
            <span className="typing-dot w-1.5 h-1.5 rounded-full bg-accent" style={{ animationDelay: "0.4s" }} />
          </span>
        )}
      </div>

      {text ? (
        <div className="text-sm">
          <Markdown text={text} />
        </div>
      ) : (
        <div className="text-sm text-muted">Reviewing your run and updating your plan…</div>
      )}

      {done && (
        <div className="flex gap-3 mt-3 text-sm">
          <Link href="/plan" className="text-accent font-medium">View updated plan →</Link>
          <Link href="/coach" className="text-accent font-medium">Continue with coach →</Link>
        </div>
      )}
    </div>
  );
}
