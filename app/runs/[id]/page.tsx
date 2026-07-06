import { getRun, getUserById } from "@/lib/db";
import { formatPace, formatDuration, formatDistance } from "@/lib/parseRun";
import { PageShell, Card, Stat } from "@/components/ui";
import { CombinedChart } from "@/components/Charts";
import { SplitsSection } from "@/components/SplitsSection";
import { AddSplitsCard } from "@/components/AddSplitsCard";
import { HrZonesCard } from "@/components/HrZonesCard";
import { RunReview } from "@/components/RunReview";
import { DeleteRunButton } from "@/components/DeleteRunButton";
import { RunNameEditor } from "@/components/RunNameEditor";
import { AnalyzeRunButton } from "@/components/AnalyzeRunButton";
import { requireUserId } from "@/lib/auth";
import { resolveZones } from "@/lib/hr";
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
  const [run, user] = await Promise.all([
    getRun(userId, Number(id)),
    getUserById(userId),
  ]);
  if (!run) notFound();
  const s = run.summary;
  const zones = resolveZones(user?.maxHr ?? null, user?.hrZones ?? null);
  const hrCustomized = !!(user?.maxHr || user?.hrZones);

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
        <div className="flex items-center gap-3">
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
        <Stat label="Distance" value={formatDistance(run.distanceM)} />
        <Stat label="Time" value={formatDuration(run.durationSec)} />
        <Stat
          label="Avg pace"
          value={formatPace(run.avgPaceSecPerKm)}
          sub={`moving ${formatPace(s.avgMovingPaceSecPerKm)}`}
        />
        <Stat
          label="Avg / max HR"
          value={`${s.avgHr ? Math.round(s.avgHr) : "—"} / ${s.maxHr ? Math.round(s.maxHr) : "—"}`}
          sub="bpm"
        />
      </div>

      {/* All metrics on one chart, each line toggleable */}
      <Card className="p-5 mb-6">
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
      <div className="mb-6">
        {s.splits.length === 0 && (s.laps ?? []).length === 0 ? (
          <AddSplitsCard
            runId={run.id}
            distanceM={run.distanceM}
            durationSec={run.durationSec}
            avgHr={s.avgHr}
          />
        ) : (
          <SplitsSection splits={s.splits} laps={s.laps ?? []} />
        )}
      </div>

      {/* Form metrics + effort */}
      <div className="grid md:grid-cols-2 gap-6">
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
