"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Card } from "@/components/ui";
import { DeleteRunButton } from "@/components/DeleteRunButton";
import { DeleteGymButton } from "@/components/DeleteGymButton";
import { SessionCalendar } from "@/components/SessionCalendar";
import { SessionBadge } from "@/components/SessionIcon";
import type { SessionLite } from "@/lib/sessionMeta";

// "4:30" or "4" (minutes) → seconds. Empty/invalid → null.
function parsePace(v: string): number | null {
  const t = v.trim();
  if (!t) return null;
  if (t.includes(":")) {
    const [m, s] = t.split(":");
    const mm = Number(m);
    const ss = Number(s || 0);
    if (Number.isNaN(mm) || Number.isNaN(ss)) return null;
    return mm * 60 + ss;
  }
  const n = Number(t);
  return Number.isNaN(n) ? null : Math.round(n * 60);
}

function chipCls(active: boolean): string {
  return `inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm transition-[background-color,border-color,color,transform] duration-150 ease-out active:scale-[0.96] ${
    active
      ? "border-accent bg-accent-soft text-accent"
      : "border-border text-foreground/70 hover:bg-black/4"
  }`;
}

const numCls =
  "w-16 rounded-lg border border-border px-2 py-1 text-sm outline-none focus:border-accent";

export function SessionHistory({ sessions }: { sessions: SessionLite[] }) {
  const [type, setType] = useState("all"); // "all" | "run" | gym type
  const [minKm, setMinKm] = useState("");
  const [maxKm, setMaxKm] = useState("");
  const [minPace, setMinPace] = useState("");
  const [maxPace, setMaxPace] = useState("");

  // Distinct session types present, in first-seen order, for the filter chips.
  const types = useMemo(() => {
    const seen = new Map<
      string,
      { key: string; label: string; color: string; kind: "run" | "gym" }
    >();
    for (const s of sessions) {
      const key = s.kind === "run" ? "run" : s.type;
      if (!seen.has(key))
        seen.set(key, {
          key,
          label: s.typeLabel,
          color: s.color,
          kind: s.kind,
        });
    }
    return Array.from(seen.values());
  }, [sessions]);

  const isRun = type === "run";

  const filtered = useMemo(() => {
    const minP = parsePace(minPace);
    const maxP = parsePace(maxPace);
    const minD = minKm ? Number(minKm) : null;
    const maxD = maxKm ? Number(maxKm) : null;
    return sessions.filter((s) => {
      if (type !== "all") {
        const key = s.kind === "run" ? "run" : s.type;
        if (key !== type) return false;
      }
      if (isRun) {
        const km = (s.distanceM ?? 0) / 1000;
        if (minD != null && km < minD) return false;
        if (maxD != null && km > maxD) return false;
        const pace = s.paceSecPerKm ?? 0;
        if (minP != null && pace < minP) return false;
        if (maxP != null && pace > maxP) return false;
      }
      return true;
    });
  }, [sessions, type, isRun, minKm, maxKm, minPace, maxPace]);

  return (
    <div className="space-y-6">
      <SessionCalendar sessions={sessions} />

      {/* Filters */}
      <div className="space-y-3">
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => setType("all")}
            className={chipCls(type === "all")}
          >
            All
          </button>
          {types.map((t) => (
            <button
              key={t.key}
              onClick={() => setType(t.key)}
              className={chipCls(type === t.key)}
            >
              <SessionBadge
                s={{
                  kind: t.kind,
                  color: t.color,
                  typeLabel: t.label,
                  name: t.label,
                }}
              />
              {t.label}
            </button>
          ))}
        </div>

        {isRun && (
          <div className="flex flex-wrap items-end gap-x-5 gap-y-2">
            <div>
              <div className="text-xs text-muted mb-1">Distance (km)</div>
              <div className="flex items-center gap-1.5">
                <input
                  type="number"
                  min="0"
                  step="0.5"
                  value={minKm}
                  onChange={(e) => setMinKm(e.target.value)}
                  placeholder="min"
                  className={numCls}
                />
                <span className="text-muted">–</span>
                <input
                  type="number"
                  min="0"
                  step="0.5"
                  value={maxKm}
                  onChange={(e) => setMaxKm(e.target.value)}
                  placeholder="max"
                  className={numCls}
                />
              </div>
            </div>
            <div>
              <div className="text-xs text-muted mb-1">Pace /km (mm:ss)</div>
              <div className="flex items-center gap-1.5">
                <input
                  type="text"
                  inputMode="numeric"
                  value={minPace}
                  onChange={(e) => setMinPace(e.target.value)}
                  placeholder="4:00"
                  className={numCls}
                />
                <span className="text-muted">–</span>
                <input
                  type="text"
                  inputMode="numeric"
                  value={maxPace}
                  onChange={(e) => setMaxPace(e.target.value)}
                  placeholder="6:00"
                  className={numCls}
                />
              </div>
            </div>
            {(minKm || maxKm || minPace || maxPace) && (
              <button
                onClick={() => {
                  setMinKm("");
                  setMaxKm("");
                  setMinPace("");
                  setMaxPace("");
                }}
                className="text-sm text-accent hover:underline pb-1"
              >
                Clear
              </button>
            )}
          </div>
        )}
      </div>

      {/* List */}
      <Card className="divide-y divide-border">
        {filtered.length === 0 ? (
          <div className="px-4 py-8 text-center text-sm text-muted">
            No sessions match these filters.
          </div>
        ) : (
          filtered.map((s) => (
            <div
              key={s.kind + s.id}
              className="flex items-center gap-3 px-4 py-3 transition-colors duration-150 hover:bg-black/4 first:rounded-t-2xl last:rounded-b-2xl"
            >
              <SessionBadge s={s} />
              <Link
                href={s.href}
                className="flex-1 min-w-0 flex items-center gap-4"
              >
                <div className="w-14 text-center shrink-0">
                  <div className="text-xs text-muted">
                    {new Date(s.startedAt).toLocaleString("en", {
                      month: "short",
                    })}
                  </div>
                  <div className="text-lg font-semibold leading-none">
                    {new Date(s.startedAt).getDate()}
                  </div>
                </div>
                <div className="min-w-0 flex-1">
                  <div className="font-medium truncate">{s.name}</div>
                  <div className="text-xs text-muted">
                    {s.typeLabel} · {s.meta}
                  </div>
                </div>
              </Link>
              {s.kind === "run" ? (
                <DeleteRunButton id={s.id} />
              ) : (
                <DeleteGymButton id={s.id} />
              )}
            </div>
          ))
        )}
      </Card>
    </div>
  );
}
