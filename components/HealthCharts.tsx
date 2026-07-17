"use client";

import { useState } from "react";
import {
  ResponsiveContainer,
  ComposedChart,
  Line,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from "recharts";
import { Card } from "@/components/ui";
import type { HealthMetric } from "@/lib/types";
import { formatDate } from "@/lib/parseRun";

// Progression charts for the Health page: everything the HealthFit sheet
// syncs, over a selectable range. One shared range control; charts hide
// themselves when the range holds no data for them.

const ACCENT = "#2563eb";
const RED = "#e11d48";
const AMBER = "#f59e0b";
const SKY = "#0ea5e9";
const VIOLET = "#8b5cf6";
const NAVY = "#1e3a8a";
const GREEN = "#059669";
const GRID = "#eef0f3";

const RANGES = [
  { key: "30", label: "30d", days: 30 },
  { key: "90", label: "90d", days: 90 },
  { key: "365", label: "1y", days: 365 },
  { key: "all", label: "All", days: Infinity },
] as const;
type RangeKey = (typeof RANGES)[number]["key"];

function dayMonthTick(d: string): string {
  const [, m, day] = d.split("-");
  return `${day}-${m}`;
}

const fmtSleep = (min: number) =>
  `${Math.floor(min / 60)}h${String(Math.round(min) % 60).padStart(2, "0")}`;

const axisProps = {
  fontSize: 11,
  stroke: "#9ca3af",
  tick: { fill: "#9ca3af" },
  tickLine: false,
  axisLine: false,
} as const;

const tooltipStyle = {
  borderRadius: 10,
  border: "1px solid #e7e8ec",
  fontSize: 12,
} as const;

function ChartCard({
  title,
  caption,
  className = "",
  summary,
  children,
}: {
  title: string;
  caption: string;
  className?: string;
  // Optional block between the header and the chart (e.g. sleep averages).
  summary?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <Card className={`p-5 ${className}`}>
      <div className="flex items-center justify-between mb-3 gap-3">
        <h2 className="font-medium">{title}</h2>
        <span className="text-xs text-muted text-right">{caption}</span>
      </div>
      {summary}
      <div style={{ height: 220 }}>
        <ResponsiveContainer width="100%" height={220}>
          {children as React.ReactElement}
        </ResponsiveContainer>
      </div>
    </Card>
  );
}

// 7-day vs 30-day sleep averages, per stage. Computed over ALL metrics (the
// range chips shouldn't change what "last week" means).
type SleepAvgs = {
  asleep: number | null;
  deep: number | null;
  core: number | null;
  rem: number | null;
  awake: number | null;
  inBed: number | null;
};

function sleepAverages(metrics: HealthMetric[], days: number): SleepAvgs {
  const cutoff = new Date(Date.now() - days * 86400000).toISOString().slice(0, 10);
  // Only nights that were actually tracked: days without a sleep row (watch
  // not worn) are already null, and a 0-minute total is an artifact of the
  // same thing — neither should drag the averages down.
  const rows = metrics.filter((m) => m.date >= cutoff && m.sleepMin != null && m.sleepMin > 0);
  const avgOf = (get: (m: HealthMetric) => number | null) => {
    const vals = rows.map(get).filter((v): v is number => v != null);
    return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
  };
  return {
    asleep: avgOf((m) => m.sleepMin),
    deep: avgOf((m) => m.sleepDeepMin),
    core: avgOf((m) => m.sleepCoreMin),
    rem: avgOf((m) => m.sleepRemMin),
    awake: avgOf((m) => m.sleepAwakeMin),
    inBed: avgOf((m) => m.inBedMin),
  };
}

const SLEEP_COLS: { key: keyof SleepAvgs; label: string; dot?: string }[] = [
  { key: "asleep", label: "Asleep" },
  { key: "deep", label: "Deep", dot: NAVY },
  { key: "core", label: "Core", dot: SKY },
  { key: "rem", label: "REM", dot: VIOLET },
  { key: "awake", label: "Awake", dot: AMBER },
  { key: "inBed", label: "In bed" },
];

// Custom tooltip: the stacked bars only carry the stages, but the first thing
// you want on hover is the night's TOTAL — lead with it, then the breakdown.
function SleepTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: { payload: HealthMetric }[];
  label?: string;
}) {
  if (!active || !payload?.length) return null;
  const m = payload[0].payload;
  const stages: { label: string; value: number | null; dot?: string }[] = [
    { label: "Deep", value: m.sleepDeepMin, dot: NAVY },
    { label: "Core", value: m.sleepCoreMin, dot: SKY },
    { label: "REM", value: m.sleepRemMin, dot: VIOLET },
    { label: "Awake", value: m.sleepAwakeMin, dot: AMBER },
  ];
  return (
    <div className="rounded-[10px] border border-border bg-card text-xs px-2.5 py-2 shadow-sm">
      <div className="font-medium mb-1">{formatDate(label ?? "")}</div>
      {m.sleepMin != null && (
        <div className="flex items-center justify-between gap-4">
          <span className="text-muted">Asleep</span>
          <span className="font-medium tabular-nums">{fmtSleep(m.sleepMin)}</span>
        </div>
      )}
      {m.inBedMin != null && (
        <div className="flex items-center justify-between gap-4">
          <span className="text-muted">In bed</span>
          <span className="tabular-nums">{fmtSleep(m.inBedMin)}</span>
        </div>
      )}
      {stages.some((s) => s.value != null) && (
        <div className="mt-1 pt-1 border-t border-border space-y-0.5">
          {stages.map(
            (s) =>
              s.value != null && (
                <div key={s.label} className="flex items-center justify-between gap-4">
                  <span className="text-muted inline-flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full" style={{ backgroundColor: s.dot }} />
                    {s.label}
                  </span>
                  <span className="tabular-nums">{fmtSleep(s.value)}</span>
                </div>
              )
          )}
        </div>
      )}
    </div>
  );
}

