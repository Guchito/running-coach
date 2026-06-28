"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Card, Button } from "@/components/ui";
import { COACH_MODELS } from "@/lib/coachDefs";

// Lets the runner choose which model powers the coach (Claude or a free model).
// Claude models are paid and require the runner's own Anthropic API key, so they
// are locked until a key is saved (see the key form below this one in Settings).
export function CoachModelForm({
  initial,
  hasAnthropicKey,
}: {
  initial: string;
  hasAnthropicKey: boolean;
}) {
  const router = useRouter();
  const [model, setModel] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setBusy(true);
    setSaved(false);
    setError(null);
    try {
      const res = await fetch("/api/coach-model", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ model }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => null))?.error ?? "Failed to save");
      setSaved(true);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="p-6">
      <div className="space-y-3">
        {COACH_MODELS.map((m) => {
          // Claude models need the runner's own key; lock them until one is set.
          const locked = m.provider === "anthropic" && !hasAnthropicKey;
          return (
            <label
              key={m.id}
              className={`flex gap-3 rounded-xl border p-3 transition-colors ${
                locked
                  ? "border-border opacity-50 cursor-not-allowed"
                  : model === m.id
                  ? "border-accent bg-accent-soft cursor-pointer"
                  : "border-border hover:bg-black/5 cursor-pointer"
              }`}
            >
              <input
                type="radio"
                name="coach-model"
                value={m.id}
                checked={model === m.id}
                disabled={locked}
                onChange={() => {
                  setModel(m.id);
                  setSaved(false);
                }}
                className="mt-1 accent-accent"
              />
              <div>
                <div className="font-medium">{m.label}</div>
                <div className="text-sm text-muted">{m.blurb}</div>
                {locked && (
                  <div className="text-sm text-amber-600 mt-1">
                    Add your Anthropic API key below to unlock this model.
                  </div>
                )}
              </div>
            </label>
          );
        })}
      </div>

      {error && <p className="text-sm text-red-600 mt-3">{error}</p>}

      <div className="flex items-center gap-3 mt-4">
        <Button onClick={save} disabled={busy || model === initial}>
          {busy ? "Saving…" : "Save"}
        </Button>
        {saved && <span className="text-sm text-muted">Saved</span>}
      </div>
    </Card>
  );
}
