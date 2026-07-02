import { listRuns, listGoals, getPlan } from "@/lib/db";
import { computeStats, daysUntil, projectGoalTime } from "@/lib/stats";
import { formatPace, formatDuration, formatDistance, formatDate, formatDatesInText } from "@/lib/parseRun";
import {
  trainingLoad,
  LOAD_STATUS_LABEL,
  LOAD_STATUS_COLOR,
} from "@/lib/trainingLoad";
import { runningRecords } from "@/lib/prs";
import { Card, Stat, PageShell, Button, EmptyState } from "@/components/ui";
import { PaceTrendChart, DistanceTrendChart } from "@/components/Charts";
import { requireUserId } from "@/lib/auth";
import type { Goal, RunRow } from "@/lib/types";
import Link from "next/link";

export const dynamic = "force-dynamic";

export default async function Dashboard() {
  const userId = await requireUserId();
  const [runs, goals, plan] = await Promise.all([
    listRuns(userId),
    listGoals(userId),
    getPlan(userId),
  ]);
  const stats = computeStats(runs);
  // Show active goals plus any raced in the last 30 days, so a fresh race result
  // stays on the dashboard for a while before it lives only on the Races page.
  const dashboardGoals = goals.filter((g) => {
    if (g.status === "active") return true;
    if (g.resultTimeSec == null) return false;
    const d = daysUntil(g.racedOn);
    return d != null && d >= -30;
  });

  return (
    <PageShell
      title="Dashboard"
      subtitle="Your training at a glance."
      action={<Button href="/upload">+ Upload session</Button>}
    >
      {/* Goals */}
      {dashboardGoals.length > 0 ? (
        <div className="mb-6">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-medium">Your goals</h2>
            <Link href="/goals" className="text-sm text-accent">
              Manage →
            </Link>
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            {dashboardGoals.map((g) => (
              <GoalCard key={g.id} goal={g} runs={runs} />
            ))}
          </div>
        </div>
      ) : (
        <Card className="p-6 mb-6 flex flex-wrap items-center justify-between gap-4">
          <div>
            <div className="text-lg font-medium">No goals set yet</div>
            <p className="text-muted text-sm mt-1">
              Set one or more target races so your coach can build a plan around
              them.
            </p>
          </div>
          <Button href="/goals">Set a goal</Button>
        </Card>
      )}

      {/* This week's plan summary */}
      {plan.weekly && (
        <Card className="p-5 mb-6">
          <div className="flex items-center justify-between mb-2">
            <h2 className="font-medium">This week</h2>
            <Link href="/plan" className="text-sm text-accent">
              Full plan →
            </Link>
          </div>
          <p className="text-sm text-muted mb-3">{plan.weekly.summary}</p>
          <div className="flex flex-wrap gap-2">
            {plan.weekly.days.map((d, i) => (
              <span
                key={i}
                className="text-xs px-2 py-1 rounded-lg bg-black/4 text-muted"
              >
                <strong className="text-foreground">{d.day}</strong> {d.title}
              </span>
            ))}
          </div>
        </Card>
      )}

      {runs.length === 0 ? (
        <EmptyState
          title="No runs yet"
          body="Upload your first Apple Watch run export (.csv) to get a full breakdown and your first coaching feedback."
          action={<Button href="/upload">Upload your first run</Button>}
        />
      ) : (
        <>
          {/* Stats */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
            <Stat
              label="Total runs"
              value={stats.totalRuns}
              sub={`${stats.totalKm} km all-time`}
            />
            <Stat
              label="This week"
              value={`${stats.last7Km} km`}
              sub={`${stats.last7Runs} run${stats.last7Runs === 1 ? "" : "s"}`}
            />
            <Stat
              label="Recent avg pace"
              value={formatPace(stats.avgPaceRecent)}
              sub="last 5 runs"
            />
            <Stat
              label="Best pace"
              value={formatPace(stats.bestPace)}
              sub={`longest ${formatDistance(stats.longestRunM)}`}
            />
          </div>

          {/* Training load + personal records */}
          <div className="grid md:grid-cols-2 gap-4 mb-6">
            <TrainingLoadCard runs={runs} />
            <RecordsCard runs={runs} />
          </div>

          {/* Trend */}
          <Card className="p-5 mb-6">
            <div className="flex items-center justify-between mb-3">
              <h2 className="font-medium">Pace trend</h2>
              <span className="text-xs text-muted">
                avg pace per run · lower is faster
              </span>
            </div>
            <PaceTrendChart trend={stats.trend} />
          </Card>

          {/* Distance trend */}
          <Card className="p-5 mb-6">
            <div className="flex items-center justify-between mb-3">
              <h2 className="font-medium">Distance trend</h2>
              <span className="text-xs text-muted">distance per run</span>
            </div>
            <DistanceTrendChart trend={stats.trend} />
          </Card>

          {/* Recent runs */}
          <Card className="p-5">
            <div className="flex items-center justify-between mb-3">
              <h2 className="font-medium">Recent runs</h2>
              <Link href="/runs" className="text-sm text-accent">
                View all →
              </Link>
            </div>
            <div className="divide-y divide-border">
              {runs.slice(0, 5).map((r) => (
                <Link
                  key={r.id}
                  href={`/runs/${r.id}`}
                  className="flex items-center justify-between py-3 -mx-2 px-2 rounded-lg hover:bg-black/3"
                >
                  <div className="min-w-0">
                    <div className="font-medium truncate">{formatDatesInText(r.name)}</div>
                    <div className="text-xs text-muted">
                      {formatDate(r.startedAt)}
                    </div>
                  </div>
                  <div className="flex items-center gap-5 text-sm tabular-nums">
                    <span className="font-medium">
                      {formatDistance(r.distanceM)}
                    </span>
                    <span className="text-muted hidden sm:inline">
                      {formatDuration(r.durationSec)}
                    </span>
                    <span className="text-accent w-20 text-right">
                      {formatPace(r.avgPaceSecPerKm)}
                    </span>
                  </div>
                </Link>
              ))}
            </div>
          </Card>
        </>
      )}
    </PageShell>
  );
}

function TrainingLoadCard({ runs }: { runs: RunRow[] }) {
  const load = trainingLoad(runs);
  const max = Math.max(1, ...load.weeks.map((w) => w.km));
  return (
    <Card className="p-5">
      <div className="flex items-center justify-between mb-3">
        <h2 className="font-medium">Training load</h2>
        <Link href="/coach" className="text-sm text-accent">
          Ask coach →
        </Link>
      </div>
      {load.ratio == null ? (
        <p className="text-sm text-muted">
          Log a few weeks of runs to see your acute:chronic load ratio.
        </p>
      ) : (
        <>
          <div className="flex items-end gap-3">
            <div className="text-3xl font-bold tabular-nums leading-none">
              {load.ratio.toFixed(2)}
            </div>
            <span
              className="text-xs px-2 py-1 rounded-full text-white mb-0.5"
              style={{ backgroundColor: LOAD_STATUS_COLOR[load.status] }}
            >
              {LOAD_STATUS_LABEL[load.status]}
            </span>
          </div>
          <div className="text-xs text-muted mt-1">
            {load.acuteKm} km this week vs {load.chronicKm} km/wk avg · sweet
            spot 0.8–1.3
          </div>
          <div className="flex items-end gap-1.5 h-16 mt-4">
            {load.weeks.map((w, i) => (
              <div
                key={w.weekStart}
                className="flex-1 rounded-t"
                style={{
                  height: `${Math.max(4, (w.km / max) * 100)}%`,
                  backgroundColor:
                    i === load.weeks.length - 1 ? "#4f46e5" : "#c7d2fe",
                }}
                title={`Week of ${w.weekStart}: ${w.km} km`}
              />
            ))}
          </div>
          <div className="text-[10px] text-muted mt-1 text-right">
            last 6 weeks → now
          </div>
        </>
      )}
    </Card>
  );
}

function RecordsCard({ runs }: { runs: RunRow[] }) {
  const { efforts, predictions } = runningRecords(runs);
  return (
    <Card className="p-5">
      <h2 className="font-medium mb-3">Personal records</h2>
      {efforts.length === 0 ? (
        <p className="text-sm text-muted">
          Your best 1K / 5K / 10K efforts appear here as you log runs.
        </p>
      ) : (
        <div className="space-y-1.5">
          {efforts.map((e) => (
            <div
              key={e.key}
              className="flex items-center justify-between gap-3 text-sm"
            >
              <span className="text-muted w-28 shrink-0">{e.label}</span>
              <span className="font-medium tabular-nums">
                {formatDuration(e.timeSec)}
              </span>
              <span className="text-xs text-muted tabular-nums w-24 text-right">
                {formatPace(e.paceSecPerKm)}
              </span>
            </div>
          ))}
          {predictions.length > 0 && (
            <div className="pt-2 mt-1 border-t border-border">
              <div className="text-[11px] uppercase tracking-wide text-muted mb-1">
                Predicted (no PR yet)
              </div>
              {predictions.map((p) => (
                <div
                  key={p.key}
                  className="flex items-center justify-between gap-3 text-sm"
                >
                  <span className="text-muted w-28 shrink-0">{p.label}</span>
                  <span className="tabular-nums text-foreground/70">
                    ~{formatDuration(p.timeSec)}
                  </span>
                  <span className="w-24 shrink-0" />
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </Card>
  );
}

function GoalCard({ goal, runs }: { goal: Goal; runs: RunRow[] }) {
  const days = daysUntil(goal.targetDate);
  const ifToday = projectGoalTime(runs, goal); // current fitness, from recent runs
  const projected = goal.projectedTimeSec; // coach's realistic race-day projection
  // Judge on-track against the coach's projection when set, else current fitness.
  const ref = projected ?? ifToday;
  const onTrack = ref && goal.targetTimeSec ? ref <= goal.targetTimeSec : null;
  // Once raced, the card celebrates the actual result instead of projections.
  const raced = goal.resultTimeSec != null;
  const beatTarget =
    raced && goal.targetTimeSec ? goal.resultTimeSec! <= goal.targetTimeSec : null;

  return (
    <Card className="p-5 bg-linear-to-br from-accent to-indigo-600 text-white border-0">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-lg font-semibold truncate">{goal.title}</div>
          <div className="text-white/80 text-sm mt-0.5">
            {goal.raceType}
            {goal.targetTimeSec
              ? ` · ${formatDuration(goal.targetTimeSec)}`
              : ""}
            {goal.targetDate ? ` · ${formatDate(goal.targetDate)}` : ""}
          </div>
        </div>
        {!raced && days !== null && days >= 0 && (
          <div className="text-right shrink-0">
            <div className="text-2xl font-bold tabular-nums leading-none">
              {days}
            </div>
            <div className="text-[11px] text-white/70">days to go</div>
          </div>
        )}
      </div>

      {raced ? (
        <div className="mt-4 space-y-2">
          <div className="bg-white/20 rounded-lg px-3 py-2.5 flex items-center justify-between gap-3">
            <span className="text-white/80 text-sm">
              🏁 Raced{goal.racedOn ? ` ${formatDate(goal.racedOn)}` : ""}
            </span>
            <strong className="tabular-nums text-lg">{formatDuration(goal.resultTimeSec!)}</strong>
          </div>
          {goal.targetTimeSec && (
            <div className="text-xs text-white/85 px-1">
              {beatTarget
                ? `🎉 Beat your ${formatDuration(goal.targetTimeSec)} target by ${formatDuration(
                    goal.targetTimeSec - goal.resultTimeSec!,
                  )}.`
                : `${formatDuration(
                    goal.resultTimeSec! - goal.targetTimeSec,
                  )} off your ${formatDuration(goal.targetTimeSec)} target.`}
            </div>
          )}
        </div>
      ) : (
        (ifToday || projected || goal.targetTimeSec) && (
        <div className="mt-4 space-y-2">
          {ifToday && (
            <div className="bg-white/15 rounded-lg px-3 py-2 text-sm flex items-center justify-between gap-3">
              <span className="text-white/75">If you raced today</span>
              <strong className="tabular-nums">
                {formatDuration(ifToday)}
              </strong>
            </div>
          )}
          {projected ? (
            <div className="bg-white/15 rounded-lg px-3 py-2 text-sm flex items-center justify-between gap-3">
              <span className="text-white/75">Projected · race day</span>
              <strong className="tabular-nums">
                {formatDuration(projected)}
              </strong>
            </div>
          ) : (
            <div className="text-xs text-white/60 px-1">
              Ask your coach for a race-day projection.
            </div>
          )}
          {goal.targetTimeSec && ref && (
            <div className="text-xs text-white/80 px-1">
              {onTrack
                ? `🎯 On track for your ${formatDuration(goal.targetTimeSec)} target (${formatDuration(
                    Math.abs(ref - goal.targetTimeSec),
                  )} to spare).`
                : `⏱️ ${formatDuration(
                    Math.abs(ref - goal.targetTimeSec),
                  )} off your ${formatDuration(goal.targetTimeSec)} target — keep building.`}
            </div>
          )}
        </div>
        )
      )}
    </Card>
  );
}
