"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";

type Imported = { id: number; name: string; kind?: "run" | "gym" };

// Mounted once in the root layout so it works on any page. Periodically syncs
// from Google Drive (the server throttles, so this is cheap) and, when a new
// session lands, pops a dismissible overlay offering coach analysis. Analysis is
// never automatic — tapping the button hands the run to the coach (via ?ask=).
export function SyncNotifier({ authed }: { authed: boolean }) {
  const router = useRouter();
  const pathname = usePathname();
  const [imported, setImported] = useState<Imported[]>([]);
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

  if (!authed || dismissed || imported.length === 0) return null;
  // Already in the coach — the overlay would be redundant.
  if (pathname === "/coach") return null;

  const one = imported.length === 1;
  const names = imported.map((r) => `"${r.name}"`).join(", ");
  const prompt =
    `I just synced ${one ? "a new run" : "new runs"} from Google Drive: ${names}. ` +
    `Please analyze ${one ? "it" : "them"} and tell me how it went. ` +
    `Update my weekly and macro plan if this changes anything, and if it was a race or ` +
    `affects my goals, tell me what you'd recommend.`;

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
    <div className="fixed z-40 inset-x-4 top-16 md:inset-x-auto md:top-auto md:right-6 md:bottom-6 md:max-w-sm">
      <div
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
        style={{
          transform: dragX ? `translateX(${dragX}px)` : undefined,
          opacity: dragX ? Math.max(0, 1 + dragX / 150) : undefined,
        }}
        className={`rounded-2xl border border-border bg-card shadow-lg p-4 animate-in touch-pan-y ${
          dragging ? "" : "transition-transform duration-200"
        }`}
      >
        <div className="flex items-start gap-3">
          <span className="grid place-items-center w-9 h-9 shrink-0 rounded-full bg-accent text-white">
            🏁
          </span>
          <div className="min-w-0 flex-1">
            <div className="font-medium text-sm">
              {one ? "New run synced" : `${imported.length} new runs synced`}
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
          className="mt-3 w-full rounded-full bg-accent text-white px-3 py-2 text-sm font-medium hover:bg-accent/90"
        >
          🏃 Have the coach analyze {one ? "it" : "them"}
        </button>
      </div>
    </div>
  );
}
