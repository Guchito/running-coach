import { listRuns, listGoals, getPlan } from "@/lib/db";
import { computeStats, daysUntil, projectGoalTime } from "@/lib/stats";
import { formatPace, formatDuration, formatDistance } from "@/lib/parseRun";
import { Card, Stat, PageShell, Button, EmptyState } from "@/components/ui";
import { PaceTrendChart } from "@/components/Charts";
import { DriveAutoSync } from "@/components/DriveAutoSync";
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
  const activeGoals = goals.filter((g) => g.status === "active");

  return (
    <PageShell
      title="Dashboard"
      subtitle="Your training at a glance."
      action={<Button href="/upload">+ Upload run</Button>}
    >
      <DriveAutoSync />

      {/* Goals */}
      {activeGoals.length > 0 ? (
        <div className="mb-6">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-medium">Your goals</h2>
            <Link href="/goals" className="text-sm text-accent">Manage →</Link>
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            {activeGoals.map((g) => (
              <GoalCard key={g.id} goal={g} runs={runs} />
            ))}
          </div>
        </div>
      ) : (
        <Card className="p-6 mb-6 flex flex-wrap items-center justify-between gap-4">
          <div>
            <div className="text-lg font-medium">No goals set yet</div>
            <p className="text-muted text-sm mt-1">
              Set one or more target races so your coach can build a plan around them.
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
            <Link href="/plan" className="text-sm text-accent">Full plan →</Link>
          </div>
          <p className="text-sm text-muted mb-3">{plan.weekly.summary}</p>
          <div className="flex flex-wrap gap-2">
            {plan.weekly.days.map((d, i) => (
              <span key={i} className="text-xs px-2 py-1 rounded-lg bg-black/[0.04] text-muted">
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
                    <div className="font-medium truncate">{r.name}</div>
                    <div className="text-xs text-muted">
                      {r.startedAt.slice(0, 10)}
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

function GoalCard({ goal, runs }: { goal: Goal; runs: RunRow[] }) {
  const days = daysUntil(goal.targetDate);
  const projected = projectGoalTime(runs, goal);
  const onTrack = projected && goal.targetTimeSec ? projected <= goal.targetTimeSec : null;

  return (
    <Card className="p-5 bg-linear-to-br from-accent to-indigo-600 text-white border-0">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-lg font-semibold truncate">{goal.title}</div>
          <div className="text-white/80 text-sm mt-0.5">
            {goal.raceType}
            {goal.targetTimeSec ? ` · ${formatDuration(goal.targetTimeSec)}` : ""}
            {goal.targetDate ? ` · ${goal.targetDate}` : ""}
          </div>
        </div>
        {days !== null && days >= 0 && (
          <div className="text-right shrink-0">
            <div className="text-2xl font-bold tabular-nums leading-none">{days}</div>
            <div className="text-[11px] text-white/70">days to go</div>
          </div>
        )}
      </div>

      {projected && goal.targetTimeSec && (
        <div className="mt-4 bg-white/15 rounded-lg p-3 text-sm">
          {onTrack ? (
            <span>
              🎯 On track — projected <strong>{formatDuration(projected)}</strong> (
              {formatDuration(Math.abs(projected - goal.targetTimeSec))} ahead).
            </span>
          ) : (
            <span>
              ⏱️ Projected <strong>{formatDuration(projected)}</strong> —{" "}
              {formatDuration(Math.abs(projected - goal.targetTimeSec))} off target. Keep building.
            </span>
          )}
        </div>
      )}
    </Card>
  );
}
