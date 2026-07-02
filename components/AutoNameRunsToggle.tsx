"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Card } from "@/components/ui";

// Toggle: when on, the coach renames a run with a fitting name after it analyzes
// it (see the auto-naming instruction added to the system prompt in /api/chat).
export function AutoNameRunsToggle({ initial }: { initial: boolean }) {
  const router = useRouter();
  const [on, setOn] = useState(initial);
  const [busy, setBusy] = useState(false);

  async function toggle() {
    const next = !on;
    setOn(next); // optimistic
    setBusy(true);
    try {
      const res = await fetch("/api/auto-name-runs", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled: next }),
      });
      if (!res.ok) throw new Error();
      router.refresh();
    } catch {
      setOn(!next); // revert on failure
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="p-5 flex items-start justify-between gap-4">
      <div className="min-w-0">
        <div className="font-medium">Auto-name runs</div>
        <p className="text-sm text-muted mt-1">
          Have the coach give each run a fitting name (e.g. “Tempo 6×800m”, “Long run 24K”) right
          after it analyzes it.
        </p>
      </div>
      <button
        role="switch"
        aria-checked={on}
        aria-label="Auto-name runs"
        onClick={toggle}
        disabled={busy}
        className={`relative shrink-0 w-11 h-6 rounded-full transition-colors disabled:opacity-50 ${
          on ? "bg-accent" : "bg-black/15"
        }`}
      >
        <span
          className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${
            on ? "translate-x-5" : "translate-x-0"
          }`}
        />
      </button>
    </Card>
  );
}
