"use client";

import { useState } from "react";
import {
  ResponsiveContainer,
  ComposedChart,
  LineChart,
  Line,
  Area,
  BarChart,
  Bar,
  Cell,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from "recharts";
import type { SeriesPoint, LapSplit } from "@/lib/types";
import { formatPace, formatDuration, formatDistance } from "@/lib/parseRun";

const ACCENT = "#4f46e5";
const RED = "#e11d48";
const GREEN = "#059669";
const SKY = "#0ea5e9";
const GRID = "#eef0f3";

// Color laps by their interval type so work vs recovery reads at a glance.
export function intensityColor(label: string): string {
  const l = label.toLowerCase();
  if (/(active|work|interval|fast|tempo|hard|rep)/.test(l)) return ACCENT;
  if (/(recover|rest|easy)/.test(l)) return "#f59e0b";
  if (/warm/.test(l)) return "#94a3b8";
  if (/cool/.test(l)) return "#10b981";
  return ACCENT;
}

function paceTick(v: number) {
  if (!v || !Number.isFinite(v)) return "";
  const m = Math.floor(v / 60);
  const s = Math.round(v % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

// ---- Run detail: all metrics on one chart, each line toggleable ----
// Pace, heart rate, cadence and elevation share one X axis (distance) but each
// has its own hidden Y axis so they scale independently. Toggle chips switch
// each line on/off; the tooltip always shows real values with units.
type MetricKey = "pace" | "hr" | "spm" | "elev";

const METRICS: {
  key: MetricKey;
  label: string;
  color: string;
  unit: string;
  fmt: (v: number) => string;
}[] = [
  { key: "pace", label: "Pace", color: ACCENT, unit: "", fmt: (v) => formatPace(v) },
  { key: "hr", label: "Heart rate", color: RED, unit: "bpm", fmt: (v) => `${v} bpm` },
  { key: "spm", label: "Cadence", color: SKY, unit: "spm", fmt: (v) => `${v} spm` },
  { key: "elev", label: "Elevation", color: GREEN, unit: "m", fmt: (v) => `${Math.round(v)} m` },
];

export function CombinedChart({ series }: { series: SeriesPoint[] }) {
  const data = series.map((p) => ({
    km: +(p.distM / 1000).toFixed(2),
    pace: p.paceSecPerKm && p.paceSecPerKm < 1200 ? Math.round(p.paceSecPerKm) : null,
    hr: p.hr,
    spm: p.cadence ? Math.round(p.cadence * 2) : null, // watch logs per-leg; ×2 = steps/min
    elev: p.elevM,
  }));

  // Only offer a metric if the run actually has data for it.
  const available = METRICS.filter((m) => data.some((d) => d[m.key] != null));

  // Pace + heart rate on by default (the primary read); cadence/elevation opt-in.
  const [visible, setVisible] = useState<Record<MetricKey, boolean>>({
    pace: true,
    hr: true,
    spm: false,
    elev: false,
  });
  const toggle = (k: MetricKey) => setVisible((v) => ({ ...v, [k]: !v[k] }));
  const isOn = (k: MetricKey) => visible[k] && available.some((m) => m.key === k);

  return (
    <div>
      <div className="flex flex-wrap gap-2 mb-3">
        {available.map((m) => {
          const on = visible[m.key];
          return (
            <button
              key={m.key}
              onClick={() => toggle(m.key)}
              className={`flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium transition-colors ${
                on ? "border-transparent text-white" : "border-border text-muted hover:bg-black/5"
              }`}
              style={on ? { backgroundColor: m.color } : undefined}
              aria-pressed={on}
            >
              <span
                className="w-2 h-2 rounded-full"
                style={{ backgroundColor: on ? "#fff" : m.color }}
              />
              {m.label}
            </button>
          );
        })}
      </div>

      <ResponsiveContainer width="100%" height={280}>
        <ComposedChart data={data} margin={{ top: 8, right: 8, left: -8, bottom: 0 }}>
          <defs>
            <linearGradient id="elevFillCombined" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={GREEN} stopOpacity={0.25} />
              <stop offset="100%" stopColor={GREEN} stopOpacity={0.02} />
            </linearGradient>
          </defs>
          <CartesianGrid stroke={GRID} vertical={false} />
          <XAxis
            dataKey="km"
            fontSize={11}
            stroke="#9ca3af"
            tick={{ fill: "#9ca3af" }}
            tickLine={false}
            axisLine={false}
            unit="km"
          />
          {/* Independent hidden axes so each metric scales to its own range. */}
          <YAxis yAxisId="pace" hide reversed domain={["dataMin - 20", "dataMax + 20"]} />
          <YAxis yAxisId="hr" hide domain={["dataMin - 10", "dataMax + 10"]} />
          <YAxis yAxisId="spm" hide domain={["dataMin - 6", "dataMax + 6"]} />
          <YAxis yAxisId="elev" hide domain={["dataMin - 5", "dataMax + 5"]} />
          <Tooltip
            contentStyle={{ borderRadius: 10, border: "1px solid #e7e8ec", fontSize: 12 }}
            labelFormatter={(l) => `${l} km`}
            formatter={(value, name) => {
              const m = METRICS.find((x) => x.key === name);
              return m ? [m.fmt(value as number), m.label] : [value, name];
            }}
          />
          {/* Elevation first so it sits behind the lines. */}
          {isOn("elev") && (
            <Area
              yAxisId="elev"
              type="monotone"
              dataKey="elev"
              name="elev"
              stroke={GREEN}
              strokeWidth={1.5}
              fill="url(#elevFillCombined)"
              connectNulls
              isAnimationActive={false}
            />
          )}
          {isOn("pace") && (
            <Line
              yAxisId="pace"
              type="monotone"
              dataKey="pace"
              name="pace"
              stroke={ACCENT}
              strokeWidth={2}
              dot={false}
              connectNulls
              isAnimationActive={false}
            />
          )}
          {isOn("hr") && (
            <Line
              yAxisId="hr"
              type="monotone"
              dataKey="hr"
              name="hr"
              stroke={RED}
              strokeWidth={1.5}
              dot={false}
              connectNulls
              isAnimationActive={false}
            />
          )}
          {isOn("spm") && (
            <Line
              yAxisId="spm"
              type="monotone"
              dataKey="spm"
              name="spm"
              stroke={SKY}
              strokeWidth={1.5}
              dot={false}
              connectNulls
              isAnimationActive={false}
            />
          )}
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}

// ---- Run detail: km splits bar ----
export function SplitsChart({
  splits,
}: {
  splits: { km: number; paceSecPerKm: number }[];
}) {
  // Bars encode SPEED (km/h) so a faster split is a TALLER bar, while the axis
  // and tooltip stay in pace (min/km). speed = 3600 / paceSecPerKm.
  const data = splits.map((s) => ({
    km: `${s.km}`,
    pace: Math.round(s.paceSecPerKm),
    speed: s.paceSecPerKm > 0 ? 3600 / s.paceSecPerKm : 0,
  }));
  return (
    <ResponsiveContainer width="100%" height={180}>
      <BarChart data={data} margin={{ top: 8, right: 8, left: -8, bottom: 0 }}>
        <CartesianGrid stroke={GRID} vertical={false} />
        <XAxis
          dataKey="km"
          fontSize={11}
          stroke="#9ca3af"
          tick={{ fill: "#9ca3af" }}
          tickLine={false}
          axisLine={false}
        />
        <YAxis
          tickFormatter={(v) => paceTick(3600 / v)}
          fontSize={11}
          stroke="#9ca3af"
          tick={{ fill: "#9ca3af" }}
          tickLine={false}
          axisLine={false}
          domain={["dataMin - 0.8", "dataMax + 0.8"]}
          width={44}
        />
        <Tooltip
          contentStyle={{
            borderRadius: 10,
            border: "1px solid #e7e8ec",
            fontSize: 12,
          }}
          formatter={(_v, _n, item) => [
            formatPace((item?.payload as { pace: number }).pace),
            "Pace",
          ]}
          labelFormatter={(l) => `Km ${l}`}
          cursor={{ fill: "#f3f4f6" }}
        />
        <Bar dataKey="speed" fill={ACCENT} radius={[4, 4, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}

// ---- Run detail: pace per workout lap, colored by interval type ----
export function LapsChart({ laps }: { laps: LapSplit[] }) {
  // Bars encode SPEED (km/h) so a faster lap is a TALLER bar; axis + tooltip
  // stay in pace (min/km). speed = 3600 / paceSecPerKm.
  const data = laps
    .filter((l) => l.paceSecPerKm > 0)
    .map((l) => ({
      label: `${l.lap}`,
      intensity: l.intensity,
      pace: Math.round(l.paceSecPerKm),
      speed: 3600 / l.paceSecPerKm,
      distanceM: l.distanceM,
      durationSec: l.durationSec,
      color: intensityColor(l.intensity),
    }));
  return (
    <ResponsiveContainer width="100%" height={200}>
      <BarChart data={data} margin={{ top: 8, right: 8, left: -8, bottom: 0 }}>
        <CartesianGrid stroke={GRID} vertical={false} />
        <XAxis
          dataKey="label"
          fontSize={11}
          stroke="#9ca3af"
          tick={{ fill: "#9ca3af" }}
          tickLine={false}
          axisLine={false}
        />
        <YAxis
          tickFormatter={(v) => paceTick(3600 / v)}
          fontSize={11}
          stroke="#9ca3af"
          tick={{ fill: "#9ca3af" }}
          tickLine={false}
          axisLine={false}
          domain={["dataMin - 0.8", "dataMax + 0.8"]}
          width={44}
        />
        <Tooltip
          contentStyle={{
            borderRadius: 10,
            border: "1px solid #e7e8ec",
            fontSize: 12,
          }}
          cursor={{ fill: "#f3f4f6" }}
          formatter={(_v, _n, item) => {
            const p = item?.payload as {
              intensity: string;
              pace: number;
              distanceM: number;
              durationSec: number;
            };
            return [
              `${formatPace(p.pace)} · ${formatDistance(p.distanceM)} · ${formatDuration(p.durationSec)}`,
              p.intensity,
            ];
          }}
          labelFormatter={(l) => `Lap ${l}`}
        />
        <Bar dataKey="speed" radius={[4, 4, 0, 0]}>
          {data.map((d, i) => (
            <Cell key={i} fill={d.color} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

// ---- Dashboard: pace trend across runs ----
export function PaceTrendChart({
  trend,
}: {
  trend: { date: string; km: number; paceSecPerKm: number }[];
}) {
  if (trend.length < 2) {
    return (
      <div className="h-55 grid place-items-center text-sm text-muted">
        Upload at least two runs to see your pace trend.
      </div>
    );
  }
  return (
    <ResponsiveContainer width="100%" height={220}>
      <LineChart
        data={trend}
        margin={{ top: 8, right: 8, left: -8, bottom: 0 }}
      >
        <CartesianGrid stroke={GRID} vertical={false} />
        <XAxis
          dataKey="date"
          fontSize={11}
          stroke="#9ca3af"
          tick={{ fill: "#9ca3af" }}
          tickLine={false}
          axisLine={false}
          tickFormatter={(d) => (d as string).slice(5)}
        />
        <YAxis
          tickFormatter={paceTick}
          fontSize={11}
          stroke="#9ca3af"
          tick={{ fill: "#9ca3af" }}
          tickLine={false}
          axisLine={false}
          reversed
          domain={["dataMin - 20", "dataMax + 20"]}
          width={44}
        />
        <Tooltip
          contentStyle={{
            borderRadius: 10,
            border: "1px solid #e7e8ec",
            fontSize: 12,
          }}
          formatter={(v, n) =>
            n === "paceSecPerKm"
              ? [formatPace(v as number), "Avg pace"]
              : [v, n]
          }
          labelFormatter={(l) => l}
        />
        <Line
          type="monotone"
          dataKey="paceSecPerKm"
          stroke={ACCENT}
          strokeWidth={2}
          dot={{ r: 3, fill: ACCENT }}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}
