"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import type { NextWeekPlanStatus } from "@/lib/adherence";

// Mounted once in the root layout's notification stack. When the last planned
// session of the week is done — or the planned week has rolled over with no
// new plan — offers to have the coach build the next week. Clicking yes hands
// a prewritten prompt to the coach (via ?ask=, same as SyncNotifier); the
// plan is never generated silently. Declining is remembered per target week.
// `suppressed` hides the card while the sync card is showing — that card
// already bundles "analyze + plan the week" into one action, so this one is
// only the fallback (sync card dismissed, manual uploads, plan never built).
export function NextWeekPlanPrompt({
  authed,
  suppressed = false,
}: {
  authed: boolean;
  suppressed?: boolean;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [status, setStatus] = useState<NextWeekPlanStatus | null>(null);

  useEffect(() => {
    if (!authed) return;
    let cancelled = false;

    async function check() {
      try {
        const res = await fetch("/api/plan/next-week");
        const d = await res.json();
        if (cancelled) return;
        const s: NextWeekPlanStatus | null = d?.status ?? null;
        // Honor an earlier "not now" for this same target week.
        if (s && localStorage.getItem(dismissKey(s))) setStatus(null);
        else setStatus(s);
      } catch {
        /* silent — this is a nudge, never worth an error */
      }
    }

    // Re-check on every navigation (an upload/sync just changed the data) and
    // periodically while the app stays open.
    check();
    const iv = setInterval(check, 5 * 60 * 1000);
    return () => {
      cancelled = true;
      clearInterval(iv);
    };
  }, [authed, pathname]);

  if (!authed || suppressed || !status || pathname === "/coach") return null;

  function dismissKey(s: NextWeekPlanStatus) {
    return `planPromptDismissed:${s.targetWeekStart}`;
  }

  function dismiss() {
    if (status) localStorage.setItem(dismissKey(status), "1");
    setStatus(null);
  }

  function planIt() {
    if (!status) return;
    localStorage.setItem(dismissKey(status), "1");
    setStatus(null);
    const ask =
      status.reason === "complete"
        ? `I've completed all ${status.plannedCount} planned sessions this week — please build my training plan for next week (the week starting ${status.targetWeekStart}).`
        : `My weekly plan (week of ${status.planWeekStart}) is over. Please build my plan for this week (the week starting ${status.targetWeekStart}).`;
    router.push(`/coach?ask=${encodeURIComponent(ask)}`);
  }

  const complete = status.reason === "complete";
  return (
    <div className="pointer-events-auto rounded-2xl border border-border bg-card shadow-lg p-4 animate-in">
      <div className="flex items-start gap-3">
        <span className="grid place-items-center w-9 h-9 shrink-0 rounded-full bg-accent text-white">
          📅
        </span>
        <div className="min-w-0 flex-1">
          <div className="font-medium text-sm">
            {complete ? "Training week complete 🎉" : "Time for a new plan"}
          </div>
          <div className="text-xs text-muted">
            {complete
              ? `All ${status.plannedCount} planned sessions done. Want the coach to plan next week?`
              : `Your plan for the week of ${status.planWeekStart} has ended. Want the coach to plan this week?`}
          </div>
        </div>
        <button
          onClick={dismiss}
          aria-label="Dismiss"
          className="shrink-0 text-muted hover:text-foreground text-lg leading-none -mt-1"
        >
          ×
        </button>
      </div>
      <button
        onClick={planIt}
        className="mt-3 w-full rounded-full bg-accent text-white px-3 py-2 text-sm font-medium hover:bg-accent/90"
      >
        📅 Yes — plan {complete ? "next" : "this"} week
      </button>
    </div>
  );
}
