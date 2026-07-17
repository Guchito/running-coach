import Link from "next/link";
import { Card } from "@/components/ui";
import type { HealthMetric } from "@/lib/types";

// Daily health snapshot from the synced HealthFit sheet: latest value per
// metric plus a 7-day-vs-previous-7-day trend. Server-rendered; hidden
// entirely until the first health sync lands.

type MetricDef = {
  label: string;
  get: (m: HealthMetric) => number | null;
  fmt: (v: number) => string;
  // Whether a falling value is good (resting HR) or bad (HRV, sleep).
  goodWhenLower?: boolean;
  // Show a delta only when it means something (weight noise, single kcal).
  minDelta: number;
};

const fmtMin = (v: number) => `${Math.floor(v / 60)}h${String(Math.round(v) % 60).padStart(2, "0")}`;
const fmtInt = (v: number) => String(Math.round(v));

const METRICS: MetricDef[] = [
  { label: "Resting HR", get: (m) => m.restingHr, fmt: (v) => `${fmtInt(v)} bpm`, goodWhenLower: true, minDelta: 1 },
  { label: "HRV", get: (m) => m.hrv, fmt: (v) => `${fmtInt(v)} ms`, minDelta: 1 },
  // 0-minute sleep = watch not worn that night, not a real measurement.
  { label: "Sleep", get: (m) => (m.sleepMin ? m.sleepMin : null), fmt: fmtMin, minDelta: 10 },
  { label: "Weight", get: (m) => m.weightKg, fmt: (v) => `${v.toFixed(1)} kg`, minDelta: 0.2 },
  { label: "Steps", get: (m) => m.steps, fmt: (v) => Math.round(v).toLocaleString("en-GB"), minDelta: 500 },
  { label: "VO₂ max", get: (m) => m.vo2Max, fmt: (v) => v.toFixed(1), minDelta: 0.1 },
];

function avg(values: number[]): number | null {
  if (!values.length) return null;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

// Average of a metric over metrics whose date falls in [from, to) days ago.
function windowAvg(
  metrics: HealthMetric[],
  get: MetricDef["get"],
  from: number,
  to: number
): number | null {
  const now = Date.now();
  const vals = metrics
    .filter((m) => {
      const age = (now - Date.parse(m.date)) / 86400000;
      return age >= from && age < to;
    })
    .map(get)
    .filter((v): v is number => v != null);
  return avg(vals);
}

export function HealthCard({
  metrics,
  title = "Health",
  href,
}: {
  metrics: HealthMetric[];
  title?: string;
  // When set, the header links there (the dashboard points at /health).
  href?: string;
}) {
  if (!metrics.length) return null;
  const latestDate = metrics[0].date;

  const rows = METRICS.map((def) => {
    const latest = metrics.map(def.get).find((v) => v != null) ?? null;
    const week = windowAvg(metrics, def.get, 0, 7);
    const prev = windowAvg(metrics, def.get, 7, 14);
    const delta = week != null && prev != null ? week - prev : null;
    return { def, latest, delta };
  }).filter((r) => r.latest != null);

  if (!rows.length) return null;

  return (
    <Card className="p-5 mb-6">
      <div className="flex items-center justify-between mb-3">
        <h2 className="font-medium">{title}</h2>
        {href ? (
          <Link href={href} className="text-sm text-accent">
            All data →
          </Link>
        ) : (
          <span className="text-xs text-muted">daily from Apple Health · {latestDate}</span>
        )}
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-6 gap-y-4">
        {rows.map(({ def, latest, delta }) => {
          const show = delta != null && Math.abs(delta) >= def.minDelta;
          const improving = show && (def.goodWhenLower ? delta! < 0 : delta! > 0);
          return (
            <div key={def.label} className="min-w-0">
              <div className="text-xs text-muted mb-1">{def.label}</div>
              <div className="font-mono text-xl font-semibold tracking-tight tabular-nums leading-none">
                {def.fmt(latest!)}
              </div>
              {show && (
                <div className={`text-xs mt-1.5 ${improving ? "text-emerald-600" : "text-rose-600"}`}>
                  {delta! > 0 ? "↑" : "↓"} {def.fmt(Math.abs(delta!))} vs prev week
                </div>
              )}
            </div>
          );
        })}
      </div>
    </Card>
  );
}
