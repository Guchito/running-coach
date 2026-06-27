"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Card, Button } from "@/components/ui";

// User-written general instructions for the training plan. The runner edits these
// here; the coach reads them on every chat and can update them via set_plan_instructions.
export function PlanInstructions({ initial }: { initial: string | null }) {
  const router = useRouter();
  const saved = initial ?? "";
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(saved);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/plan", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ instructions: draft }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => null))?.error ?? "Failed to save");
      setEditing(false);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="p-6">
      <div className="flex items-center justify-between mb-1">
        <h2 className="font-semibold text-lg">Instructions for your coach</h2>
        {!editing && (
          <button
            onClick={() => {
              setDraft(saved);
              setEditing(true);
            }}
            className="text-sm text-accent hover:underline"
          >
            {saved ? "Edit" : "Add"}
          </button>
        )}
      </div>
      <p className="text-xs text-muted mb-4">
        Standing guidance your coach always respects when building and updating your plan — e.g.
        &ldquo;no running on Mondays&rdquo;, &ldquo;keep one full rest day&rdquo;, &ldquo;prioritise the marathon&rdquo;.
      </p>

      {editing ? (
        <div className="space-y-3">
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            rows={5}
            autoFocus
            placeholder="Write any general instructions for your training plan…"
            className="w-full rounded-lg border border-border bg-card p-3 text-sm outline-none focus:border-accent resize-y"
          />
          {error && <p className="text-sm text-red-600">{error}</p>}
          <div className="flex gap-2">
            <Button onClick={save} disabled={busy}>
              {busy ? "Saving…" : "Save"}
            </Button>
            <Button variant="ghost" onClick={() => setEditing(false)} disabled={busy}>
              Cancel
            </Button>
          </div>
        </div>
      ) : saved ? (
        <p className="text-sm whitespace-pre-wrap">{saved}</p>
      ) : (
        <p className="text-sm text-muted/80 italic">No instructions yet.</p>
      )}
    </Card>
  );
}
