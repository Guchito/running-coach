import { getRun, getUserById } from "@/lib/db";
import { formatPace, formatDuration, formatDistance } from "@/lib/parseRun";
import { PageShell, Card, Stat, Button } from "@/components/ui";
import { RunDetailChart, ElevationChart, CadenceChart } from "@/components/Charts";
import { SplitsSection } from "@/components/SplitsSection";
import { HrZonesCard } from "@/components/HrZonesCard";
import { RunReview } from "@/components/RunReview";
import { DeleteRunButton } from "@/components/DeleteRunButton";
import { requireUserId } from "@/lib/auth";
import { resolveZones } from "@/lib/hr";
import { notFound } from "next/navigation";
import Link from "next/link";

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
  const [run, user] = await Promise.all([getRun(userId, Number(id)), getUserById(userId)]);
  if (!run) notFound();
  const s = run.summary;
  const zones = resolveZones(user?.maxHr ?? null, user?.hrZones ?? null);
  const hrCustomized = !!(user?.maxHr || user?.hrZones);

  const ask = encodeURIComponent(
    `I just uploaded my run "${run.name}" (${formatDistance(run.distanceM)} in ${formatDuration(
      run.durationSec
    )}, avg ${formatPace(run.avgPaceSecPerKm)}). Give me feedback on it and tell me how it fits my goal.`
  );

  const intensityTotal = Object.values(s.intensityBreakdown).reduce((a, b) => a + b, 0) || 1;

  return (
    <PageShell
      title={run.name}
      subtitle={new Date(run.startedAt).toLocaleString("en", {
        weekday: "long",
        day: "numeric",
        month: "long",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      })}
      action={
        <div className="flex items-center gap-3">
          <DeleteRunButton id={run.id} redirectTo="/runs" />
          <Button href={`/coach?ask=${ask}`} variant="soft">Ask coach 💬</Button>
        </div>
      }
    >
      {isNew && <RunReview run={run} />}

      {/* Headline stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <Stat label="Distance" value={formatDistance(run.distanceM)} />
        <Stat label="Time" value={formatDuration(run.durationSec)} />
        <Stat label="Avg pace" value={formatPace(run.avgPaceSecPerKm)} sub={`moving ${formatPace(s.avgMovingPaceSecPerKm)}`} />
        <Stat label="Avg / max HR" value={`${s.avgHr ? Math.round(s.avgHr) : "—"} / ${s.maxHr ? Math.round(s.maxHr) : "—"}`} sub="bpm" />
      </div>

      {/* Pace & HR chart */}
      <Card className="p-5 mb-6">
        <h2 className="font-medium mb-3">Pace & heart rate</h2>
        <RunDetailChart series={s.series} />
        <div className="flex gap-4 text-xs text-muted mt-2">
          <span className="flex items-center gap-1"><span className="w-3 h-0.5 bg-accent inline-block" /> Pace</span>
          <span className="flex items-center gap-1"><span className="w-3 h-0.5 bg-rose-600 inline-block" /> Heart rate</span>
        </div>
      </Card>

      <div className="grid md:grid-cols-2 gap-6 mb-6">
        {/* Splits — kilometers or workout intervals */}
        <SplitsSection splits={s.splits} laps={s.laps ?? []} />

        {/* Cadence */}
        <Card className="p-5">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-medium">Cadence</h2>
            <span className="text-sm text-muted tabular-nums">
              avg <strong className="text-foreground">{s.avgCadence ? Math.round(s.avgCadence * 2) : "—"} spm</strong>
              {s.maxCadence ? ` · max ${Math.round(s.maxCadence * 2)}` : ""}
            </span>
          </div>
          <CadenceChart series={s.series} />
        </Card>
      </div>

      {/* Elevation */}
      <Card className="p-5 mb-6">
        <h2 className="font-medium mb-3">Elevation</h2>
        <ElevationChart series={s.series} />
        <div className="flex gap-6 mt-3 text-sm">
          <span className="text-muted">Gain <strong className="text-foreground">+{Math.round(s.elevGainM)} m</strong></span>
          <span className="text-muted">Loss <strong className="text-foreground">−{Math.round(s.elevLossM)} m</strong></span>
        </div>
      </Card>

      {/* Form metrics + effort */}
      <div className="grid md:grid-cols-2 gap-6">
        <Card className="p-5">
          <h2 className="font-medium mb-3">Running form</h2>
          <dl className="grid grid-cols-2 gap-y-3 text-sm">
            <Metric label="Cadence" value={s.avgCadence ? `${Math.round(s.avgCadence * 2)} spm` : "—"} />
            <Metric label="Stride length" value={s.avgStrideMm ? `${(s.avgStrideMm / 1000).toFixed(2)} m` : "—"} />
            <Metric label="Vertical oscillation" value={s.avgVoMm ? `${s.avgVoMm.toFixed(1)} mm` : "—"} />
            <Metric label="Ground contact" value={s.avgGctMs ? `${Math.round(s.avgGctMs)} ms` : "—"} />
            <Metric label="Avg power" value={s.avgPower ? `${Math.round(s.avgPower)} W` : "—"} />
            <Metric label="Avg speed" value={`${(s.avgSpeed * 3.6).toFixed(1)} km/h`} />
          </dl>
        </Card>

        <Card className="p-5">
          <h2 className="font-medium mb-3">Effort breakdown</h2>
          <div className="space-y-2">
            {Object.entries(s.intensityBreakdown)
              .sort((a, b) => b[1] - a[1])
              .map(([label, sec]) => (
                <div key={label}>
                  <div className="flex justify-between text-sm mb-0.5">
                    <span className="capitalize">{label}</span>
                    <span className="text-muted tabular-nums">{formatDuration(sec)}</span>
                  </div>
                  <div className="h-2 rounded-full bg-black/[0.05] overflow-hidden">
                    <div className="h-full bg-accent rounded-full" style={{ width: `${(sec / intensityTotal) * 100}%` }} />
                  </div>
                </div>
              ))}
          </div>
          {s.avgHr && (
            <div className="mt-4 pt-4 border-t border-border">
              <HrZonesCard histogram={s.hrHistogram} zones={zones} customized={hrCustomized} />
            </div>
          )}
        </Card>
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
