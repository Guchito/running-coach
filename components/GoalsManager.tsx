"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Card, Button } from "@/components/ui";
import { formatDuration, formatDistance, formatDate } from "@/lib/parseRun";
import { daysUntil } from "@/lib/stats";
import type { Goal, GoalStatus } from "@/lib/types";

// "in 34 days" / "today" / "12 days ago" for a goal's target date.
function countdownLabel(dateStr: string | null): string | null {
  const d = daysUntil(dateStr);
  if (d == null) return null;
  if (d === 0) return "today";
  if (d > 0) return `in ${d} day${d === 1 ? "" : "s"}`;
  return `${-d} day${d === -1 ? "" : "s"} ago`;
}

const PRESETS: Record<string, number | null> = {
  "5K": 5000,
  "10K": 10000,
  "Half Marathon": 21097,
  Marathon: 42195,
  Custom: null,
};

function secToHMS(sec: number | null): string {
  if (!sec) return "";
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = Math.round(sec % 60);
  if (h > 0)
    return `${h}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  return `${m}:${s.toString().padStart(2, "0")}`;
}
function hmsToSec(str: string): number | null {
  const t = str.trim();
  if (!t) return null;
  const parts = t.split(":").map(Number);
  if (parts.some((n) => !Number.isFinite(n))) return null;
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  return parts[0] * 60;
}

const STATUS_LABEL: Record<GoalStatus, string> = {
  active: "Active",
  achieved: "Achieved 🎉",
  abandoned: "Dropped",
};

export type RaceRunOption = {
  id: number;
  name: string;
  startedAt: string;
  durationSec: number;
  distanceM: number;
};

export function GoalsManager({
  initial,
  runs = [],
}: {
  initial: Goal[];
  runs?: RaceRunOption[];
}) {
  const router = useRouter();
  const [editing, setEditing] = useState<Goal | "new" | null>(
    initial.length === 0 ? "new" : null,
  );
  // Goal id whose "which run was the race?" picker is open.
  const [marking, setMarking] = useState<number | null>(null);

  async function remove(g: Goal) {
    if (!confirm(`Delete goal "${g.title}"?`)) return;
    await fetch(`/api/goals/${g.id}`, { method: "DELETE" });
    router.refresh();
  }
  async function setStatus(g: Goal, status: GoalStatus) {
    await fetch(`/api/goals/${g.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...g, status }),
    });
    router.refresh();
  }
  async function markRaced(g: Goal, runId: number) {
    await fetch(`/api/goals/${g.id}/result`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ runId }),
    });
    setMarking(null);
    router.refresh();
  }
  async function clearResult(g: Goal) {
    if (!confirm(`Remove the recorded race result for "${g.title}"?`)) return;
    await fetch(`/api/goals/${g.id}/result`, { method: "DELETE" });
    router.refresh();
  }

  return (
    <div className="space-y-4">
      {initial.map((g) =>
        editing !== null && editing !== "new" && editing.id === g.id ? (
          <GoalForm
            key={g.id}
            initial={g}
            onClose={() => setEditing(null)}
            onSaved={() => {
              setEditing(null);
              router.refresh();
            }}
          />
        ) : (
          <Card key={g.id} className="p-5">
            <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <h3 className="font-semibold">{g.title}</h3>
                  <span
                    className={`text-xs px-2 py-0.5 rounded-full ${
                      g.status === "active"
                        ? "bg-accent-soft text-accent"
                        : g.status === "achieved"
                          ? "bg-good/10 text-good"
                          : "bg-black/5 text-muted"
                    }`}
                  >
                    {STATUS_LABEL[g.status]}
                  </span>
                </div>
                <div className="text-sm text-muted mt-1">
                  {g.raceType}
                  {g.targetTimeSec
                    ? ` · target ${formatDuration(g.targetTimeSec)}`
                    : ""}
                  {g.targetDistanceM
                    ? ` · ${formatDistance(g.targetDistanceM)}`
                    : ""}
                </div>
                {g.notes && (
                  <p className="text-sm text-muted mt-2">{g.notes}</p>
                )}
              </div>
              <div className="flex flex-col items-start md:items-end gap-2 shrink-0 text-sm w-full md:w-auto">
                <div className="flex items-center gap-4 flex-wrap">
                  <span className="text-sm whitespace-nowrap">
                    {g.targetDate ? (
                      <>
                        <span className="font-medium">
                          {formatDate(g.targetDate)}
                        </span>
                        {countdownLabel(g.targetDate) && (
                          <span className="text-muted">
                            {" "}
                            · {countdownLabel(g.targetDate)}
                          </span>
                        )}
                      </>
                    ) : (
                      <span className="text-muted">No date set</span>
                    )}
                  </span>
                  <div className="flex gap-3">
                    <button
                      onClick={() => setEditing(g)}
                      className="text-accent hover:underline"
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => remove(g)}
                      className="text-muted hover:text-red-600"
                    >
                      Delete
                    </button>
                  </div>
                </div>
                <select
                  value={g.status}
                  onChange={(e) => setStatus(g, e.target.value as GoalStatus)}
                  className="text-xs border border-border rounded-md px-2 py-1 bg-card text-muted"
                >
                  <option value="active">Active</option>
                  <option value="achieved">Achieved</option>
                  <option value="abandoned">Dropped</option>
                </select>
              </div>
            </div>

            {/* Race result: shown once a run is confirmed as the race, else a
                manual "mark as race result" fallback for the coach flow. */}
            {g.resultTimeSec != null ? (
              <div className="mt-4 rounded-lg bg-good/10 px-3 py-2 text-sm flex items-center justify-between gap-3">
                <span>
                  Raced {g.racedOn ? formatDate(g.racedOn) : ""} ·{" "}
                  <strong className="tabular-nums">
                    {formatDuration(g.resultTimeSec)}
                  </strong>
                  {g.targetTimeSec && (
                    <span className="text-muted">
                      {" · "}
                      {g.resultTimeSec <= g.targetTimeSec
                        ? `beat target by ${formatDuration(g.targetTimeSec - g.resultTimeSec)}`
                        : `${formatDuration(g.resultTimeSec - g.targetTimeSec)} off target`}
                    </span>
                  )}
                </span>
                <button
                  onClick={() => clearResult(g)}
                  className="text-muted hover:text-red-600 shrink-0"
                >
                  Clear
                </button>
              </div>
            ) : marking === g.id ? (
              <div className="mt-4 flex flex-wrap items-center gap-2 text-sm">
                <span className="text-muted">Which run was this race?</span>
                <select
                  defaultValue=""
                  onChange={(e) =>
                    e.target.value && markRaced(g, Number(e.target.value))
                  }
                  className="text-sm border border-border rounded-md px-2 py-1 bg-card max-w-full"
                >
                  <option value="" disabled>
                    Pick a run…
                  </option>
                  {runs.map((r) => (
                    <option key={r.id} value={r.id}>
                      {formatDate(r.startedAt)} · {r.name} ·{" "}
                      {formatDistance(r.distanceM)} ·{" "}
                      {formatDuration(r.durationSec)}
                    </option>
                  ))}
                </select>
                <button
                  onClick={() => setMarking(null)}
                  className="text-muted hover:underline"
                >
                  Cancel
                </button>
              </div>
            ) : (
              runs.length > 0 && (
                <button
                  onClick={() => setMarking(g.id)}
                  className="mt-4 text-sm text-accent hover:underline"
                >
                  Mark as race result
                </button>
              )
            )}
          </Card>
        ),
      )}

      {editing === "new" ? (
        <GoalForm
          initial={null}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            router.refresh();
          }}
        />
      ) : (
        <Button variant="soft" onClick={() => setEditing("new")}>
          + Add a goal
        </Button>
      )}
    </div>
  );
}

