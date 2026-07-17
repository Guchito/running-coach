import Link from "next/link";
import { listHealthMetrics } from "@/lib/db";
import { PageShell, Card, EmptyState, Button } from "@/components/ui";
import { HealthCard } from "@/components/HealthCard";
import { HealthCharts } from "@/components/HealthCharts";
import { requireUserId } from "@/lib/auth";
import { formatDate } from "@/lib/parseRun";
import type { HealthMetric } from "@/lib/types";

export const dynamic = "force-dynamic";

// Everything the HealthFit sheet syncs (plus manual logs), with progression.
// Reached from the dashboard's Health card.
export default async function HealthPage() {
  const userId = await requireUserId();
  const metrics = await listHealthMetrics(userId, 1000);

  if (!metrics.length) {
    return (
      <PageShell title="Health" subtitle="Daily recovery, sleep, and body data.">
        <EmptyState
          title="No health data yet"
          body="Link your HealthFit “Health Metrics” Google Sheet in Settings and sync — resting HR, HRV, sleep, weight and more land here daily. You can also log resting HR and weight by hand on your Profile."
          action={<Button href="/settings">Open Settings</Button>}
        />
      </PageShell>
    );
  }

  return (
    <PageShell
      title="Health"
      subtitle="Daily recovery, sleep, and body data — synced from Apple Health."
      action={
        <Link href="/profile" className="text-sm text-accent shrink-0">
          Log a value →
        </Link>
      }
    >
      <div className="mb-6">
        <HealthCard metrics={metrics} title="Latest" />
      </div>

      <HealthCharts metrics={metrics} />

      <RecentDaysTable metrics={metrics.slice(0, 14)} />
    </PageShell>
  );
}

const fmtSleep = (min: number) =>
  `${Math.floor(min / 60)}h${String(Math.round(min) % 60).padStart(2, "0")}`;

function RecentDaysTable({ metrics }: { metrics: HealthMetric[] }) {
  const dash = <span className="text-muted/50">—</span>;
  return (
    <Card className="p-5 mt-4">
      <h2 className="font-medium mb-3">Last 14 days</h2>
      <div className="overflow-x-auto -mx-5 px-5">
        <table className="w-full text-sm whitespace-nowrap">
          <thead>
            <tr className="text-xs uppercase tracking-wide text-muted text-left">
              <th className="font-medium py-2 pr-4">Date</th>
              <th className="font-medium py-2 pr-4 text-right">RHR</th>
              <th className="font-medium py-2 pr-4 text-right">HRV</th>
              <th className="font-medium py-2 pr-4 text-right">Sleep</th>
              <th className="font-medium py-2 pr-4 text-right">Steps</th>
              <th className="font-medium py-2 pr-4 text-right">Active</th>
              <th className="font-medium py-2 pr-4 text-right">Weight</th>
              <th className="font-medium py-2">Note</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border tabular-nums">
            {metrics.map((m) => (
              <tr key={m.date}>
                <td className="py-2 pr-4 text-muted">{formatDate(m.date)}</td>
                <td className="py-2 pr-4 text-right">{m.restingHr != null ? `${m.restingHr}` : dash}</td>
                <td className="py-2 pr-4 text-right">{m.hrv != null ? `${m.hrv}` : dash}</td>
                <td className="py-2 pr-4 text-right">{m.sleepMin != null ? fmtSleep(m.sleepMin) : dash}</td>
                <td className="py-2 pr-4 text-right">{m.steps != null ? m.steps.toLocaleString("en-GB") : dash}</td>
                <td className="py-2 pr-4 text-right">{m.activeKcal != null ? `${m.activeKcal} kcal` : dash}</td>
                <td className="py-2 pr-4 text-right">{m.weightKg != null ? `${m.weightKg.toFixed(1)} kg` : dash}</td>
                <td className="py-2 text-xs text-muted max-w-48 truncate">{m.notes ?? ""}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
