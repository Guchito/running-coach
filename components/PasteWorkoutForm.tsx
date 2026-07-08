"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Card, Button } from "@/components/ui";
import {
  parseStrongText,
  exercisesVolumeKg,
  type ParsedStrongWorkout,
} from "@/lib/parseStrong";

// Paste box for the Strong app's "share as text" export. Parses locally as
// you type (so you see what will be saved before submitting), then posts to
// /api/gym/paste which matches it to the same day's gym session or creates
// a new one.

export function PasteWorkoutForm() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const preview: ParsedStrongWorkout | null = useMemo(() => {
    if (!text.trim()) return null;
    try {
      return parseStrongText(text);
    } catch {
      return null;
    }
  }, [text]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const res = await fetch("/api/gym/paste", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      });
      const data = await res.json();
      if (!res.ok)
        throw new Error(data.error || "Couldn't parse the pasted workout.");
      router.push(`/gym/${data.session.id}${data.merged ? "" : "?new=1"}`);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Couldn't parse the pasted workout.",
      );
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <div className="mt-6 flex items-center gap-3 text-sm text-muted">
        <span>Lifting? Copy your workout session and</span>
        <Button variant="ghost" onClick={() => setOpen(true)}>
          Paste it here
        </Button>
      </div>
    );
  }

  return (
    <Card className="p-5 mt-6 animate-in">
      <div className="flex items-center justify-between gap-3 mb-1">
        <h2 className="font-medium">Paste a gym workout</h2>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="text-muted hover:text-foreground text-lg leading-none"
          aria-label="Close paste workout"
        >
          ×
        </button>
      </div>
      <p className="text-sm text-muted mb-4">
        In Strong: open the workout → share → copy as text, then paste the whole
        thing here. It matches your watch session by date — no forms to fill in.
        Pasting the same workout again updates it.
      </p>

      <form onSubmit={submit} className="space-y-3">
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={8}
          placeholder={
            "Pull\nWednesday, 8 July 2026, 16:07\n\nDeadlift (Barbell)\nSet 1: 20 kg × 12\n…"
          }
          className="w-full rounded-lg border border-border bg-card px-3 py-2 text-sm font-mono outline-none transition-[border-color] duration-150 focus:border-accent resize-y"
        />

        {preview && (
          <div className="text-sm text-muted animate-in">
            <span className="text-foreground font-medium">{preview.title}</span>
            {" · "}
            {preview.startedAt.slice(0, 10)}
            {" · "}
            {preview.exercises.length} exercises,{" "}
            {preview.exercises.reduce((n, ex) => n + ex.sets.length, 0)} sets
            {exercisesVolumeKg(preview.exercises) > 0 &&
              ` · ${exercisesVolumeKg(preview.exercises).toLocaleString("en-GB")} kg total volume`}
          </div>
        )}

        {error && (
          <div className="animate-in text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-4 py-3">
            {error}
          </div>
        )}

        <div className="flex gap-2">
          <Button type="submit" disabled={busy || !text.trim()}>
            {busy ? "Saving…" : "Save workout"}
          </Button>
          <Button
            type="button"
            variant="ghost"
            onClick={() => setOpen(false)}
            disabled={busy}
          >
            Cancel
          </Button>
        </div>
      </form>
    </Card>
  );
}