function GoalForm({
  initial,
  onClose,
  onSaved,
}: {
  initial: Goal | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [title, setTitle] = useState(initial?.title ?? "");
  const [raceType, setRaceType] = useState(initial?.raceType ?? "10K");
  const [customKm, setCustomKm] = useState(
    initial?.raceType === "Custom" && initial?.targetDistanceM
      ? (initial.targetDistanceM / 1000).toString()
      : "",
  );
  const [targetTime, setTargetTime] = useState(
    secToHMS(initial?.targetTimeSec ?? null),
  );
  const [targetDate, setTargetDate] = useState(initial?.targetDate ?? "");
  const [notes, setNotes] = useState(initial?.notes ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) return setError("Give your goal a title.");
    setError(null);
    setBusy(true);
    const targetDistanceM =
      raceType === "Custom"
        ? customKm
          ? Number(customKm) * 1000
          : null
        : PRESETS[raceType];
    const payload = {
      title: title.trim(),
      raceType,
      targetDistanceM,
      targetTimeSec: hmsToSec(targetTime),
      targetDate: targetDate || null,
      notes: notes.trim() || null,
      status: initial?.status ?? "active",
    };
    try {
      const res = await fetch(
        initial ? `/api/goals/${initial.id}` : "/api/goals",
        {
          method: initial ? "PUT" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        },
      );
      if (!res.ok)
        throw new Error((await res.json()).error || "Could not save goal.");
      onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save goal.");
      setBusy(false);
    }
  }

  const inputCls =
    "mt-1 w-full rounded-lg border border-border px-3 py-2 text-sm outline-none focus:border-accent bg-card";

  return (
    <Card className="p-5 border-accent/40">
      <form onSubmit={save} className="space-y-4">
        <div className="font-medium">{initial ? "Edit goal" : "New goal"}</div>
        <label className="block text-sm">
          <span className="text-muted">Goal title</span>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g. Sub-1:30 Half Marathon"
            className={inputCls}
          />
        </label>
        <div className="grid grid-cols-2 gap-4">
          <label className="block text-sm">
            <span className="text-muted">Race type</span>
            <select
              value={raceType}
              onChange={(e) => setRaceType(e.target.value)}
              className={inputCls}
            >
              {Object.keys(PRESETS).map((k) => (
                <option key={k} value={k}>
                  {k}
                </option>
              ))}
            </select>
          </label>
          {raceType === "Custom" && (
            <label className="block text-sm">
              <span className="text-muted">Distance (km)</span>
              <input
                value={customKm}
                onChange={(e) => setCustomKm(e.target.value)}
                type="number"
                step="0.1"
                placeholder="15"
                className={inputCls}
              />
            </label>
          )}
        </div>
        <div className="grid grid-cols-2 gap-4">
          <label className="block text-sm">
            <span className="text-muted">Target time (optional)</span>
            <input
              value={targetTime}
              onChange={(e) => setTargetTime(e.target.value)}
              placeholder="mm:ss or h:mm:ss"
              className={inputCls}
            />
          </label>
          <label className="block text-sm">
            <span className="text-muted">Target date (optional)</span>
            <input
              type="date"
              value={targetDate}
              onChange={(e) => setTargetDate(e.target.value)}
              className={inputCls}
            />
          </label>
        </div>
        <label className="block text-sm">
          <span className="text-muted">Notes for your coach (optional)</span>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={2}
            placeholder="e.g. Coming back from injury, can train 4 days/week…"
            className={inputCls}
          />
        </label>
        {error && <div className="text-sm text-red-600">{error}</div>}
        <div className="flex items-center gap-2">
          <Button disabled={busy}>
            {busy ? "Saving…" : initial ? "Save changes" : "Add goal"}
          </Button>
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancel
          </Button>
        </div>
      </form>
    </Card>
  );
}
