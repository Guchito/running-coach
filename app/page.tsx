import { listRuns, listGoals, getPlan, listHealthMetrics, listCrossTraining, getUserById, listGymSessions } from "@/lib/db";
import { effortSessions, fitnessFreshness, weeklyEffort } from "@/lib/fitness";
import { WeeklyEffort } from "@/components/EffortCards";
import { resolveZones } from "@/lib/hr";
import {
  computeStats,
  daysUntil,
  projectGoalTime,
  type DashboardStats,
} from "@/lib/stats";
import {
  formatPace,
  formatDuration,
  formatDistance,
  formatDate,
  formatDatesInText,
} from "@/lib/parseRun";
import {
  trainingLoad,
  LOAD_STATUS_LABEL,
  LOAD_STATUS_COLOR,
} from "@/lib/trainingLoad";
import { runningRecords } from "@/lib/prs";
import {
  Card,
  Stat,
  PageShell,
  Button,
  EmptyState,
  interactiveRow,
} from "@/components/ui";
import { TrainingLoadBars } from "@/components/TrainingLoadBars";
import { HealthCard } from "@/components/HealthCard";
import { PaceTrendChart, DistanceTrendChart, FitnessPanel } from "@/components/Charts";
import { requireUserId } from "@/lib/auth";
import { RouteMap } from "@/components/RouteMap";
import { FitRows } from "@/components/FitRows";
import { trackOf } from "@/lib/sessionMeta";
import type { Goal, RunRow, WeeklyPlan } from "@/lib/types";
import Link from "next/link";

export const dynamic = "force-dynamic";

