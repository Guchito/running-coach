import Link from "next/link";
import { getRun, getUserById, listRuns, listCrossTraining, listGymSessions } from "@/lib/db";
import { formatPace, formatDuration, formatDistance } from "@/lib/parseRun";
import { PageShell, Card, Stat, cardClass } from "@/components/ui";
import { CombinedChart } from "@/components/Charts";
import { RouteMap } from "@/components/RouteMap";
import { trackOf } from "@/lib/sessionMeta";
import { SplitsSection } from "@/components/SplitsSection";
import { AddSplitsCard } from "@/components/AddSplitsCard";
import { TrimRunButton } from "@/components/TrimRunButton";
import { HrZonesCard } from "@/components/HrZonesCard";
import { RunReview } from "@/components/RunReview";
import { DeleteRunButton } from "@/components/DeleteRunButton";
import { RunNameEditor } from "@/components/RunNameEditor";
import { AnalyzeRunButton } from "@/components/AnalyzeRunButton";
import { requireUserId } from "@/lib/auth";
import { resolveZones } from "@/lib/hr";
import { effortSessions, effortVerdict, fitnessChange, runGap, splitGaps, weeklyEffort } from "@/lib/fitness";
import { FitnessChangeBlock, RelativeEffortScore, WeeklyEffort } from "@/components/EffortCards";
import { RevealOnView } from "@/components/RevealOnView";
import { notFound } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function RunDetail({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ new?: string }>;
}) {
  const userId = await requireUserId();
  const { id } = await params;
  const { new: isNew } = await searchParams;
  const [run, user, runs, cross, gym] = await Promise.all([
    getRun(userId, Number(id)),
    getUserById(userId),
    listRuns(userId),
    listCrossTraining(userId),
    listGymSessions(userId),
  ]);
  if (!run) notFound();
  const s = run.summary;
  const zones = resolveZones(user?.maxHr ?? null, user?.hrZones ?? null);
  const hrCustomized = !!(user?.maxHr || user?.hrZones);
  const efforts = effortSessions([...runs, ...cross], gym, zones);
  const self = efforts.find((e) => e.kind === "run" && e.id === run.id);
  const effort = self?.effort ?? null;
  const fitChange = self ? fitnessChange(efforts, Date.parse(run.startedAt)) : null;
  const verdict = self ? effortVerdict(self.effort, efforts, self) : null;
  // GAP only when the route actually climbs; on flat runs it just repeats pace.
  const hilly = s.elevGainM + s.elevLossM >= 20;
  const gap = hilly ? runGap(s.series) : null;

  const ask = encodeURIComponent(
    `Please analyze my run "${run.name}" — ${formatDistance(run.distanceM)} in ${formatDuration(
      run.durationSec,
    )}, avg ${formatPace(run.avgPaceSecPerKm)}. Tell me how it went, update my weekly and macro ` +
      `plan if it changes anything, and if it was a race or affects my goals, tell me what you'd recommend.`,
  );

  const intensityTotal =
    Object.values(s.intensityBreakdown).reduce((a, b) => a + b, 0) || 1;

  return (
    <PageShell
      title={<RunNameEditor id={run.id} name={run.name} />}
      subtitle={new Date(run.startedAt).toLocaleString("en-GB", {
        weekday: "long",
        day: "numeric",
        month: "long",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      })}
      action={
        <div className="flex items-center gap-3 max-md:w-full max-md:justify-end">
          <TrimRunButton runId={run.id} original={s.untrimmed ?? s} trim={s.trim ?? null} />
          {/* On mobile the delete action moves to the bottom of the page. */}
          <span className="hidden md:block">
            <DeleteRunButton id={run.id} redirectTo="/runs" />
          </span>
          <AnalyzeRunButton runId={run.id} ask={ask} />
        </div>
      }
    >
      {isNew && <RunReview run={run} />}

      {/* Headline stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <Stat label="Distance" value={formatDistance(run.distanceM)} appear={0} />
        <Stat label="Time" value={formatDuration(run.durationSec)} appear={1} />
        <Stat
          label="Avg pace"
          value={formatPace(run.avgPaceSecPerKm)}
          sub={`moving ${formatPace(s.avgMovingPaceSecPerKm)}${gap ? ` · GAP ${formatPace(gap)}` : ""}`}
          appear={2}
        />
        <Stat
          label="Avg / max HR"
          value={`${s.avgHr ? Math.round(s.avgHr) : "—"} / ${s.maxHr ? Math.round(s.maxHr) : "—"}`}
          sub={effort != null ? `bpm · Relative Effort ${effort}` : "bpm"}
          appear={3}
        />
      </div>

      {/* All metrics on one chart, each line toggleable */}
      <Card className="p-5 mb-2 md:mb-6">
        <div className="flex items-center justify-between mb-3 gap-3 flex-wrap">
          <h2 className="font-medium">Metrics</h2>
          <span className="text-xs text-muted tabular-nums">
            avg cadence{" "}
            <strong className="text-foreground">
              {s.avgCadence ? Math.round(s.avgCadence * 2) : "—"} spm
            </strong>
            {" · "}elevation{" "}
            <strong className="text-foreground">+{Math.round(s.elevGainM)}</strong>
            {" / "}
            <strong className="text-foreground">−{Math.round(s.elevLossM)} m</strong>
          </span>
        </div>
        <CombinedChart series={s.series} />
      </Card>

      {/* Splits — kilometers or workout intervals. A run without any (manual
          entry, bulk CSV import) gets an editor to add them after the fact. */}
      <div className="mb-2 md:mb-6">
        {s.splits.length === 0 && (s.laps ?? []).length === 0 ? (
          <AddSplitsCard
            runId={run.id}
            distanceM={run.distanceM}
            durationSec={run.durationSec}
            avgHr={s.avgHr}
          />
        ) : (
          <SplitsSection
            splits={s.splits}
            laps={s.laps ?? []}
            gaps={hilly ? splitGaps(s.series, s.splits) : undefined}
          />
        )}
      </div>

      {self && (
        <>
          {/* Desktop: everything side by side. */}
          <Card className="p-5 mb-6 max-md:hidden grid grid-cols-[minmax(0,1fr)_minmax(0,2fr)] gap-8">
            <div className="space-y-8">
              {fitChange && <FitnessChangeBlock change={fitChange} />}
              <RelativeEffortScore effort={self.effort} verdict={verdict!} />
            </div>
            <WeeklyEffort data={weeklyEffort(efforts, Date.parse(run.startedAt))} currentHref={self.href} />
          </Card>
          {/* Mobile: just the Relative Effort; tap for weekly effort and details. */}
          <Link
            href={`/runs/${run.id}/effort`}
            className={`md:hidden block mb-2 md:mb-6 ${cardClass} p-5 overflow-hidden active:bg-black/3`}
          >
            <RelativeEffortScore effort={self.effort} verdict={verdict!} />
            <div className="text-sm text-accent text-right mt-3">View weekly effort ›</div>
          </Link>
        </>
      )}

      {trackOf(s.series).length > 1 && (
        <Card className="p-5 mb-2 md:mb-6">
          <h2 className="font-medium mb-3">Route</h2>
          <RouteMap tracks={[trackOf(s.series)]} />
        </Card>
      )}

      {/* Form metrics + effort */}
      <div className="grid md:grid-cols-2 gap-2 md:gap-6">
        <Card className="p-5">
          <h2 className="font-medium mb-3">Running form</h2>
          <dl className="grid grid-cols-2 gap-y-3 text-sm">
            <Metric
              label="Cadence"
              value={s.avgCadence ? `${Math.round(s.avgCadence * 2)} spm` : "—"}
            />
            <Metric
              label="Stride length"
              value={
                s.avgStrideMm ? `${(s.avgStrideMm / 1000).toFixed(2)} m` : "—"
              }
            />
            <Metric
              label="Vertical oscillation"
              value={s.avgVoMm ? `${s.avgVoMm.toFixed(1)} mm` : "—"}
            />
            <Metric
              label="Ground contact"
              value={s.avgGctMs ? `${Math.round(s.avgGctMs)} ms` : "—"}
            />
            <Metric
              label="Avg power"
              value={s.avgPower ? `${Math.round(s.avgPower)} W` : "—"}
            />
            <Metric
              label="Avg speed"
              value={`${(s.avgSpeed * 3.6).toFixed(1)} km/h`}
            />
          </dl>
        </Card>

        <Card className="p-5">
          <h2 className="font-medium mb-3">Effort breakdown</h2>
          <RevealOnView className="space-y-2">
            {Object.entries(s.intensityBreakdown)
              .sort((a, b) => b[1] - a[1])
              .map(([label, sec], i) => (
                <div key={label}>
                  <div className="flex justify-between text-sm mb-0.5">
                    <span className="capitalize">{label}</span>
                    <span className="text-muted tabular-nums">
                      {formatDuration(sec)}
                    </span>
                  </div>
                  <div className="h-2 rounded-full bg-black/5 overflow-hidden">
                    <div
                      className="h-full bg-accent rounded-full fill-grow"
                      style={{
                        width: `${(sec / intensityTotal) * 100}%`,
                        animationDelay: `${i * 60}ms`,
                      }}
                    />
                  </div>
                </div>
              ))}
          </RevealOnView>
          {s.avgHr && (
            <div className="mt-4 pt-4 border-t border-border">
              <HrZonesCard
                histogram={s.hrHistogram}
                zones={zones}
                customized={hrCustomized}
              />
            </div>
          )}
        </Card>
      </div>

      {/* Mobile: delete lives at the bottom, out of the way of the primary actions. */}
      <div className="md:hidden mt-8 pt-4 border-t border-border flex justify-center">
        <DeleteRunButton id={run.id} redirectTo="/runs" />
      </div>
    </PageShell>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-muted text-xs">{label}</dt>
      <dd className="font-medium tabular-nums">{value}</dd>
    </div>
  );
}
