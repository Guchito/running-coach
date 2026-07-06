"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import type { NextWeekPlanStatus } from "@/lib/adherence";

type Imported = { id: number; name: string; kind?: "run" | "gym" };

// Mounted once in the root layout's notification stack so it works on any
// page. Periodically syncs from Google Drive (the server throttles, so this is
// cheap) and, when a new session lands, pops a dismissible card offering coach
// analysis. Analysis is never automatic — tapping the button hands the run to
// the coach (via ?ask=). If the synced session completes the planned week (or
// the plan's week is already over), the same action also asks the coach to
// build the coming week's plan — analysis first, then the plan.
export function SyncNotifier({
  authed,
  onVisibleChange,
}: {
  authed: boolean;
  onVisibleChange?: (visible: boolean) => void;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [imported, setImported] = useState<Imported[]>([]);
  const [weekStatus, setWeekStatus] = useState<NextWeekPlanStatus | null>(null);
  const [dismissed, setDismissed] = useState(false);
  const startedRef = useRef(false);
  // Swipe-to-dismiss (mobile): track horizontal drag on the card.
  const [dragX, setDragX] = useState(0);
  const [dragging, setDragging] = useState(false);
  const dragStartX = useRef(0);

  useEffect(() => {
    if (!authed || startedRef.current) return;
    startedRef.current = true;
    let cancelled = false;

    async function sync() {
      try {
        const res = await fetch("/api/drive/sync", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ force: false }),
        });
        const d = await res.json();
        if (!cancelled && d?.imported?.length) {
          setImported(d.imported);
          setDismissed(false);
          setDragX(0);
          // Did this batch complete the planned week (or is the plan's week
          // already over)? Then the analyze action also requests next week's plan.
          try {
            const ws = await (await fetch("/api/plan/next-week")).json();
            if (!cancelled) setWeekStatus(ws?.status ?? null);
          } catch {
            /* fall back to plain analysis */
          }
          router.refresh(); // update whatever page is showing
        }
      } catch {
        /* silent — Drive sync is best-effort */
      }
    }

    sync();
    // Keep catching new syncs while the app stays open (server throttles ~5 min).
    const iv = setInterval(sync, 5 * 60 * 1000);
    return () => {
      cancelled = true;
      clearInterval(iv);
    };
  }, [authed, router]);

  // The card shows everywhere except the coach page (redundant there). Report
  // visibility up so the stack can hide the standalone plan prompt meanwhile.
  const visible = authed && !dismissed && imported.length > 0 && pathname !== "/coach";
  useEffect(() => {
    onVisibleChange?.(visible);
  }, [visible, onVisibleChange]);
  if (!visible) return null;

  const one = imported.length === 1;
  const names = imported.map((r) => `"${r.name}"`).join(", ");
  // Analysis always comes first; the plan request rides along when due.
  const planTail = weekStatus
    ? weekStatus.reason === "complete"
      ? ` That completes all my planned sessions for this week — after the analysis, please build my training plan for next week (the week starting ${weekStatus.targetWeekStart}).`
      : ` My weekly plan (week of ${weekStatus.planWeekStart}) is over — after the analysis, please build my plan for this week (the week starting ${weekStatus.targetWeekStart}).`
    : "";
  const prompt =
    `I just synced ${one ? "a new run" : "new runs"} from Google Drive: ${names}. ` +
    `Please analyze ${one ? "it" : "them"} and tell me how it went. ` +
    `Update my weekly and macro plan if this changes anything, and if it was a race or ` +
    `affects my goals, tell me what you'd recommend.` +
    planTail;

  function analyze() {
    setDismissed(true);
    // Fire server-side auto-naming (no-op if the toggle is off) for each synced
    // run before handing the analysis to the coach. Skip gym ids — they'd map to
    // a different table on the runs endpoint.
    for (const r of imported) {
      if (r.kind !== "gym") {
        fetch(`/api/runs/${r.id}/autoname`, { method: "POST" }).catch(() => {});
      }
    }
    router.push(`/coach?ask=${encodeURIComponent(prompt)}`);
  }

  function onTouchStart(e: React.TouchEvent) {
    dragStartX.current = e.touches[0].clientX;
    setDragging(true);
  }
  function onTouchMove(e: React.TouchEvent) {
    // Only follow leftward drags.
    setDragX(Math.min(0, e.touches[0].clientX - dragStartX.current));
  }
  function onTouchEnd() {
    setDragging(false);
    if (dragX < -60) setDismissed(true); // swiped far enough left → dismiss
    else setDragX(0); // spring back
  }

  return (
    <div
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}
      style={{
        transform: dragX ? `translateX(${dragX}px)` : undefined,
        opacity: dragX ? Math.max(0, 1 + dragX / 150) : undefined,
      }}
      className={`pointer-events-auto rounded-2xl border border-border bg-card shadow-lg p-4 animate-in touch-pan-y ${
        dragging ? "" : "transition-transform duration-200"
      }`}
    >
      <div className="flex items-start gap-3">
        <span className="grid place-items-center w-9 h-9 shrink-0 rounded-full bg-ink text-white">
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.8}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 21V4m0 0h13l-2.5 4L18 12H5" />
          </svg>
        </span>
        <div className="min-w-0 flex-1">
          <div className="font-medium text-sm">
            {one ? "New run synced" : `${imported.length} new runs synced`}
            {weekStatus?.reason === "complete" ? " · week complete 🎉" : ""}
          </div>
          <div className="text-xs text-muted truncate">
            {imported.map((r) => r.name).join(", ")}
          </div>
        </div>
        <button
          onClick={() => setDismissed(true)}
          aria-label="Dismiss"
          className="shrink-0 text-muted hover:text-foreground text-lg leading-none -mt-1"
        >
          ×
        </button>
      </div>
      <button
        onClick={analyze}
        className="mt-3 w-full rounded-full bg-ink text-white px-3 py-2 text-sm font-medium hover:bg-black transition-[background-color,transform] duration-150 ease-out active:scale-[0.98]"
      >
        {weekStatus
          ? `Analyze + plan ${weekStatus.reason === "complete" ? "next" : "this"} week`
          : `Have the coach analyze ${one ? "it" : "them"}`}
      </button>
    </div>
  );
}