function SleepSummary({ metrics }: { metrics: HealthMetric[] }) {
  const week = sleepAverages(metrics, 7);
  const month = sleepAverages(metrics, 30);
  if (week.asleep == null || month.asleep == null) return null;
  const delta = Math.round(week.asleep - month.asleep);
  return (
    <div className="mb-4">
      <div className="overflow-x-auto -mx-5 px-5">
        <table className="text-sm whitespace-nowrap">
          <thead>
            <tr className="text-xs uppercase tracking-wide text-muted text-left">
              <th className="font-medium py-1.5 pr-5" />
              {SLEEP_COLS.map((c) => (
                <th key={c.key} className="font-medium py-1.5 pr-5 text-right">
                  <span className="inline-flex items-center gap-1.5">
                    {c.dot && (
                      <span className="w-2 h-2 rounded-full" style={{ backgroundColor: c.dot }} />
                    )}
                    {c.label}
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="tabular-nums">
            {(
              [
                ["Last 7 days", week],
                ["Last 30 days", month],
              ] as const
            ).map(([label, avgs]) => (
              <tr key={label} className="border-t border-border">
                <td className="py-1.5 pr-5 text-muted">{label}</td>
                {SLEEP_COLS.map((c) => (
                  <td
                    key={c.key}
                    className={`py-1.5 pr-5 text-right ${c.key === "asleep" ? "font-medium" : ""}`}
                  >
                    {avgs[c.key] != null ? fmtSleep(avgs[c.key]!) : <span className="text-muted/50">—</span>}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {delta !== 0 && (
        <div className={`text-xs mt-2 ${delta > 0 ? "text-emerald-600" : "text-rose-600"}`}>
          {delta > 0 ? "↑" : "↓"} {Math.abs(delta)} min {delta > 0 ? "more" : "less"} sleep per night
          this week than your 30-day average.
        </div>
      )}
    </div>
  );
}

export function HealthCharts({ metrics }: { metrics: HealthMetric[] }) {
  const [range, setRange] = useState<RangeKey>("90");
  const days = RANGES.find((r) => r.key === range)!.days;
  const cutoff =
    days === Infinity ? null : new Date(Date.now() - days * 86400000).toISOString().slice(0, 10);

  // Stored newest-first → chronological for the X axis.
  const data = metrics
    .filter((m) => !cutoff || m.date >= cutoff)
    .slice()
    .reverse()
    .map((m) => ({
      ...m,
      // Sleep stages stack; when a day only has a total, show it as one block.
      sleepOnly:
        m.sleepMin != null &&
        m.sleepCoreMin == null &&
        m.sleepDeepMin == null &&
        m.sleepRemMin == null
          ? m.sleepMin
          : null,
    }));

  const has = (get: (m: HealthMetric) => number | null) => data.some((m) => get(m) != null);

  return (
    <>
      <div className="flex gap-2 mb-4">
        {RANGES.map((r) => (
          <button
            key={r.key}
            onClick={() => setRange(r.key)}
            aria-pressed={range === r.key}
            className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
              range === r.key
                ? "border-transparent bg-ink text-white"
                : "border-border text-muted hover:bg-black/4"
            }`}
          >
            {r.label}
          </button>
        ))}
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {has((m) => m.sleepMin) && (
          <ChartCard
            title="Sleep"
            caption="stacked stages · deep + core + REM + awake"
            className="md:col-span-2"
            summary={<SleepSummary metrics={metrics} />}
          >
            <ComposedChart data={data} margin={{ top: 8, right: 0, left: -8, bottom: 0 }}>
              <CartesianGrid stroke={GRID} vertical={false} />
              <XAxis dataKey="date" {...axisProps} tickFormatter={dayMonthTick} minTickGap={24} />
              <YAxis {...axisProps} tickFormatter={(v) => `${Math.round(v / 60)}h`} width={36} />
              <Tooltip content={<SleepTooltip />} />
              <Bar dataKey="sleepDeepMin" stackId="s" fill={NAVY} />
              <Bar dataKey="sleepCoreMin" stackId="s" fill={SKY} />
              <Bar dataKey="sleepRemMin" stackId="s" fill={VIOLET} />
              <Bar dataKey="sleepAwakeMin" stackId="s" fill={AMBER} />
              <Bar dataKey="sleepOnly" stackId="s" fill={SKY} />
            </ComposedChart>
          </ChartCard>
        )}

        {has((m) => m.restingHr) && (
          <ChartCard title="Resting HR & HRV" caption="recovery — falling RHR, rising HRV = fitter">
            <ComposedChart data={data} margin={{ top: 8, right: 0, left: -8, bottom: 0 }}>
              <CartesianGrid stroke={GRID} vertical={false} />
              <XAxis dataKey="date" {...axisProps} tickFormatter={dayMonthTick} minTickGap={24} />
              <YAxis yAxisId="rhr" {...axisProps} stroke={RED} tick={{ fill: RED }} domain={["dataMin - 4", "dataMax + 4"]} width={36} />
              <YAxis yAxisId="hrv" orientation="right" {...axisProps} stroke={ACCENT} tick={{ fill: ACCENT }} domain={["dataMin - 6", "dataMax + 6"]} width={36} />
              <Tooltip
                contentStyle={tooltipStyle}
                labelFormatter={(l) => formatDate(String(l))}
                formatter={(v, name) =>
                  name === "restingHr" ? [`${v} bpm`, "Resting HR"] : [`${v} ms`, "HRV"]
                }
              />
              <Line yAxisId="rhr" type="monotone" dataKey="restingHr" stroke={RED} strokeWidth={2} dot={false} connectNulls />
              <Line yAxisId="hrv" type="monotone" dataKey="hrv" stroke={ACCENT} strokeWidth={2} dot={false} connectNulls />
            </ComposedChart>
          </ChartCard>
        )}

        {has((m) => m.weightKg) && (
          <ChartCard title="Weight & body fat" caption="from your scale syncs">
            <ComposedChart data={data} margin={{ top: 8, right: 0, left: -8, bottom: 0 }}>
              <CartesianGrid stroke={GRID} vertical={false} />
              <XAxis dataKey="date" {...axisProps} tickFormatter={dayMonthTick} minTickGap={24} />
              <YAxis yAxisId="kg" {...axisProps} domain={["dataMin - 1", "dataMax + 1"]} tickFormatter={(v) => `${v}`} width={36} />
              <YAxis yAxisId="fat" orientation="right" {...axisProps} stroke={AMBER} tick={{ fill: AMBER }} domain={["dataMin - 2", "dataMax + 2"]} tickFormatter={(v) => `${v}%`} width={36} />
              <Tooltip
                contentStyle={tooltipStyle}
                labelFormatter={(l) => formatDate(String(l))}
                formatter={(v, name) =>
                  name === "weightKg" ? [`${Number(v).toFixed(1)} kg`, "Weight"] : [`${v}%`, "Body fat"]
                }
              />
              <Line yAxisId="kg" type="monotone" dataKey="weightKg" stroke={ACCENT} strokeWidth={2} dot={{ r: 2.5, fill: ACCENT }} connectNulls />
              <Line yAxisId="fat" type="monotone" dataKey="bodyFatPct" stroke={AMBER} strokeWidth={1.5} strokeDasharray="4 3" dot={{ r: 2.5, fill: AMBER }} connectNulls />
            </ComposedChart>
          </ChartCard>
        )}

        {has((m) => m.steps) && (
          <ChartCard title="Activity" caption="steps · active energy">
            <ComposedChart data={data} margin={{ top: 8, right: 0, left: -8, bottom: 0 }}>
              <CartesianGrid stroke={GRID} vertical={false} />
              <XAxis dataKey="date" {...axisProps} tickFormatter={dayMonthTick} minTickGap={24} />
              <YAxis yAxisId="steps" {...axisProps} tickFormatter={(v) => `${Math.round(v / 1000)}k`} width={36} />
              <YAxis yAxisId="kcal" orientation="right" {...axisProps} stroke={AMBER} tick={{ fill: AMBER }} width={40} />
              <Tooltip
                contentStyle={tooltipStyle}
                labelFormatter={(l) => formatDate(String(l))}
                formatter={(v, name) =>
                  name === "steps"
                    ? [Number(v).toLocaleString("en-GB"), "Steps"]
                    : [`${v} kcal`, "Active energy"]
                }
              />
              <Bar yAxisId="steps" dataKey="steps" fill="#dbeafe" radius={[3, 3, 0, 0]} />
              <Line yAxisId="kcal" type="monotone" dataKey="activeKcal" stroke={AMBER} strokeWidth={1.5} dot={false} connectNulls />
            </ComposedChart>
          </ChartCard>
        )}

        {has((m) => m.vo2Max) && (
          <ChartCard title="VO₂ max" caption="aerobic ceiling — the long game">
            <ComposedChart data={data} margin={{ top: 8, right: 0, left: -8, bottom: 0 }}>
              <CartesianGrid stroke={GRID} vertical={false} />
              <XAxis dataKey="date" {...axisProps} tickFormatter={dayMonthTick} minTickGap={24} />
              <YAxis {...axisProps} domain={["dataMin - 1", "dataMax + 1"]} width={36} />
              <Tooltip
                contentStyle={tooltipStyle}
                labelFormatter={(l) => formatDate(String(l))}
                formatter={(v) => [`${Number(v).toFixed(1)}`, "VO₂ max"]}
              />
              <Line type="monotone" dataKey="vo2Max" stroke={GREEN} strokeWidth={2} dot={{ r: 2.5, fill: GREEN }} connectNulls />
            </ComposedChart>
          </ChartCard>
        )}
      </div>
    </>
  );
}
