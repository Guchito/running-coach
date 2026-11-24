"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import type { EffortVerdict, FitnessChange, WeeklyEffort as WeeklyEffortData } from "@/lib/fitness";
import { WEEK_STATUS } from "@/lib/fitness";
import { formatDuration } from "@/lib/parseRun";
import { WeeklyEffortChart } from "@/components/Charts";
import { SessionGlyph } from "@/components/SessionIcon";
import { interactiveRow } from "@/components/ui";

const fmtDay = (d: string, opts: Intl.DateTimeFormatOptions) =>
  new Date(d.length === 10 ? d + "T12:00:00" : d).toLocaleDateString("en-GB", opts);

const BANDS = [
  { key: "higher", label: "Higher than average", color: "#e11d48" },
  { key: "average", label: "Your 3-week average", color: "#2563eb" },
  { key: "lower", label: "Lower than average", color: "#60a5fa" },
] as const;

// One session's Relative Effort with a verdict against your 3-week average.
// Desktop leads with the big number; mobile puts it beside the title like the
// Strava app. Both show the three bands with a marker on this session's.
export function RelativeEffortScore({ effort, verdict }: { effort: number; verdict: EffortVerdict }) {
  return (
    <div>
      <div className="flex items-baseline justify-between gap-3 mb-3">
        <h2 className="font-medium">Relative Effort</h2>
        <span className="md:hidden font-mono text-3xl font-semibold tabular-nums" style={{ color: verdict.color }}>
          {effort}
        </span>
      </div>
      <div className="hidden md:flex items-baseline gap-3" style={{ color: verdict.color }}>
        <span className="font-mono text-6xl font-semibold tracking-tight tabular-nums leading-none">{effort}</span>
        <span className="text-2xl font-semibold">{verdict.label}</span>
      </div>
      <p className="text-sm md:mt-3">{verdict.message}</p>
      {verdict.band && (
        <div className="relative mt-4 rounded-xl overflow-hidden text-sm font-medium text-white max-md:-mx-5 max-md:rounded-none">
          {BANDS.map((b) => (
            <div key={b.key} className="flex items-center justify-between px-4 py-2.5" style={{ backgroundColor: b.color }}>
              {b.label}
              {b.key === verdict.band && (
                <span className="w-5 h-5 rounded-full bg-white/40 grid place-items-center" aria-label="This session">
                  <span className="w-2.5 h-2.5 rounded-full bg-foreground" />
                </span>
              )}
            </div>
          ))}
        </div>
      )}
      <p className="text-xs text-muted mt-2">Time at each heart rate, weighted steeply toward your threshold.</p>
    </div>
  );
}

// "Fitness increased" for one session: points it added and the fitness score
// that day, with the last 4 weeks of fitness as a sparkline.
export function FitnessChangeBlock({ change }: { change: FitnessChange }) {
  const { delta, fitness, trend } = change;
  const lo = Math.min(...trend);
  const span = Math.max(1, Math.max(...trend) - lo);
  const pts = trend.map((v, i) => `${(i / (trend.length - 1)) * 100},${36 - ((v - lo) / span) * 32}`).join(" ");
  const verb = delta > 0 ? "increased" : delta < 0 ? "decreased" : "maintained";
  return (
    <div className="flex items-center justify-between gap-4">
      <div>
        <h2 className="font-medium">Fitness {verb}</h2>
        <dl className="flex gap-6 mt-2">
          <div>
            <dt className="text-xs text-muted">Points</dt>
            <dd className="font-mono text-xl font-semibold tabular-nums">
              {delta > 0 ? "+" : ""}
              {delta}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-muted">Fitness score</dt>
            <dd className="font-mono text-xl font-semibold tabular-nums">{fitness}</dd>
          </div>
        </dl>
      </div>
      <svg viewBox="-2 0 104 40" className="w-28 h-12 shrink-0" aria-hidden>
        <polyline points={pts} fill="none" stroke="var(--color-accent, #2563eb)" strokeWidth={2} vectorEffect="non-scaling-stroke" />
        <circle cx={100} cy={36 - ((fitness - lo) / span) * 32} r={2.5} fill="var(--color-accent, #2563eb)" />
      </svg>
    </div>
  );
}

