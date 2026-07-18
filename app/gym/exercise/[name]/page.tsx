import Link from "next/link";
import { notFound } from "next/navigation";
import { listGymSessions } from "@/lib/db";
import { requireUserId } from "@/lib/auth";
import {
  buildExerciseHistory,
  compareEntries,
  exerciseKey,
  formatHold,
  formatKg,
  setsSummary,
} from "@/lib/gymProgress";
import { PageShell, Card, Stat, Button, interactiveRow } from "@/components/ui";
import { DeltaBadge } from "@/components/ExerciseList";
import { ExerciseTrendChart } from "@/components/Charts";
import { RevealOnView } from "@/components/RevealOnView";

export const dynamic = "force-dynamic";

// One movement across every session it appears in: the page that answers
// "am I getting stronger at this?"

function longDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export default async function ExercisePage({
  params,
}: {
  params: Promise<{ name: string }>;
}) {
  const userId = await requireUserId();
  const { name } = await params;
  const key = exerciseKey(decodeURIComponent(name));

  const sessions = await listGymSessions(userId);
  const hist = buildExerciseHistory(sessions).get(key);
  if (!hist) notFound();

  const entries = hist.entries; // oldest → newest
  const latest = entries[entries.length - 1];
  const hasWeight = entries.some((e) => e.top?.weightKg != null);
  const hasHold = entries.some((e) => e.top?.durationSec != null);
  const unit: "kg" | "reps" | "time" = hasWeight ? "kg" : hasHold ? "time" : "reps";

  // The number a top set competes on: weight, else hold duration, else reps.
  const topValue = (t: { weightKg: number | null; reps: number; durationSec?: number | null }) =>
    t.weightKg ?? t.durationSec ?? t.reps;

  // All-time best top set (by that value, reps break ties) + best estimated 1RM.
  const best = entries.reduce((b, e) => {
    if (!e.top) return b;
    if (!b?.top) return e;
    const bw = topValue(b.top);
    const ew = topValue(e.top);
    if (ew > bw || (ew === bw && e.top.reps > b.top.reps)) return e;
    return b;
  }, entries[0]);
  const bestE1Rm = entries.reduce<number | null>(
    (m, e) => (e.e1Rm != null && (m == null || e.e1Rm > m) ? e.e1Rm : m),
    null
  );

  // "New best" rows: a top set heavier than everything before it.
  const prSessionIds = new Set<number>();
  let runningBest = -Infinity;
  entries.forEach((e, i) => {
    const w = e.top ? topValue(e.top) : 0;
    if (i > 0 && w > runningBest) prSessionIds.add(e.sessionId);
    if (w > runningBest) runningBest = w;
  });

  const points = entries.map((e) => ({
    date: e.date.slice(0, 10),
    value: e.top ? Math.round(topValue(e.top) * 10) / 10 : 0,
    reps: e.top?.reps ?? null,
    e1Rm: e.e1Rm,
    volumeKg: e.volumeKg,
  }));

  const fmtTop = (e: (typeof entries)[number]) =>
    e.top
      ? e.top.weightKg != null
        ? `${formatKg(e.top.weightKg)} kg × ${e.top.reps}`
        : e.top.durationSec != null
        ? formatHold(e.top.durationSec)
        : `${e.top.reps} reps`
      : "—";

  // For timed holds "volume in kg" is meaningless — show total hold time.
  const latestHoldSec = latest.sets.reduce((t, s) => t + (s.durationSec ?? 0), 0);

  return (
    <PageShell
      title={hist.name}
      subtitle={`Trained ${entries.length} ${entries.length === 1 ? "time" : "times"} · since ${longDate(
        entries[0].date
      )}`}
      action={
        <Button href={`/gym/${latest.sessionId}`} variant="ghost">
          ← Last session
        </Button>
      }
    >
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Stat label="Latest top set" value={fmtTop(latest)} appear={0} />
        <Stat
          label="All-time best"
          value={fmtTop(best)}
          sub={best?.date ? longDate(best.date) : undefined}
          appear={1}
        />
        <Stat
          label="Est. 1RM"
          value={bestE1Rm != null ? `${formatKg(bestE1Rm)} kg` : "—"}
          sub={bestE1Rm != null ? "Epley, from best set" : undefined}
          appear={2}
        />
        <Stat
          label={unit === "time" ? "Last total hold" : "Last volume"}
          value={
            unit === "time"
              ? formatHold(latestHoldSec)
              : `${Math.round(latest.volumeKg).toLocaleString("en-GB")} kg`
          }
          sub={`${latest.sets.length} sets`}
          appear={3}
        />
      </div>

      <Card className="p-5 mt-4">
        <div className="flex items-baseline justify-between gap-3 mb-2">
          <h2 className="font-medium">Top set over time</h2>
          <span className="font-mono text-xs text-muted">{unit}</span>
        </div>
        <ExerciseTrendChart points={points} unit={unit} />
      </Card>

      <RevealOnView threshold={0.15}>
        <Card className="p-5 mt-4">
          <h2 className="font-medium mb-2">Every session</h2>
          <ul className="divide-y divide-border stagger-in">
            {[...entries].reverse().map((e, i) => {
              const idx = entries.length - 1 - i;
              const prev = idx > 0 ? entries[idx - 1] : null;
              return (
                <li key={e.sessionId}>
                  <Link
                    href={`/gym/${e.sessionId}`}
                    className={`group flex flex-wrap items-baseline gap-x-4 gap-y-1 -mx-2 rounded-lg px-2 py-3 ${interactiveRow}`}
                  >
                    <div className="w-24 shrink-0">
                      <div className="text-sm font-medium">
                        {new Date(e.date).toLocaleDateString("en-GB", {
                          day: "numeric",
                          month: "short",
                        })}
                      </div>
                      <div className="text-xs text-muted">
                        {new Date(e.date).getFullYear()}
                      </div>
                    </div>
                    <div className="flex-1 min-w-40 font-mono text-xs tabular-nums text-muted">
                      {setsSummary(e.sets)}
                    </div>
                    <div className="flex items-baseline gap-3 shrink-0">
                      {prSessionIds.has(e.sessionId) && (
                        <span className="font-mono text-[10px] uppercase tracking-wider text-accent">
                          new best
                        </span>
                      )}
                      <span className="font-mono text-sm tabular-nums font-medium">
                        {fmtTop(e)}
                      </span>
                      <DeltaBadge delta={compareEntries(prev, e)} prevDate={null} />
                    </div>
                  </Link>
                </li>
              );
            })}
          </ul>
        </Card>
      </RevealOnView>
    </PageShell>
  );
}
