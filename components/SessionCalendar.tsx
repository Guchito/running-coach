"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Card } from "@/components/ui";
import { SessionBadge } from "@/components/SessionIcon";
import { dayKey, type SessionLite } from "@/lib/sessionMeta";

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

// Monday-based weekday index (0 = Mon … 6 = Sun).
function monIndex(d: Date): number {
  return (d.getDay() + 6) % 7;
}

function prettyDay(key: string): string {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("en", {
    weekday: "long",
    month: "long",
    day: "numeric",
  });
}

function timeOf(iso: string): string {
  return new Date(iso).toLocaleTimeString("en", { hour: "numeric", minute: "2-digit" });
}

export function SessionCalendar({ sessions }: { sessions: SessionLite[] }) {
  // Group sessions by local day.
  const byDay = useMemo(() => {
    const m = new Map<string, SessionLite[]>();
    for (const s of sessions) {
      const k = dayKey(s.startedAt);
      const list = m.get(k);
      if (list) list.push(s);
      else m.set(k, [s]);
    }
    return m;
  }, [sessions]);

  const todayKey = dayKey(new Date().toISOString());
  // Start on the most recent session's month, falling back to this month.
  const latest = sessions[0]?.startedAt;
  const initial = latest ? new Date(latest) : new Date();

  const [year, setYear] = useState(initial.getFullYear());
  const [month, setMonth] = useState(initial.getMonth()); // 0-11
  const [modalDay, setModalDay] = useState<string | null>(null);

  // Close the modal on Escape.
  useEffect(() => {
    if (!modalDay) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setModalDay(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [modalDay]);

  const firstOfMonth = new Date(year, month, 1);
  const leading = monIndex(firstOfMonth);
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  const cells: ({ day: number; key: string } | null)[] = [];
  for (let i = 0; i < leading; i++) cells.push(null);
  for (let day = 1; day <= daysInMonth; day++) {
    const key = `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    cells.push({ day, key });
  }

  function step(delta: number) {
    const m = month + delta;
    const y = year + Math.floor(m / 12);
    const mm = ((m % 12) + 12) % 12;
    setYear(y);
    setMonth(mm);
  }

  const modalSessions = modalDay ? byDay.get(modalDay) ?? [] : [];

  return (
    <Card className="p-4">
      <div className="flex items-center justify-between mb-3">
        <h2 className="font-semibold text-lg">
          {MONTHS[month]} {year}
        </h2>
        <div className="flex items-center gap-1">
          <button
            onClick={() => step(-1)}
            aria-label="Previous month"
            className="w-8 h-8 grid place-items-center rounded-lg text-foreground/70 hover:bg-black/5"
          >
            ‹
          </button>
          <button
            onClick={() => {
              const now = new Date();
              setYear(now.getFullYear());
              setMonth(now.getMonth());
            }}
            className="text-xs px-2 h-8 rounded-lg text-foreground/70 hover:bg-black/5"
          >
            Today
          </button>
          <button
            onClick={() => step(1)}
            aria-label="Next month"
            className="w-8 h-8 grid place-items-center rounded-lg text-foreground/70 hover:bg-black/5"
          >
            ›
          </button>
        </div>
      </div>

      <div className="grid grid-cols-7 gap-1 text-center text-xs text-muted mb-1">
        {WEEKDAYS.map((w) => (
          <div key={w} className="py-1">{w}</div>
        ))}
      </div>

      <div className="grid grid-cols-7 gap-1">
        {cells.map((cell, i) => {
          if (!cell) return <div key={`b${i}`} />;
          const items = byDay.get(cell.key) ?? [];
          const isToday = cell.key === todayKey;
          const has = items.length > 0;
          return (
            <button
              key={cell.key}
              onClick={() => has && setModalDay(cell.key)}
              disabled={!has}
              className={`h-12 rounded-lg border p-0.5 flex flex-col items-center justify-center gap-0.5 transition-colors ${
                isToday ? "border-accent" : "border-transparent"
              } ${has ? "cursor-pointer hover:bg-black/5" : "cursor-default"}`}
            >
              <span
                className={`text-[11px] leading-none ${
                  isToday ? "font-bold text-accent" : "text-foreground/70"
                }`}
              >
                {cell.day}
              </span>
              {has && (
                <span className="flex justify-center gap-0.5">
                  {items.slice(0, 2).map((s) => (
                    <SessionBadge key={s.kind + s.id} s={s} size="md" />
                  ))}
                  {items.length > 2 && (
                    <span className="text-[10px] text-muted self-center">+{items.length - 2}</span>
                  )}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Day modal */}
      {modalDay && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          onClick={() => setModalDay(null)}
        >
          <div className="absolute inset-0 bg-black/40" />
          <div
            className="relative w-full max-w-md bg-card border border-border rounded-2xl shadow-xl p-5"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between mb-4">
              <div>
                <h3 className="font-semibold text-lg leading-tight">{prettyDay(modalDay)}</h3>
                <p className="text-xs text-muted">
                  {modalSessions.length} session{modalSessions.length === 1 ? "" : "s"}
                </p>
              </div>
              <button
                onClick={() => setModalDay(null)}
                aria-label="Close"
                className="w-8 h-8 grid place-items-center rounded-lg text-foreground/70 hover:bg-black/5 -mr-1 -mt-1"
              >
                ✕
              </button>
            </div>

            <div className="space-y-2">
              {modalSessions.map((s) => (
                <Link
                  key={s.kind + s.id}
                  href={s.href}
                  className="flex items-center gap-3 rounded-xl border border-border p-3 hover:bg-black/[0.02]"
                >
                  <SessionBadge s={s} size="lg" />
                  <div className="min-w-0 flex-1">
                    <div className="font-medium truncate">{s.name}</div>
                    <div className="text-xs text-muted">
                      {s.typeLabel} · {timeOf(s.startedAt)} · {s.meta}
                    </div>
                  </div>
                  <span className="text-muted shrink-0" aria-hidden>›</span>
                </Link>
              ))}
            </div>
          </div>
        </div>
      )}
    </Card>
  );
}
