"use client";

import { useState } from "react";
import type { PlanDay } from "@/lib/types";
import { formatKg } from "@/lib/gymProgress";

// The weekly plan's day grid. Days that carry a strength prescription expand
// on tap to show exactly what to lift; every other day stays a static card.

const DAY_TYPE_COLOR: Record<string, string> = {
  easy: "#10b981",
  recovery: "#94a3b8",
  long: "#2563eb",
  tempo: "#f59e0b",
  intervals: "#e11d48",
  race: "#7c3aed",
  cross: "#0ea5e9",
  // Clearly apart from easy's emerald; the fuchsia only ever appears as a
  // tinted label, so it reads as a category, not decoration.
  strength: "#c026d3",
  rest: "#94a3b8",
};

const DAYS_ORDER = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function DayHeader({ d, done }: { d: PlanDay; done: boolean }) {
  return (
    <>
      <div className="flex items-center gap-2">
        <span className="text-xs font-semibold w-8 text-muted">{d.day}</span>
        <span className="font-medium truncate">{d.title}</span>
        {done && (
          <span className="text-good text-sm shrink-0" title="Completed">
            ✓
          </span>
        )}
      </div>
      <div className="text-sm text-muted mt-1.5 flex items-center gap-1.5">
        {/* Day-type as a tinted pill: same treatment the splits table uses
            for interval intensity. */}
        <span
          className="inline-flex items-center text-xs font-medium capitalize px-2 py-0.5 rounded-full"
          style={{
            color: `color-mix(in srgb, ${DAY_TYPE_COLOR[d.type] ?? "#94a3b8"} 65%, black)`,
            backgroundColor: `${DAY_TYPE_COLOR[d.type] ?? "#94a3b8"}1a`,
          }}
        >
          {d.type}
        </span>
        {d.distanceKm ? <span>{d.distanceKm} km</span> : null}
      </div>
      {d.detail && <div className="text-sm text-muted/90 mt-1">{d.detail}</div>}
    </>
  );
}

export function WeeklyPlanDays({
  days,
  doneDays,
}: {
  days: PlanDay[];
  doneDays: string[]; // day labels ("Mon"…) marked completed by adherence
}) {
  const [openDay, setOpenDay] = useState<string | null>(null);
  const done = new Set(doneDays);
  const sorted = [...days].sort(
    (a, b) => DAYS_ORDER.indexOf(a.day) - DAYS_ORDER.indexOf(b.day)
  );

  return (
    <div className="grid sm:grid-cols-2 gap-3">
      {sorted.map((d) => {
        const exercises = d.exercises ?? [];
        if (exercises.length === 0) {
          return (
            <div key={d.day} className="rounded-xl border border-border p-3">
              <DayHeader d={d} done={done.has(d.day)} />
            </div>
          );
        }

        const open = openDay === d.day;
        return (
          <div
            key={d.day}
            className={`rounded-xl border p-3 transition-[border-color] duration-150 ${
              open ? "border-accent/40" : "border-border"
            }`}
          >
            <button
              type="button"
              onClick={() => setOpenDay(open ? null : d.day)}
              aria-expanded={open}
              className="group w-full text-left cursor-pointer"
            >
              <div className="relative pr-6">
                <DayHeader d={d} done={done.has(d.day)} />
                {/* Chevron: the only hint needed that this day opens. */}
                <svg
                  className={`absolute right-0 top-1 w-4 h-4 text-muted transition-transform duration-200 ease-out group-hover:text-foreground ${
                    open ? "rotate-180" : ""
                  }`}
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                  strokeWidth={2}
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                </svg>
                {!open && (
                  <div className="text-xs text-muted mt-1.5">
                    {exercises.length} exercises — tap to see the session
                  </div>
                )}
              </div>
            </button>

            {/* Grid-rows expand: height animates without measuring content. */}
            <div
              className={`grid transition-[grid-template-rows] duration-200 ease-out motion-reduce:transition-none ${
                open ? "grid-rows-[1fr]" : "grid-rows-[0fr]"
              }`}
            >
              <div className="overflow-hidden">
                <ul className="mt-3 pt-1 border-t border-border divide-y divide-border/70">
                  {exercises.map((e, i) => (
                    <li key={i} className="py-2 first:pt-2 last:pb-0.5">
                      <div className="flex items-baseline justify-between gap-3">
                        <span className="text-sm min-w-0">{e.name}</span>
                        <span className="font-mono text-sm tabular-nums shrink-0">
                          {e.sets} × {e.reps}
                          {e.weightKg != null && (
                            <span className="text-muted"> · {formatKg(e.weightKg)} kg</span>
                          )}
                        </span>
                      </div>
                      {e.note && <div className="text-xs text-muted mt-0.5">{e.note}</div>}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