export default async function Dashboard() {
  const userId = await requireUserId();
  const [runs, goals, plan, healthMetrics, crossTraining, user, gym] = await Promise.all([
    listRuns(userId),
    listGoals(userId),
    getPlan(userId),
    listHealthMetrics(userId, 14),
    listCrossTraining(userId),
    getUserById(userId),
    listGymSessions(userId),
  ]);
  // Every HR-tracked session counts toward effort and fitness, not just runs.
  const efforts = effortSessions(
    [...runs, ...crossTraining],
    gym,
    resolveZones(user?.maxHr ?? null, user?.hrZones ?? null),
  );
  const fitness = fitnessFreshness(efforts, 365);
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
      wide
      title="Dashboard"
      subtitle="Your training at a glance."
    >
      {/* Phones: one column in the order set by max-lg:order-*.
          Desktop: stats strip on top, then a wide column for trends and
          charts beside a narrow one for goals, plan, records and recent runs.
          The two column wrappers are display:contents below lg, so their
          children join the single flex column and take their mobile order. */}
      <div className="flex flex-col lg:grid lg:grid-cols-[minmax(0,1fr)_22rem] lg:gap-x-6 lg:items-start">
        {runs.length > 0 && (
          <div className="max-lg:order-2 lg:col-span-2 grid grid-cols-2 md:grid-cols-4 gap-x-4 mb-2 md:mb-6">
            <Stat
              label="Total runs"
              value={stats.totalRuns}
              sub={`${stats.totalKm} km all-time`}
              appear={0}
            />
            <Stat
              label="This week"
              value={`${stats.last7Km} km`}
              sub={`${stats.last7Runs} run${stats.last7Runs === 1 ? "" : "s"}`}
              appear={1}
            />
            <Stat
              label="Recent avg pace"
              value={formatPace(stats.avgPaceRecent)}
              sub="last 5 runs"
              appear={2}
            />
            <Stat
              label="Best pace"
              value={formatPace(stats.bestPace)}
              sub={`longest ${formatDistance(stats.longestRunM)}`}
              appear={3}
            />
          </div>
        )}

        {/* Main column */}
        <div className="max-lg:contents lg:col-start-1 lg:row-start-2 min-w-0">
          {runs.length === 0 ? (
            <div className="max-lg:order-3">
              <EmptyState
                title="No runs yet"
                body="Upload your first Apple Watch run export (.csv) to get a full breakdown and your first coaching feedback."
                action={<Button href="/upload">Upload your first run</Button>}
              />
            </div>
          ) : (
            <>
              {efforts.length > 0 && (
                <div className="max-lg:order-9">
                  <Card className="p-5 mb-2 md:mb-6">
                    <WeeklyEffort data={weeklyEffort(efforts)} />
                  </Card>
                </div>
              )}
              <div className="max-lg:order-10">
                <FitnessCard days={fitness} />
              </div>
              <div className="max-lg:order-3">
                <RecentFormCard stats={stats} />
              </div>
              <div className="max-lg:order-7">
                <Card className="p-5 mb-2 md:mb-6">
                  <SectionHead title="Pace trend" note="avg pace per run · higher is faster" />
                  <PaceTrendChart trend={stats.trend} />
                </Card>
              </div>
              <div className="max-lg:order-8">
                <Card className="p-5 mb-2 md:mb-6">
                  <SectionHead title="Distance trend" note="distance per run" />
                  <DistanceTrendChart trend={stats.trend} />
                </Card>
              </div>
              {/* Heat map: every run's route stacked, darker where they overlap */}
              <div className="max-lg:order-11">
                <HeatMapCard runs={runs} />
              </div>
            </>
          )}
        </div>

        {/* Side column */}
        {/* Stretches to the main column's height (self-stretch), so Recent
            runs can fill down to the bottom of the map. */}
        <div className="max-lg:contents lg:col-start-2 lg:row-start-2 min-w-0 lg:self-stretch lg:flex lg:flex-col">
          <div className="max-lg:order-1">
            {dashboardGoals.length > 0 ? (
              <div className="mb-2 md:mb-6">
                {/* No heading: it pushed the goal card below the top edge of
                    the card beside it. The goal card speaks for itself. */}
                <div className="grid gap-2 md:gap-4 md:grid-cols-2 lg:grid-cols-1">
                  {dashboardGoals.map((g) => (
                    <GoalCard key={g.id} goal={g} runs={runs} />
                  ))}
                </div>
                <Button href="/goals" variant="ghost" className="w-full mt-2 md:mt-3 min-h-11">
                  Manage your goals
                </Button>
              </div>
            ) : (
              <Card className="p-6 mb-2 md:mb-6 flex flex-wrap items-center justify-between gap-4">
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
          </div>
          {plan.weekly && (
            <div className="max-lg:order-4">
              <ThisWeekCard weekly={plan.weekly} />
            </div>
          )}
          {runs.length > 0 && (
            <>
              <div className="max-lg:order-5">
                <TrainingLoadCard runs={runs} />
              </div>
              <div className="max-lg:order-6">
                <RecordsCard runs={runs} />
              </div>
              {/* Daily health (only once the HealthFit sheet has synced) */}
              <div className="max-lg:order-12">
                <HealthCard metrics={healthMetrics} href="/health" />
              </div>
              <div className="max-lg:order-13 lg:flex-1 lg:min-h-0 lg:flex lg:flex-col">
                <RecentRunsCard runs={runs} />
              </div>
            </>
          )}
        </div>
      </div>
    </PageShell>
  );
}

// Section header shared by the dashboard cards: title left, one link right.
// The link gets a 44px-tall hit area without changing how it looks.
function SectionHead({
  title,
  href,
  link,
  note,
}: {
  title: string;
  href?: string;
  link?: string;
  note?: string;
}) {
  return (
    <div className="flex items-center justify-between gap-3 mb-3 min-h-11">
      <h2 className="font-medium">{title}</h2>
      {href && link ? (
        <Link href={href} className="text-sm text-accent py-3 -my-3 pl-3 shrink-0">
          {link}
        </Link>
      ) : note ? (
        <span className="text-xs text-muted text-right">{note}</span>
      ) : null}
    </div>
  );
}

function ThisWeekCard({
  weekly,
}: {
  weekly: WeeklyPlan;
}) {
  return (
    <Card className="p-5 mb-2 md:mb-6">
      <SectionHead title="This week" href="/plan" link="Full plan →" />
      <p className="text-sm text-muted mb-3">{weekly.summary}</p>
      <div className="flex flex-wrap gap-2">
        {weekly.days.map((d, i) => (
          <span key={i} className="text-xs px-2 py-1 rounded-lg bg-black/4 text-muted">
            <strong className="text-foreground">{d.day}</strong> {d.title}
          </span>
        ))}
      </div>
    </Card>
  );
}

function RecentRunsCard({ runs }: { runs: RunRow[] }) {
  return (
    <Card className="p-5 mb-2 md:mb-6 lg:flex-1 lg:min-h-0 lg:flex lg:flex-col">
      <SectionHead title="Recent runs" href="/runs" link="View all →" />
      {/* Desktop: as many whole rows as fit beside the main column (min 3 rows
          tall). Smaller screens: the first 5, capped in CSS. */}
      {/* The list is absolutely positioned on desktop so its 40 rows add
          nothing to the column's height — the main column sets the height,
          and the list fills what's left. */}
      <div className="lg:relative lg:flex-1 lg:min-h-[12rem]">
      <FitRows className="divide-y divide-border lg:absolute lg:inset-0 lg:overflow-hidden max-lg:[&>*:nth-child(n+6)]:hidden">
        {runs.slice(0, 40).map((r) => (
          <Link
            key={r.id}
            href={`/runs/${r.id}`}
            className={`flex items-center justify-between gap-3 py-3 -mx-2 px-2 rounded-lg ${interactiveRow}`}
          >
            <div className="min-w-0">
              <div className="font-medium truncate">{formatDatesInText(r.name)}</div>
              <div className="text-xs text-muted">{formatDate(r.startedAt)}</div>
            </div>
            <div className="flex items-center gap-3 sm:gap-5 text-sm font-mono tabular-nums whitespace-nowrap shrink-0">
              <span className="font-medium">{formatDistance(r.distanceM)}</span>
              <span className="text-muted hidden sm:inline lg:hidden">
                {formatDuration(r.durationSec)}
              </span>
              <span className="text-accent sm:w-20 text-right">
                {formatPace(r.avgPaceSecPerKm)}
              </span>
            </div>
          </Link>
        ))}
      </FitRows>
      </div>
    </Card>
  );
}

// Strava-style Fitness & Freshness from HR-based Relative Effort.
function FitnessCard({ days }: { days: ReturnType<typeof fitnessFreshness> }) {
  if (days.length < 2) return null;
  return (
    <Card className="p-5 mb-2 md:mb-6">
      <h2 className="font-medium mb-4">Fitness &amp; freshness</h2>
      <FitnessPanel days={days} />
    </Card>
  );
}

// Last-5-runs vs last-20-runs averages for pace and distance, with a delta
// line showing whether recent form is faster/slower and longer/shorter.
function RecentFormCard({ stats }: { stats: DashboardStats }) {
  const { form, totalRuns } = stats;
  if (
    form.pace5 == null ||
    form.pace20 == null ||
    form.km5 == null ||
    form.km20 == null
  ) {
    return null;
  }
  // With 5 or fewer runs both windows hold the same runs, so deltas mean nothing.
  const comparable = totalRuns > 5;
  const paceDiff = Math.round(form.pace20 - form.pace5); // + → recent runs faster
  const kmDiff = form.km5 - form.km20; // + → recent runs longer

  return (
    <Card className="p-5 mb-2 md:mb-6">
      <SectionHead
        title="Recent form"
        note={`avg per run · last 5 vs last ${Math.min(totalRuns, 20)} runs`}
      />
      <div className="grid grid-cols-2 gap-4">
        <div>
          <div className="text-xs text-muted mb-1">Pace</div>
          <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
            <span className="font-mono text-2xl font-semibold tracking-tight tabular-nums leading-none whitespace-nowrap">
              {formatPace(form.pace5)}
            </span>
            <span className="text-sm text-muted tabular-nums whitespace-nowrap">
              vs {formatPace(form.pace20)}
            </span>
          </div>
          {comparable && paceDiff !== 0 && (
            <div
              className={`text-xs mt-1.5 ${paceDiff > 0 ? "text-good" : "text-rose-600"}`}
            >
              {paceDiff > 0
                ? `↑ ${paceDiff}s/km faster than usual`
                : `↓ ${-paceDiff}s/km slower than usual`}
            </div>
          )}
        </div>
        <div>
          <div className="text-xs text-muted mb-1">Distance</div>
          <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
            <span className="font-mono text-2xl font-semibold tracking-tight tabular-nums leading-none whitespace-nowrap">
              {form.km5.toFixed(1)} km
            </span>
            <span className="text-sm text-muted tabular-nums whitespace-nowrap">
              vs {form.km20.toFixed(1)} km
            </span>
          </div>
          {comparable && Math.abs(kmDiff) >= 0.05 && (
            <div
              className={`text-xs mt-1.5 ${kmDiff > 0 ? "text-good" : "text-rose-600"}`}
            >
              {kmDiff > 0
                ? `↑ ${kmDiff.toFixed(1)} km longer than usual`
                : `↓ ${Math.abs(kmDiff).toFixed(1)} km shorter than usual`}
            </div>
          )}
        </div>
      </div>
    </Card>
  );
}

function TrainingLoadCard({ runs }: { runs: RunRow[] }) {
  const load = trainingLoad(runs);
  return (
    <Card className="p-5 mb-2 md:mb-6">
      <SectionHead title="Training load" href="/coach" link="Ask coach →" />
      {load.ratio == null ? (
        <p className="text-sm text-muted">
          Log a few weeks of runs to see your acute:chronic load ratio.
        </p>
      ) : (
        <>
          <div className="flex items-end gap-3">
            <div className="font-mono text-3xl font-semibold tracking-tight tabular-nums leading-none">
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
            {load.acuteKm} km last 7 days vs {load.chronicKm} km/wk avg · good
            0.8–1.3 · sweet spot 1.0–1.1
          </div>
          <TrainingLoadBars weeks={load.weeks} />
          <div className="text-[11px] text-muted mt-1 text-right">
            last 6 weeks → now · tap a week for details
          </div>
        </>
      )}
    </Card>
  );
}

function RecordsCard({ runs }: { runs: RunRow[] }) {
  const { efforts, predictions } = runningRecords(runs);
  return (
    <Card className="p-5 mb-2 md:mb-6">
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
              <span className="font-mono font-medium tabular-nums">
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
    raced && goal.targetTimeSec
      ? goal.resultTimeSec! <= goal.targetTimeSec
      : null;

  return (
    // Plain div, not <Card>: Card's bg-card (white) conflicts with the ink
    // background at the utility layer.
    // Full-bleed band on phones, like every other card.
    <div className="rounded-2xl p-5 bg-ink text-white max-md:-mx-5 max-md:rounded-none">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-lg font-semibold truncate">{goal.title}</div>
          <div className="text-white/60 text-sm mt-0.5">
            {goal.raceType}
            {goal.targetTimeSec
              ? ` · ${formatDuration(goal.targetTimeSec)}`
              : ""}
            {goal.targetDate ? ` · ${formatDate(goal.targetDate)}` : ""}
          </div>
        </div>
        {!raced && days !== null && days >= 0 && (
          <div className="text-right shrink-0">
            <div className="font-mono text-3xl font-semibold tabular-nums leading-none text-accent-pop">
              {days}
            </div>
            <div className="font-mono text-[11px] uppercase tracking-wider text-white/60 mt-1">
              days to go
            </div>
          </div>
        )}
      </div>

      {raced ? (
        <div className="mt-4 space-y-2">
          <div className="bg-white/8 rounded-lg px-3 py-2.5 flex items-center justify-between gap-3">
            <span className="text-white/60 text-sm">
              Raced{goal.racedOn ? ` ${formatDate(goal.racedOn)}` : ""}
            </span>
            <strong className="font-mono tabular-nums text-lg">
              {formatDuration(goal.resultTimeSec!)}
            </strong>
          </div>
          {goal.targetTimeSec && (
            <div
              className={`text-xs px-1 ${beatTarget ? "text-accent-pop" : "text-white/70"}`}
            >
              {beatTarget
                ? `Beat your ${formatDuration(goal.targetTimeSec)} target by ${formatDuration(
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
              <div className="bg-white/8 rounded-lg px-3 py-2 text-sm flex items-center justify-between gap-3">
                <span className="text-white/60">If you raced today</span>
                <strong className="font-mono tabular-nums">
                  {formatDuration(ifToday)}
                </strong>
              </div>
            )}
            {projected ? (
              <div className="bg-white/8 rounded-lg px-3 py-2 text-sm flex items-center justify-between gap-3">
                <span className="text-white/60">Projected · race day</span>
                <strong className="font-mono tabular-nums">
                  {formatDuration(projected)}
                </strong>
              </div>
            ) : (
              <div className="text-xs text-white/50 px-1">
                Ask your coach for a race-day projection.
              </div>
            )}
            {goal.targetTimeSec && ref && (
              <div
                className={`text-xs px-2.5 py-1.5 rounded-lg inline-block ${
                  onTrack
                    ? "bg-accent-pop/15 text-accent-pop"
                    : "bg-white/8 text-white/80"
                }`}
              >
                {onTrack
                  ? ref === goal.targetTimeSec
                    ? `On track for ${formatDuration(goal.targetTimeSec)} · right on target`
                    : `On track for ${formatDuration(goal.targetTimeSec)} · ${formatDuration(
                        goal.targetTimeSec - ref,
                      )} to spare`
                  : `${formatDuration(
                      Math.abs(ref - goal.targetTimeSec),
                    )} off your ${formatDuration(goal.targetTimeSec)} target · keep building`}
              </div>
            )}
          </div>
        )
      )}
    </div>
  );
}

function HeatMapCard({ runs }: { runs: RunRow[] }) {
  const tracks = runs.map((r) => trackOf(r.summary.series)).filter((t) => t.length > 1);
  if (tracks.length === 0) return null;
  return (
    <Card className="p-5 mb-2 md:mb-6">
      <SectionHead
        title="Where you run"
        note={`${tracks.length} run${tracks.length === 1 ? "" : "s"} · darker = more often`}
      />
      <RouteMap tracks={tracks} heat />
    </Card>
  );
}
