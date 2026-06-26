"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Card, Button } from "@/components/ui";
import type { Goal } from "@/lib/types";

const PRESETS: Record<string, number | null> = {
  "5K": 5000,
  "10K": 10000,
  "Half Marathon": 21097,
  "Marathon": 42195,
  "Custom": null,
};

function secToHMS(sec: number | null): string {
  if (!sec) return "";
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = Math.round(sec % 60);
  if (h > 0) return `${h}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function hmsToSec(str: string): number | null {
  const t = str.trim();
  if (!t) return null;
  const parts = t.split(":").map((p) => Number(p));
  if (parts.some((n) => !Number.isFinite(n))) return null;
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  if (parts.length === 1) return parts[0] * 60;
  return null;
}

export function GoalForm({ initial }: { initial: Goal | null }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [title, setTitle] = useState(initial?.title ?? "");
  const [raceType, setRaceType] = useState(initial?.raceType ?? "5K");
  const [customKm, setCustomKm] = useState(
    initial && initial.raceType === "Custom" && initial.targetDistanceM
      ? (initial.targetDistanceM / 1000).toString()
      : ""
  );
  const [targetTime, setTargetTime] = useState(secToHMS(initial?.targetTimeSec ?? null));
  const [targetDate, setTargetDate] = useState(initial?.targetDate ?? "");
  const [notes, setNotes] = useState(initial?.notes ?? "");

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!title.trim()) {
      setError("Give your goal a title.");
      return;
    }
    const targetDistanceM =
      raceType === "Custom" ? (customKm ? Number(customKm) * 1000 : null) : PRESETS[raceType];

    setBusy(true);
    setSaved(false);
    try {
      const res = await fetch("/api/goal", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: title.trim(),
          raceType,
          targetDistanceM,
          targetTimeSec: hmsToSec(targetTime),
          targetDate: targetDate || null,
          notes: notes.trim() || null,
        }),
      });
      if (!res.ok) {
        const d = await res.json();
        throw new Error(d.error || "Could not save goal.");
      }
      setSaved(true);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save goal.");
    } finally {
      setBusy(false);
    }
  }

  const inputCls =
    "mt-1 w-full rounded-lg border border-border px-3 py-2 text-sm outline-none focus:border-accent bg-card";

  return (
    <Card className="p-6">
      <form onSubmit={save} className="space-y-4 max-w-xl">
        <label className="block text-sm">
          <span className="text-muted">Goal title</span>
          <input value={title} onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g. Run a sub-50 10K" className={inputCls} />
        </label>

        <div className="grid grid-cols-2 gap-4">
          <label className="block text-sm">
            <span className="text-muted">Race type</span>
            <select value={raceType} onChange={(e) => setRaceType(e.target.value)} className={inputCls}>
              {Object.keys(PRESETS).map((k) => (
                <option key={k} value={k}>{k}</option>
              ))}
            </select>
          </label>
          {raceType === "Custom" && (
            <label className="block text-sm">
              <span className="text-muted">Distance (km)</span>
              <input value={customKm} onChange={(e) => setCustomKm(e.target.value)}
                type="number" step="0.1" placeholder="e.g. 15" className={inputCls} />
            </label>
          )}
        </div>

        <div className="grid grid-cols-2 gap-4">
          <label className="block text-sm">
            <span className="text-muted">Target time (optional)</span>
            <input value={targetTime} onChange={(e) => setTargetTime(e.target.value)}
              placeholder="mm:ss or h:mm:ss" className={inputCls} />
          </label>
          <label className="block text-sm">
            <span className="text-muted">Target date (optional)</span>
            <input type="date" value={targetDate} onChange={(e) => setTargetDate(e.target.value)} className={inputCls} />
          </label>
        </div>

        <label className="block text-sm">
          <span className="text-muted">Notes for your coach (optional)</span>
          <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3}
            placeholder="e.g. Coming back from a calf injury, can train 4 days/week, prefer morning runs…"
            className={inputCls} />
        </label>

        {error && <div className="text-sm text-red-600">{error}</div>}
        <div className="flex items-center gap-3">
          <Button disabled={busy}>{busy ? "Saving…" : "Save goal"}</Button>
          {saved && <span className="text-sm text-good">✓ Saved</span>}
        </div>
      </form>
    </Card>
  );
}
