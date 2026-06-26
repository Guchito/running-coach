"use client";

import {
  ResponsiveContainer,
  LineChart,
  Line,
  AreaChart,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from "recharts";
import type { SeriesPoint } from "@/lib/types";
import { formatPace } from "@/lib/parseRun";

const ACCENT = "#4f46e5";
const RED = "#e11d48";
const GREEN = "#059669";
const GRID = "#eef0f3";

function paceTick(v: number) {
  if (!v || !Number.isFinite(v)) return "";
  const m = Math.floor(v / 60);
  const s = Math.round(v % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

// ---- Run detail: pace & HR over distance ----
export function RunDetailChart({ series }: { series: SeriesPoint[] }) {
  const data = series.map((p) => ({
    km: +(p.distM / 1000).toFixed(2),
    pace:
      p.paceSecPerKm && p.paceSecPerKm < 1200
        ? Math.round(p.paceSecPerKm)
        : null,
    hr: p.hr,
  }));
  return (
    <ResponsiveContainer width="100%" height={240}>
      <LineChart data={data} margin={{ top: 8, right: 8, left: -8, bottom: 0 }}>
        <CartesianGrid stroke={GRID} vertical={false} />
        <XAxis
          dataKey="km"
          tickFormatter={(v) => `${v}`}
          fontSize={11}
          stroke="#9ca3af"
          tick={{ fill: "#9ca3af" }}
          tickLine={false}
          axisLine={false}
          unit="km"
        />
        <YAxis
          yAxisId="pace"
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
        <YAxis
          yAxisId="hr"
          orientation="right"
          fontSize={11}
          stroke="#9ca3af"
          tick={{ fill: "#9ca3af" }}
          tickLine={false}
          axisLine={false}
          domain={["dataMin - 10", "dataMax + 10"]}
          width={32}
        />
        <Tooltip
          contentStyle={{
            borderRadius: 10,
            border: "1px solid #e7e8ec",
            fontSize: 12,
          }}
          formatter={(value, name) =>
            name === "pace"
              ? [formatPace(value as number), "Pace"]
              : [`${value} bpm`, "Heart rate"]
          }
          labelFormatter={(l) => `${l} km`}
        />
        <Line
          yAxisId="pace"
          type="monotone"
          dataKey="pace"
          stroke={ACCENT}
          strokeWidth={2}
          dot={false}
          connectNulls
          name="pace"
        />
        <Line
          yAxisId="hr"
          type="monotone"
          dataKey="hr"
          stroke={RED}
          strokeWidth={1.5}
          dot={false}
          connectNulls
          name="hr"
        />
      </LineChart>
    </ResponsiveContainer>
  );
}

// ---- Run detail: elevation profile ----
export function ElevationChart({ series }: { series: SeriesPoint[] }) {
  const data = series.map((p) => ({
    km: +(p.distM / 1000).toFixed(2),
    elev: p.elevM,
  }));
  return (
    <ResponsiveContainer width="100%" height={140}>
      <AreaChart data={data} margin={{ top: 8, right: 8, left: -8, bottom: 0 }}>
        <defs>
          <linearGradient id="elevFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={GREEN} stopOpacity={0.35} />
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
        <YAxis
          fontSize={11}
          stroke="#9ca3af"
          tick={{ fill: "#9ca3af" }}
          tickLine={false}
          axisLine={false}
          width={38}
          unit="m"
        />
        <Tooltip
          contentStyle={{
            borderRadius: 10,
            border: "1px solid #e7e8ec",
            fontSize: 12,
          }}
          formatter={(v) => [`${Math.round(v as number)} m`, "Elevation"]}
          labelFormatter={(l) => `${l} km`}
        />
        <Area
          type="monotone"
          dataKey="elev"
          stroke={GREEN}
          strokeWidth={1.5}
          fill="url(#elevFill)"
          connectNulls
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}

// ---- Run detail: km splits bar ----
export function SplitsChart({
  splits,
}: {
  splits: { km: number; paceSecPerKm: number }[];
}) {
  const data = splits.map((s) => ({
    km: `${s.km}`,
    pace: Math.round(s.paceSecPerKm),
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
          tickFormatter={paceTick}
          fontSize={11}
          stroke="#9ca3af"
          tick={{ fill: "#9ca3af" }}
          tickLine={false}
          axisLine={false}
          reversed
          domain={["dataMin - 15", "dataMax + 15"]}
          width={44}
        />
        <Tooltip
          contentStyle={{
            borderRadius: 10,
            border: "1px solid #e7e8ec",
            fontSize: 12,
          }}
          formatter={(v) => [formatPace(v as number), "Pace"]}
          labelFormatter={(l) => `Km ${l}`}
          cursor={{ fill: "#f3f4f6" }}
        />
        <Bar dataKey="pace" fill={ACCENT} radius={[4, 4, 0, 0]} />
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
