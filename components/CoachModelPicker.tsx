"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { COACH_MODELS } from "@/lib/coachDefs";

// Compact model switcher for the Coach page header: a names-only dropdown plus a
// link to Settings to read the full descriptions. Claude models only appear when
// the runner has saved their own Anthropic API key (they're paid). Saving is
// immediate — the choice persists the same way the Settings radios do.
export function CoachModelPicker({
  initialModel,
  hasAnthropicKey,
}: {
  initialModel: string;
  hasAnthropicKey: boolean;
}) {
  const router = useRouter();
  // Hide Claude (paid) models unless a key is set.
  const options = COACH_MODELS.filter((m) => hasAnthropicKey || m.provider !== "anthropic");
  // If the saved model isn't selectable (e.g. a Claude model after the key was
  // removed), fall back to the first available option for display.
  const initialVisible = options.some((m) => m.id === initialModel)
    ? initialModel
    : options[0]?.id ?? initialModel;

  const [model, setModel] = useState(initialVisible);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);

  async function change(next: string) {
    const prev = model;
    setModel(next);
    setBusy(true);
    setError(false);
    try {
      const res = await fetch("/api/coach-model", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ model: next }),
      });
      if (!res.ok) throw new Error();
      router.refresh();
    } catch {
      setModel(prev); // revert on failure
      setError(true);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex items-center gap-2 text-xs text-muted">
      <div className="relative">
        <select
          value={model}
          disabled={busy}
          onChange={(e) => change(e.target.value)}
          className="appearance-none bg-transparent border border-border rounded-lg pl-2 pr-6 py-1 text-xs font-medium text-foreground outline-none cursor-pointer hover:border-accent focus:border-accent disabled:opacity-50"
          aria-label="Coach model"
        >
          {options.map((m) => (
            <option key={m.id} value={m.id}>
              {m.label}
            </option>
          ))}
        </select>
        <svg
          className="pointer-events-none absolute right-1.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
          strokeWidth={2}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </div>
      <a href="/settings" className="text-accent hover:underline whitespace-nowrap">
        View more
      </a>
      {error && <span className="text-red-600">Couldn&apos;t switch</span>}
    </div>
  );
}
