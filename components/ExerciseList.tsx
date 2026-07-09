import Link from "next/link";
import { Card, interactiveRow } from "@/components/ui";
import {
  buildExerciseHistory,
  compareEntries,
  entryIndexForSession,
  exerciseKey,
  formatKg,
  volumeOf,
  type ExerciseEntry,
  type ProgressDelta,
} from "@/lib/gymProgress";
import type { GymSession, GymSet } from "@/lib/types";

// The exercises card on a gym session page. Server-rendered: bars and
// sparklines are CSS/SVG, animated with the existing bar-grow / animate-in
// system (gated by the RevealOnView wrapper on the page).

// Each set is a column scaled to its weight, so pyramid/backoff structure
// reads at a glance. The heaviest set carries the accent — blue means data.
function SetBars({ sets }: { sets: GymSet[] }) {
  const values = sets.map((s) => s.weightKg ?? s.reps);
  const max = Math.max(...values, 1);
  const topIdx = values.indexOf(Math.max(...values));
  return (
    // min-w-0 lets this flex child shrink so overflow-x-auto can kick in
    // instead of stretching the card past the viewport on phones.
    <div className="flex items-end gap-1.5 overflow-x-auto pb-0.5 min-w-0">
      {sets.map((s, i) => {
        const h = 16 + (values[i] / max) * 40; // 16–56px
        const isTop = i === topIdx;
        return (
          <div key={i} className="flex flex-col items-center gap-1 shrink-0">
            <span className="font-mono text-[10px] leading-none tabular-nums text-foreground/80">
              {s.weightKg != null ? formatKg(s.weightKg) : s.reps}
            </span>
            <div
              className={`w-7 rounded-t-[3px] bar-grow ${isTop ? "bg-accent" : "bg-accent-soft"}`}
              style={{ height: h, animationDelay: `${i * 50}ms` }}
            />
            <span className="font-mono text-[10px] leading-none tabular-nums text-muted">
              ×{s.reps}
            </span>
          </div>
        );
      })}
    </div>
  );
}

// Top-set weight across past sessions (oldest → this one). Meaning is carried
// by the delta text next to it; the line is the shape of the story.
function Sparkline({ values }: { values: number[] }) {
  if (values.length < 2) return null;
  const w = 88;
  const h = 28;
  const pad = 3;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const pts = values.map((v, i) => {
    const x = pad + (i / (values.length - 1)) * (w - pad * 2);
    const y = h - pad - ((v - min) / span) * (h - pad * 2);
    return [x, y] as const;
  });
  const last = pts[pts.length - 1];
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} aria-hidden className="shrink-0">
      <polyline
        points={pts.map(([x, y]) => `${x},${y}`).join(" ")}
        fill="none"
        stroke="var(--accent)"
        strokeWidth="1.5"
        strokeLinejoin="round"
        strokeLinecap="round"
        opacity="0.85"
      />
      <circle cx={last[0]} cy={last[1]} r="2.5" fill="var(--accent)" />
    </svg>
  );
}

function shortDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

// Direction glyph + color + words: never color alone. Shared with the
// per-exercise history page.
export function DeltaBadge({ delta, prevDate }: { delta: ProgressDelta; prevDate: string | null }) {
  const vs = prevDate ? ` vs ${shortDate(prevDate)}` : "";
  if (delta.kind === "first") {
    return <span className="text-xs text-muted">first time logged</span>;
  }
  if (delta.kind === "same") {
    return <span className="text-xs text-muted">held{vs}</span>;
  }
  const value =
    delta.kind === "weight"
      ? { diff: delta.diffKg, unit: "kg" }
      : delta.kind === "reps"
      ? { diff: delta.diff, unit: delta.diff === 1 || delta.diff === -1 ? "rep" : "reps" }
      : { diff: delta.diffKg, unit: "kg vol" };
  const up = value.diff > 0;
  return (
    <span
      className={`font-mono text-xs tabular-nums font-medium ${up ? "text-good" : "text-warn"}`}
    >
      {up ? "▲" : "▼"} {up ? "+" : "−"}
      {formatKg(Math.abs(value.diff))} {value.unit}
      <span className="font-sans font-normal text-muted">{vs}</span>
    </span>
  );
}

export function ExerciseList({
  session,
  allSessions,
}: {
  session: GymSession;
  allSessions: GymSession[];
}) {
  const exercises = session.exercises ?? [];
  if (exercises.length === 0) return null;

  const history = buildExerciseHistory(allSessions);
  const totalSets = exercises.reduce((n, ex) => n + ex.sets.length, 0);
  const totalVolume = Math.round(exercises.reduce((t, ex) => t + volumeOf(ex.sets), 0));

  return (
    <Card className="p-5 mt-4">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="font-medium">Exercises</h2>
        <div className="font-mono text-xs tabular-nums text-muted">
          {totalSets} sets · {totalVolume.toLocaleString("en-GB")} kg
        </div>
      </div>

      <ul className="mt-2 divide-y divide-border">
        {exercises.map((ex) => {
          const hist = history.get(exerciseKey(ex.name));
          const idx = hist ? entryIndexForSession(hist, session.id) : -1;
          const entry: ExerciseEntry | null = idx >= 0 ? hist!.entries[idx] : null;
          const prev = idx > 0 ? hist!.entries[idx - 1] : null;
          const delta = entry ? compareEntries(prev, entry) : null;
          // Top-set weight trend up to this session (max 8 points).
          const trend = hist
            ? hist.entries
                .slice(0, idx + 1)
                .slice(-8)
                .map((e) => e.top?.weightKg ?? e.top?.reps ?? 0)
            : [];
          const top = entry?.top ?? null;

          return (
            <li key={ex.name}>
              <Link
                href={`/gym/exercise/${encodeURIComponent(exerciseKey(ex.name))}`}
                className={`group block -mx-2 rounded-lg px-2 py-4 ${interactiveRow}`}
              >
                <div className="flex items-baseline justify-between gap-3 flex-wrap">
                  <span className="text-sm font-medium">
                    {ex.name}
                    <span
                      className="ml-1.5 inline-block text-muted transition-[color,transform] duration-150 ease-out group-hover:text-accent group-hover:translate-x-0.5"
                      aria-hidden
                    >
                      ›
                    </span>
                  </span>
                  {delta && <DeltaBadge delta={delta} prevDate={prev?.date ?? null} />}
                </div>

                <div className="mt-3 flex items-end justify-between gap-6">
                  <SetBars sets={ex.sets} />
                  <div className="flex flex-col items-end gap-1.5 shrink-0">
                    <Sparkline values={trend} />
                    {top && (
                      <div className="font-mono text-xs tabular-nums text-muted">
                        top{" "}
                        <span className="text-foreground font-medium">
                          {top.weightKg != null
                            ? `${formatKg(top.weightKg)} kg × ${top.reps}`
                            : `${top.reps} reps`}
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              </Link>
            </li>
          );
        })}
      </ul>

      {session.strongLink && (
        <a
          href={session.strongLink}
          target="_blank"
          rel="noreferrer"
          className="inline-block mt-2 text-xs text-muted hover:text-foreground underline underline-offset-2"
        >
          View in Strong
        </a>
      )}
    </Card>
  );
}
