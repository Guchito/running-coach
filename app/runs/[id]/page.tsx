import { getRun } from "@/lib/db";
import { formatPace, formatDuration, formatDistance } from "@/lib/parseRun";
import { PageShell, Card, Stat, Button } from "@/components/ui";
import { RunDetailChart, ElevationChart, SplitsChart } from "@/components/Charts";
import { DeleteRunButton } from "@/components/DeleteRunButton";
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
  const { id } = await params;
  const { new: isNew } = await searchParams;
  const run = getRun(Number(id));
  if (!run) notFound();
  const s = run.summary;

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
      {isNew && (
        <div className="mb-6 rounded-xl bg-good/10 border border-good/20 text-good px-4 py-3 text-sm flex items-center gap-2">
          ✅ Run imported and analyzed. Want feedback?{" "}
          <Link href={`/coach?ask=${ask}`} className="underline font-medium">Ask your coach →</Link>
        </div>
      )}

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
        {/* Splits */}
        <Card className="p-5">
          <h2 className="font-medium mb-3">Kilometer splits</h2>
          <SplitsChart splits={s.splits} />
          <div className="mt-3 max-h-40 overflow-auto text-sm">
            <table className="w-full">
              <tbody className="divide-y divide-border">
                {s.splits.map((sp) => (
                  <tr key={sp.km} className="tabular-nums">
                    <td className="py-1.5 text-muted">Km {sp.km}{sp.distanceM < 1000 ? ` (${sp.distanceM}m)` : ""}</td>
                    <td className="py-1.5 font-medium">{formatPace(sp.paceSecPerKm)}</td>
                    <td className="py-1.5 text-right text-muted">{sp.avgHr ? `${sp.avgHr} bpm` : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>

        {/* Elevation */}
        <Card className="p-5">
          <h2 className="font-medium mb-3">Elevation</h2>
          <ElevationChart series={s.series} />
          <div className="flex gap-6 mt-3 text-sm">
            <span className="text-muted">Gain <strong className="text-foreground">+{Math.round(s.elevGainM)} m</strong></span>
            <span className="text-muted">Loss <strong className="text-foreground">−{Math.round(s.elevLossM)} m</strong></span>
          </div>
        </Card>
      </div>

      {/* Form metrics + effort */}
      <div className="grid md:grid-cols-2 gap-6">
        <Card className="p-5">
          <h2 className="font-medium mb-3">Running form</h2>
          <dl className="grid grid-cols-2 gap-y-3 text-sm">
            <Metric label="Cadence" value={s.avgCadence ? `${Math.round(s.avgCadence)} spm` : "—"} />
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
          {s.hrZones && (
            <div className="mt-4 pt-4 border-t border-border">
              <div className="text-xs uppercase tracking-wide text-muted mb-2">HR zones (est. max 190)</div>
              <div className="space-y-1.5">
                {Object.entries(s.hrZones).map(([z, sec]) => (
                  <div key={z} className="flex items-center gap-2 text-xs">
                    <span className="w-20 text-muted">{z}</span>
                    <div className="flex-1 h-1.5 rounded-full bg-black/[0.05] overflow-hidden">
                      <div className="h-full bg-rose-500 rounded-full" style={{ width: `${(sec / s.sampleCount) * 100}%` }} />
                    </div>
                    <span className="w-12 text-right tabular-nums text-muted">{formatDuration(sec)}</span>
                  </div>
                ))}
              </div>
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
