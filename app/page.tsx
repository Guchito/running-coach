import { listRuns, getGoal } from "@/lib/db";
import { computeStats, daysUntil, projectGoalTime } from "@/lib/stats";
import { formatPace, formatDuration, formatDistance } from "@/lib/parseRun";
import { Card, Stat, PageShell, Button, EmptyState } from "@/components/ui";
import { PaceTrendChart } from "@/components/Charts";
import Link from "next/link";

export const dynamic = "force-dynamic";

export default function Dashboard() {
  const runs = listRuns();
  const goal = getGoal();
  const stats = computeStats(runs);
  const projected = projectGoalTime(runs, goal);
  const days = daysUntil(goal?.targetDate ?? null);

  return (
    <PageShell
      title="Dashboard"
      subtitle="Your training at a glance."
      action={<Button href="/upload">+ Upload run</Button>}
    >
      {/* Goal card */}
      {goal ? (
        <Card className="p-6 mb-6 bg-linear-to-br from-accent to-indigo-600 text-white border-0">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <div className="text-xs uppercase tracking-wide text-white/70">
                Current goal
              </div>
              <div className="text-2xl font-semibold mt-1">{goal.title}</div>
              <div className="text-white/80 text-sm mt-1">
                {goal.raceType}
                {goal.targetTimeSec
                  ? ` · target ${formatDuration(goal.targetTimeSec)}`
                  : ""}
                {goal.targetDate ? ` · ${goal.targetDate}` : ""}
              </div>
            </div>
            <div className="flex gap-6">
              {days !== null && (
                <div className="text-right">
                  <div className="text-3xl font-bold tabular-nums">
                    {days >= 0 ? days : "—"}
                  </div>
                  <div className="text-xs text-white/70">
                    {days >= 0 ? "days to go" : "past date"}
                  </div>
                </div>
              )}
              {projected && goal.targetDistanceM && (
                <div className="text-right">
                  <div className="text-3xl font-bold tabular-nums">
                    {formatDuration(projected)}
                  </div>
                  <div className="text-xs text-white/70">
                    projected ({formatDistance(goal.targetDistanceM)})
                  </div>
                </div>
              )}
            </div>
          </div>
          {projected && goal.targetTimeSec && (
            <ProjectionBar projected={projected} target={goal.targetTimeSec} />
          )}
          <div className="mt-4">
            <Link
              href="/goal"
              className="text-sm text-white/90 underline underline-offset-2"
            >
              Edit goal
            </Link>
          </div>
        </Card>
      ) : (
        <Card className="p-6 mb-6 flex flex-wrap items-center justify-between gap-4">
          <div>
            <div className="text-lg font-medium">No goal set yet</div>
            <p className="text-muted text-sm mt-1">
              Set a target race and date so your coach can build a plan around
              it.
            </p>
          </div>
          <Button href="/goal">Set a goal</Button>
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

function ProjectionBar({
  projected,
  target,
}: {
  projected: number;
  target: number;
}) {
  const onTrack = projected <= target;
  const deltaSec = Math.abs(projected - target);
  return (
    <div className="mt-4 bg-white/15 rounded-lg p-3 text-sm">
      {onTrack ? (
        <span>
          🎯 On track — you&apos;re projected{" "}
          <strong>{formatDuration(deltaSec)}</strong> faster than your target.
        </span>
      ) : (
        <span>
          ⏱️ <strong>{formatDuration(deltaSec)}</strong> off target pace. Keep
          building — your coach can help close the gap.
        </span>
      )}
    </div>
  );
}