// Strava-style Weekly Effort: Mon–Sun bars, the week's total vs your
// recommended range, the 12-week trend, and the sessions behind it. Hovering
// or clicking a week shows it; it stays while the mouse is anywhere in the
// card (so its sessions can be clicked) and resets when the mouse leaves.
// `currentHref` marks the session being viewed (not linked).
export function WeeklyEffort({
  data,
  currentHref,
  showTitle = true,
}: {
  data: WeeklyEffortData;
  currentHref?: string;
  showTitle?: boolean; // off when the page itself is titled "Weekly effort"
}) {
  const [shown, setShown] = useState(data.selected);
  const week = data.weeks[shown];
  const max = Math.max(1, ...week.days);
  const status = WEEK_STATUS[week.status];
  const last = data.weeks.length - 1;
  const step = (d: number) => setShown((i) => Math.min(last, Math.max(0, i + d)));
  // Phones have no hover: swipe the header (or tap the arrows) to change week.
  const touchX = useRef<number | null>(null);
  const dates = `${fmtDay(week.weekStart, { day: "numeric", month: "short" })} – ${fmtDay(week.weekEnd, { day: "numeric", month: "short", year: "numeric" })}`;
  return (
    // Leaving the card returns to the home week (this week / the run's week).
    <div onMouseLeave={() => setShown(data.selected)}>
      <div className={`flex flex-wrap items-baseline justify-between gap-2 mb-4 ${showTitle ? "" : "max-md:hidden"}`}>
        {showTitle && <h2 className="font-medium">Weekly effort</h2>}
        <span className="text-xs text-muted max-md:hidden">{dates}</span>
      </div>

      {/* Mobile: a full-bleed accent header like the Strava app. */}
      <div
        className="max-md:-mx-5 max-md:px-5 max-md:pt-5 max-md:pb-3 max-md:bg-[var(--week)] max-md:text-white mb-4 select-none transition-colors"
        style={{ "--week": status.color } as React.CSSProperties}
        onTouchStart={(e) => (touchX.current = e.touches[0].clientX)}
        onTouchEnd={(e) => {
          if (touchX.current == null) return;
          const dx = e.changedTouches[0].clientX - touchX.current;
          if (Math.abs(dx) > 40) step(dx > 0 ? -1 : 1); // swipe right → older week
          touchX.current = null;
        }}
      >
      <div className="md:hidden text-sm text-white/80 mb-2">{dates}</div>
      <div className="flex items-end gap-6 max-md:flex-col-reverse max-md:items-start max-md:gap-5">
        <div className="shrink-0" aria-label="Relative Effort by day">
          <div className="flex items-end gap-1.5 h-16">
            {week.days.map((v, i) => (
              <div
                key={i}
                className="w-3.5 bg-foreground/80 max-md:bg-white max-md:w-5 rounded-t-sm transition-[height,opacity] duration-300 ease-out motion-reduce:transition-none"
                style={{ height: `${v ? Math.max(6, (v / max) * 100) : 4}%`, opacity: v ? 1 : 0.15 }}
                title={`${v}`}
              />
            ))}
          </div>
          <div className="flex gap-1.5 mt-1">
            {"MTWTFSS".split("").map((d, i) => (
              <span key={i} className="w-3.5 max-md:w-5 text-center text-[10px] text-muted max-md:text-white/80">
                {d}
              </span>
            ))}
          </div>
        </div>
        <div className="min-w-0">
          <div className="font-mono text-4xl max-md:text-6xl font-semibold tracking-tight tabular-nums leading-none text-[var(--week)] max-md:text-white">
            {week.total}
          </div>
          <div className="font-medium mt-1.5 max-md:text-xl max-md:font-semibold max-md:mt-3">{status.label}</div>
          <p className="text-xs text-muted mt-0.5 max-md:text-sm max-md:text-white/85">
            {status.body}
            {week.low != null && ` Range ${week.low}–${week.high}.`}
          </p>
        </div>
      </div>

      <div className="md:hidden flex items-center justify-between mt-4 text-sm text-white/90">
        <button type="button" onClick={() => step(-1)} disabled={shown === 0} aria-label="Previous week" className="px-2 py-1 disabled:opacity-30">
          ‹
        </button>
        Swipe to see past weeks
        <button type="button" onClick={() => step(1)} disabled={shown === last} aria-label="Next week" className="px-2 py-1 disabled:opacity-30">
          ›
        </button>
      </div>
      </div>

      <WeeklyEffortChart
        weeks={data.weeks}
        home={data.selected}
        shown={shown}
        shownColor={status.color}
        onPick={setShown}
      />

      {week.sessions.length > 0 && (
        <div className="divide-y divide-border mt-3 text-sm">
          <div className="md:hidden text-xs font-medium uppercase tracking-wider text-muted pb-2">Activities this week</div>
          {week.sessions.map((s) => {
            const here = s.href === currentHref;
            const row = (
              <>
                <SessionGlyph kind={s.kind} type={s.type} className="w-4 h-4 text-muted shrink-0" />
                <span className="w-24 text-muted shrink-0">{fmtDay(s.startedAt, { weekday: "short", day: "numeric", month: "numeric" })}</span>
                <span className={`flex-1 truncate ${here ? "font-medium" : "text-accent"}`}>{s.name}</span>
                <span className="text-muted tabular-nums hidden sm:inline">{formatDuration(s.durationSec)}</span>
                <span className="w-10 text-right font-mono font-medium tabular-nums">{s.effort}</span>
              </>
            );
            return here ? (
              <div key={s.href} className="flex items-center gap-3 py-2 px-2 -mx-2 bg-black/3 rounded-lg">
                {row}
              </div>
            ) : (
              <Link key={s.href} href={s.href} className={`flex items-center gap-3 py-2 px-2 -mx-2 rounded-lg ${interactiveRow}`}>
                {row}
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
