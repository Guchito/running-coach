"use client";

import { useEffect, useRef, useState } from "react";
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
  ReferenceLine,
} from "recharts";
import { useRouter } from "next/navigation";
import type { SeriesPoint, LapSplit } from "@/lib/types";
import { formatPace, formatDuration, formatDistance, formatDate } from "@/lib/parseRun";

const ACCENT = "#2563eb";
const INK = "#16161a";
const CADENCE = "#f59e0b";
const RED = "#e11d48";
const GREEN = "#059669";
const SKY = "#0ea5e9";
const GRID = "#eef0f3";

// First-view gate for below-the-fold charts: the chart (and its draw-in
// animation) mounts when the placeholder first scrolls into view, so the
// animation isn't spent while the chart is off-screen.
function useInView<T extends HTMLElement>(threshold = 0.35) {
  const ref = useRef<T | null>(null);
  const [inView, setInView] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === "undefined") {
      setInView(true);
      return;
    }
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setInView(true);
          io.disconnect();
        }
      },
      { threshold }
    );
    io.observe(el);
    return () => io.disconnect();
  }, [threshold]);
  return { ref, inView };
}

// Reserves the chart's height, mounts the chart on first view. Mounting is
// what starts recharts' draw-in, so the animation happens where you can see it.
function InViewChart({
  height,
  children,
}: {
  height: number;
  children: React.ReactElement;
}) {
  const { ref, inView } = useInView<HTMLDivElement>();
  return (
    <div ref={ref} style={{ height }}>
      {inView && (
        <ResponsiveContainer width="100%" height={height}>
          {children}
        </ResponsiveContainer>
      )}
    </div>
  );
}

// Color laps by their interval type so work vs recovery reads at a glance.
// Work reps get the sole bold color (the app accent); the rest stays muted so
// the interval structure pops: amber warm up, slate recovery, sky cool down.
export function intensityColor(label: string): string {
  const l = label.toLowerCase();
  if (/warm/.test(l)) return "#f59e0b";
  if (/cool/.test(l)) return SKY;
  if (/(recover|rest|easy)/.test(l)) return "#94a3b8";
  if (/(active|work|interval|fast|tempo|hard|rep)/.test(l)) return ACCENT;
  return ACCENT;
}

function paceTick(v: number) {
  if (!v || !Number.isFinite(v)) return "";
  const t = Math.round(v);
  return `${Math.floor(t / 60)}:${(t % 60).toString().padStart(2, "0")}`;
}

// Pace axes land on round paces (5:30, 6:00…) instead of whatever recharts
// interpolates (5:26, 6:31…). Returns a snapped domain plus its ticks.
export function paceAxis(paces: number[], pad = 20): { domain: [number, number]; ticks: number[] } {
  const v = paces.filter((p) => p > 0 && Number.isFinite(p));
  if (!v.length) return { domain: [240, 480], ticks: [240, 300, 360, 420, 480] };
  const lo0 = Math.min(...v) - pad, hi0 = Math.max(...v) + pad;
  const span = hi0 - lo0;
  const step = span <= 150 ? 30 : span <= 360 ? 60 : 120;
  const lo = Math.floor(lo0 / step) * step, hi = Math.ceil(hi0 / step) * step;
  const ticks: number[] = [];
  for (let t = lo; t <= hi; t += step) ticks.push(t);
  return { domain: [lo, hi], ticks };
}

// Same, for bar charts that plot speed (3600 / pace) so faster = taller.
function speedAxis(paces: number[]) {
  const { domain, ticks } = paceAxis(paces, 10);
  return { domain: [3600 / domain[1], 3600 / domain[0]] as [number, number], ticks: ticks.map((t) => 3600 / t) };
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
  // Padding around the data range for this metric's independent Y scale.
  domain: [string, string];
  // Compact axis-tick label (no unit; the colored axis conveys which metric).
  tick: (v: number) => string;
}[] = [
  { key: "pace", label: "Pace", color: ACCENT, unit: "", fmt: (v) => formatPace(v), domain: ["dataMin - 20", "dataMax + 20"], tick: (v) => paceTick(v) },
  { key: "hr", label: "Heart rate", color: RED, unit: "bpm", fmt: (v) => `${v} bpm`, domain: ["dataMin - 10", "dataMax + 10"], tick: (v) => `${Math.round(v)}` },
  { key: "spm", label: "Cadence", color: CADENCE, unit: "spm", fmt: (v) => `${v} spm`, domain: ["dataMin - 6", "dataMax + 6"], tick: (v) => `${Math.round(v)}` },
  { key: "elev", label: "Elevation", color: GREEN, unit: "m", fmt: (v) => `${Math.round(v)} m`, domain: ["dataMin - 5", "dataMax + 5"], tick: (v) => `${Math.round(v)}` },
];

// Which metrics claim a visible axis, in priority order, when more than two are
// on at once. Pace and heart rate win by default; cadence/elevation only get an
// axis if a higher-priority one is toggled off.
const AXIS_PRIORITY: MetricKey[] = ["pace", "hr", "spm", "elev"];

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
  // Toggling on mounts the series and recharts draws it in start-to-end.
  // Toggling off plays the reverse: a clip wipe that empties the series from
  // its end back to the start (WAAPI on the layer), then unmounts.
  const wrapRef = useRef<HTMLDivElement>(null);
  const [exiting, setExiting] = useState<Partial<Record<MetricKey, boolean>>>({});
  const exitTimers = useRef<Partial<Record<MetricKey, ReturnType<typeof setTimeout>>>>({});
  useEffect(() => {
    const timers = exitTimers.current;
    return () => Object.values(timers).forEach((t) => t && clearTimeout(t));
  }, []);
  const layerFor = (k: MetricKey) =>
    wrapRef.current?.querySelector<SVGGElement>(`.metric-layer-${k}`) ?? null;
  const toggle = (k: MetricKey) => {
    const t = exitTimers.current[k];
    if (t) clearTimeout(t);
    if (visible[k]) {
      setVisible((v) => ({ ...v, [k]: false }));
      const layer = layerFor(k);
      const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      if (layer?.animate && !reduce) {
        setExiting((e) => ({ ...e, [k]: true }));
        // Right inset grows → the line retracts from its end toward the start.
        layer.animate(
          [{ clipPath: "inset(0 0 0 0)" }, { clipPath: "inset(0 100% 0 0)" }],
          { duration: 400, easing: "cubic-bezier(0.23, 1, 0.32, 1)", fill: "forwards" }
        );
        exitTimers.current[k] = setTimeout(
          () => setExiting((e) => ({ ...e, [k]: false })),
          410
        );
      }
    } else {
      // Re-enabling mid-exit: cancel the wipe so the series snaps back whole.
      layerFor(k)
        ?.getAnimations()
        .forEach((a) => a.cancel());
      setExiting((e) => ({ ...e, [k]: false }));
      setVisible((v) => ({ ...v, [k]: true }));
    }
  };
  const isOn = (k: MetricKey) => visible[k] && available.some((m) => m.key === k);
  const paceAx = paceAxis(data.map((d) => d.pace ?? 0));
  // A series renders while on OR while wiping out.
  const showSeries = (k: MetricKey) => isOn(k) || !!exiting[k];
  const seriesCls = (k: MetricKey) => `metric-layer-${k}`;

  // At most two visible axes: the two highest-priority metrics currently on get
  // one each — first → left, second → right. The rest still scale to their own
  // hidden axis (values via the tooltip).
  const axisMetrics = AXIS_PRIORITY.filter(isOn).slice(0, 2);
  const axisSide: Partial<Record<MetricKey, "left" | "right">> = {};
  if (axisMetrics[0]) axisSide[axisMetrics[0]] = "left";
  if (axisMetrics[1]) axisSide[axisMetrics[1]] = "right";

  return (
    <div ref={wrapRef}>
      <div className="flex flex-wrap gap-2 mb-3">
        {available.map((m) => {
          const on = visible[m.key];
          return (
            <button
              key={m.key}
              onClick={() => toggle(m.key)}
              className={`flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium transition-colors ${
                on ? "border-transparent text-white" : "border-border text-muted hover:bg-black/4"
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

      <InViewChart height={280}>
        <ComposedChart data={data} margin={{ top: 8, right: 0, left: 0, bottom: 0 }}>
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
          {/* One axis per metric so each scales to its own range. Up to two are
              shown (color-coded, left/right); the rest stay hidden but still
              drive their line's scale. */}
          {METRICS.map((m) => {
            const side = axisSide[m.key];
            return (
              <YAxis
                key={m.key}
                yAxisId={m.key}
                orientation={side === "right" ? "right" : "left"}
                hide={!side}
                reversed={m.key === "pace"}
                domain={m.key === "pace" ? paceAx.domain : m.domain}
                ticks={m.key === "pace" ? paceAx.ticks : undefined}
                interval={0}
                width={side ? 44 : 0}
                fontSize={11}
                stroke={m.color}
                tick={{ fill: m.color }}
                tickFormatter={m.tick}
                tickLine={false}
                axisLine={false}
              />
            );
          })}
          <Tooltip
            contentStyle={{ borderRadius: 10, border: "1px solid #e7e8ec", fontSize: 12 }}
            labelFormatter={(l) => `${l} km`}
            formatter={(value, name) => {
              const m = METRICS.find((x) => x.key === name);
              return m ? [m.fmt(value as number), m.label] : [value, name];
            }}
          />
          {/* Elevation first so it sits behind the lines. */}
          {showSeries("elev") && (
            <Area
              key="elev"
              className={seriesCls("elev")}
              yAxisId="elev"
              type="monotone"
              dataKey="elev"
              name="elev"
              stroke={GREEN}
              strokeWidth={1.5}
              fill="url(#elevFillCombined)"
              connectNulls
              animationDuration={500}
              animationEasing="ease-out"
            />
          )}
          {showSeries("pace") && (
            <Line
              key="pace"
              className={seriesCls("pace")}
              yAxisId="pace"
              type="monotone"
              dataKey="pace"
              name="pace"
              stroke={ACCENT}
              strokeWidth={2}
              dot={false}
              connectNulls
              animationDuration={500}
              animationEasing="ease-out"
            />
          )}
          {showSeries("hr") && (
            <Line
              key="hr"
              className={seriesCls("hr")}
              yAxisId="hr"
              type="monotone"
              dataKey="hr"
              name="hr"
              stroke={RED}
              strokeWidth={1.5}
              dot={false}
              connectNulls
              animationDuration={500}
              animationEasing="ease-out"
            />
          )}
          {showSeries("spm") && (
            <Line
              key="spm"
              className={seriesCls("spm")}
              yAxisId="spm"
              type="monotone"
              dataKey="spm"
              name="spm"
              stroke={CADENCE}
              strokeWidth={1.5}
              dot={false}
              connectNulls
              animationDuration={500}
              animationEasing="ease-out"
            />
          )}
        </ComposedChart>
      </InViewChart>
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
  const ax = speedAxis(data.map((d) => d.pace));
  return (
    <InViewChart height={180}>
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
          domain={ax.domain}
          ticks={ax.ticks}
          interval={0}
          allowDataOverflow
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
        <Bar
          dataKey="speed"
          fill={ACCENT}
          radius={[4, 4, 0, 0]}
          animationDuration={600}
          animationEasing="ease-out"
        />
      </BarChart>
    </InViewChart>
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
  const ax = speedAxis(data.map((d) => d.pace));
  return (
    <InViewChart height={200}>
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
          domain={ax.domain}
          ticks={ax.ticks}
          interval={0}
          allowDataOverflow
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
        <Bar
          dataKey="speed"
          radius={[4, 4, 0, 0]}
          animationDuration={600}
          animationEasing="ease-out"
        >
          {data.map((d, i) => (
            <Cell key={i} fill={d.color} />
          ))}
        </Bar>
      </BarChart>
    </InViewChart>
  );
}

// ---- Dashboard: pace & distance trends across runs ----
type TrendPoint = { date: string; km: number; paceSecPerKm: number };

// Day-month tick for the trend X axes (data key is a YYYY-MM-DD string).
function dayMonthTick(d: string): string {
  // "22 Nov": a dd-mm tick (22-11) reads like a score, not a date.
  const [, m, day] = d.split("-");
  return `${Number(day)} ${["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"][Number(m) - 1] ?? m}`;
}

// Shared tooltip: always shows BOTH the run's pace and its distance, whichever
// metric the chart plots. `active`/`payload`/`label` come from Recharts.
function TrendTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: { payload: TrendPoint }[];
  label?: string;
}) {
  if (!active || !payload?.length) return null;
  const p = payload[0].payload;
  return (
    <div className="rounded-[10px] border border-border bg-card text-xs px-2.5 py-2 shadow-sm">
      <div className="font-medium mb-1">{formatDate(label ?? "")}</div>
      <div className="text-muted">
        Avg pace: <span className="text-foreground tabular-nums">{formatPace(p.paceSecPerKm)}</span>
      </div>
      <div className="text-muted">
        Distance: <span className="text-foreground tabular-nums">{p.km.toFixed(2)} km</span>
      </div>
    </div>
  );
}

export function PaceTrendChart({ trend }: { trend: TrendPoint[] }) {
  if (trend.length < 2) {
    return (
      <div className="h-55 grid place-items-center text-sm text-muted">
        Upload at least two runs to see your pace trend.
      </div>
    );
  }
  const ax = paceAxis(trend.map((t) => t.paceSecPerKm));
  return (
    <InViewChart height={220}>
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
          tickFormatter={dayMonthTick}
        />
        <YAxis
          tickFormatter={paceTick}
          fontSize={11}
          stroke="#9ca3af"
          tick={{ fill: "#9ca3af" }}
          tickLine={false}
          axisLine={false}
          reversed
          domain={ax.domain}
          ticks={ax.ticks}
          interval={0}
          width={44}
        />
        <Tooltip content={<TrendTooltip />} />
        <Line
          type="monotone"
          dataKey="paceSecPerKm"
          stroke={ACCENT}
          strokeWidth={2}
          dot={{ r: 3, fill: ACCENT }}
        />
      </LineChart>
    </InViewChart>
  );
}

// ---- Exercise history: top-set progression for one movement ----
export type ExercisePoint = {
  date: string; // YYYY-MM-DD
  value: number; // top-set weight kg (or reps for bodyweight movements)
  reps: number | null; // reps at the top set
  e1Rm: number | null;
  volumeKg: number;
};

function ExerciseTooltip({
  active,
  payload,
  label,
  unit,
}: {
  active?: boolean;
  payload?: { payload: ExercisePoint }[];
  label?: string;
  unit: "kg" | "reps" | "time";
}) {
  if (!active || !payload?.length) return null;
  const p = payload[0].payload;
  const holdFmt = (sec: number) =>
    `${Math.floor(sec / 60)}:${String(Math.round(sec) % 60).padStart(2, "0")}`;
  return (
    <div className="rounded-[10px] border border-border bg-card text-xs px-2.5 py-2 shadow-sm">
      <div className="font-medium mb-1">{formatDate(label ?? "")}</div>
      <div className="text-muted">
        Top set:{" "}
        <span className="text-foreground tabular-nums">
          {unit === "kg"
            ? `${p.value} kg${p.reps != null ? ` × ${p.reps}` : ""}`
            : unit === "time"
            ? holdFmt(p.value)
            : `${p.value} reps`}
        </span>
      </div>
      {p.e1Rm != null && (
        <div className="text-muted">
          Est. 1RM: <span className="text-foreground tabular-nums">{Math.round(p.e1Rm * 10) / 10} kg</span>
        </div>
      )}
      {p.volumeKg > 0 && (
        <div className="text-muted">
          Volume: <span className="text-foreground tabular-nums">{Math.round(p.volumeKg).toLocaleString("en-GB")} kg</span>
        </div>
      )}
    </div>
  );
}

export function ExerciseTrendChart({
  points,
  unit,
}: {
  points: ExercisePoint[];
  unit: "kg" | "reps" | "time";
}) {
  if (points.length < 2) {
    return (
      <div className="h-55 grid place-items-center text-sm text-muted px-6 text-center">
        Log this exercise in one more session and the trend draws itself.
      </div>
    );
  }
  return (
    <InViewChart height={220}>
      <LineChart data={points} margin={{ top: 8, right: 8, left: -8, bottom: 0 }}>
        <CartesianGrid stroke={GRID} vertical={false} />
        <XAxis
          dataKey="date"
          fontSize={11}
          stroke="#9ca3af"
          tick={{ fill: "#9ca3af" }}
          tickLine={false}
          axisLine={false}
          tickFormatter={dayMonthTick}
        />
        <YAxis
          tickFormatter={(v) => (unit === "time" ? paceTick(v) : `${v}`)}
          fontSize={11}
          stroke="#9ca3af"
          tick={{ fill: "#9ca3af" }}
          tickLine={false}
          axisLine={false}
          domain={[
            (min: number) => Math.max(0, Math.floor(min - (min * 0.08 + 1))),
            (max: number) => Math.ceil(max + (max * 0.08 + 1)),
          ]}
          width={44}
        />
        <Tooltip content={<ExerciseTooltip unit={unit} />} />
        <Line
          type="monotone"
          dataKey="value"
          stroke={ACCENT}
          strokeWidth={2}
          dot={{ r: 3, fill: ACCENT }}
        />
      </LineChart>
    </InViewChart>
  );
}

export function DistanceTrendChart({ trend }: { trend: TrendPoint[] }) {
  if (trend.length < 2) {
    return (
      <div className="h-55 grid place-items-center text-sm text-muted">
        Upload at least two runs to see your distance trend.
      </div>
    );
  }
  return (
    <InViewChart height={220}>
      <LineChart data={trend} margin={{ top: 8, right: 8, left: -8, bottom: 0 }}>
        <CartesianGrid stroke={GRID} vertical={false} />
        <XAxis
          dataKey="date"
          fontSize={11}
          stroke="#9ca3af"
          tick={{ fill: "#9ca3af" }}
          tickLine={false}
          axisLine={false}
          tickFormatter={dayMonthTick}
        />
        <YAxis
          tickFormatter={(v) => `${v}`}
          fontSize={11}
          stroke="#9ca3af"
          tick={{ fill: "#9ca3af" }}
          tickLine={false}
          axisLine={false}
          domain={[(min: number) => Math.max(0, Math.floor(min - 1)), (max: number) => Math.ceil(max + 1)]}
          width={44}
        />
        <Tooltip content={<TrendTooltip />} />
        <Line
          type="monotone"
          dataKey="km"
          stroke={INK}
          strokeWidth={2}
          dot={{ r: 3, fill: INK }}
        />
      </LineChart>
    </InViewChart>
  );
}

type FitnessPoint = {
  date: string;
  fitness?: number;
  fatigue?: number;
  form?: number;
  effort: number;
  sessionHref: string | null;
  sessionName: string | null;
  projected?: number;
};

const FATIGUE = "#9ca3af";
const FORM = "#0f766e";
const PROJECT_DAYS = 14;
const RANGES = [
  { days: 91, label: "Last 3 months" },
  { days: 182, label: "Last 6 months" },
  { days: 365, label: "Last year" },
];

function monthTick(d: string): string {
  return new Date(d + "T12:00:00").toLocaleString("en-GB", { month: "short" });
}

function Toggle({ on, onChange, label }: { on: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={`Show ${label} line`}
      onClick={() => onChange(!on)}
      className={`tap w-9 h-5 rounded-full transition-colors ${on ? "bg-foreground" : "bg-black/10"}`}
    >
      <span
        className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-card shadow transition-transform ${on ? "translate-x-4" : ""}`}
      />
    </button>
  );
}

function Headline({
  value,
  label,
  color,
  children,
}: {
  value: number;
  label: string;
  color: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="flex items-start gap-2">
      <span className="font-mono text-5xl md:text-6xl font-semibold tracking-tight tabular-nums leading-none">
        {value}
      </span>
      <div className="pt-1">
        <div className="flex items-center gap-1.5 font-mono text-[11px] uppercase tracking-wider">
          <span className="w-2 h-2 rounded-full" style={{ backgroundColor: color }} />
          {label}
        </div>
        <div className="mt-1.5">{children}</div>
      </div>
    </div>
  );
}

function FitnessTooltip({
  active,
  payload,
  label,
  showFatigue,
  showForm,
}: {
  active?: boolean;
  payload?: { payload: FitnessPoint }[];
  label?: string;
  showFatigue: boolean;
  showForm: boolean;
}) {
  if (!active || !payload?.length) return null;
  const p = payload[0].payload;
  const row = (name: string, v: number | undefined, color: string) =>
    v != null && (
      <div className="flex items-center gap-1.5">
        <span className="w-3 h-0.5" style={{ backgroundColor: color }} />
        <strong className="tabular-nums">{v}</strong> <span className="text-muted">{name}</span>
      </div>
    );
  return (
    <div className="rounded-[10px] border border-border bg-card text-xs px-2.5 py-2 shadow-sm">
      <div className="text-muted mb-1">
        {new Date((label ?? "") + "T12:00:00").toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" })}
      </div>
      {row("Fitness", p.fitness, ACCENT)}
      {p.fitness == null && row("Projected fitness", p.projected, ACCENT)}
      {showFatigue && row("Fatigue", p.fatigue, FATIGUE)}
      {showForm && row("Form", p.form, FORM)}
    </div>
  );
}

function EffortTooltip({ active, payload }: { active?: boolean; payload?: { payload: FitnessPoint }[] }) {
  if (!active || !payload?.length) return null;
  const p = payload[0].payload;
  if (!p.effort) return null;
  return (
    <div className="rounded-[10px] border border-border bg-card text-xs px-2.5 py-2 shadow-sm">
      <div>
        Relative Effort <strong className="tabular-nums">{p.effort}</strong>
      </div>
      {p.sessionName && <div className="text-accent">{p.sessionName}</div>}
    </div>
  );
}

// Strava-style Fitness & Freshness: headline numbers, Fitness area with a
// dashed "today" level and a no-training projection, and a synced strip of
// daily Relative Effort below (click a bar to open that session).
export function FitnessPanel({ days }: { days: Omit<FitnessPoint, "projected">[] }) {
  const router = useRouter();
  const [range, setRange] = useState(182);
  const [showFatigue, setShowFatigue] = useState(false);
  const [showForm, setShowForm] = useState(false);

  const today = days[days.length - 1];
  const weekAgo = days[Math.max(0, days.length - 8)];
  const delta = (today.fitness ?? 0) - (weekAgo.fitness ?? 0);

  // No-training decay of fitness for the next two weeks, joined at today.
  const data: FitnessPoint[] = days.slice(-range).map((d) => ({ ...d }));
  data[data.length - 1].projected = today.fitness;
  const base = new Date(today.date + "T12:00:00");
  for (let n = 1; n <= PROJECT_DAYS; n++) {
    const d = new Date(base.getTime() + n * 86400000);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    data.push({
      date: key,
      effort: 0,
      sessionHref: null,
      sessionName: null,
      projected: Math.round((today.fitness ?? 0) * Math.pow(41 / 42, n)),
    });
  }
  const monthStarts = data.filter((d) => d.date.endsWith("-01")).map((d) => d.date);
  const axis = {
    fontSize: 11,
    stroke: "#9ca3af",
    tick: { fill: "#9ca3af" },
    tickLine: false,
  } as const;

  return (
    <div>
      <div className="flex flex-wrap items-end gap-x-10 gap-y-4 mb-6">
        <Headline value={today.fitness ?? 0} label="Fitness" color={ACCENT}>
          <span
            className={`text-xs tabular-nums ${delta < 0 ? "text-rose-600" : delta > 0 ? "text-good" : "text-muted"}`}
            title="Change over the last 7 days"
          >
            {delta > 0 ? "+" : ""}
            {delta}
          </span>
        </Headline>
        <Headline value={today.fatigue ?? 0} label="Fatigue" color={FATIGUE}>
          <Toggle on={showFatigue} onChange={setShowFatigue} label="fatigue" />
        </Headline>
        <Headline value={today.form ?? 0} label="Form" color={FORM}>
          <Toggle on={showForm} onChange={setShowForm} label="form" />
        </Headline>
        <select
          value={range}
          onChange={(e) => setRange(Number(e.target.value))}
          aria-label="Date range"
          className="ml-auto text-sm bg-transparent border border-border rounded-lg px-2 py-1"
        >
          {RANGES.map((r) => (
            <option key={r.days} value={r.days}>
              {r.label}
            </option>
          ))}
        </select>
      </div>

      <InViewChart height={260}>
        <ComposedChart data={data} syncId="fitness" margin={{ top: 16, right: 28, left: -8, bottom: 0 }}>
          <CartesianGrid stroke={GRID} vertical={false} />
          <XAxis dataKey="date" hide />
          <YAxis {...axis} axisLine={false} width={44} allowDecimals={false} />
          <Tooltip
            cursor={{ stroke: INK, strokeWidth: 1 }}
            content={<FitnessTooltip showFatigue={showFatigue} showForm={showForm} />}
          />
          <ReferenceLine
            y={today.fitness}
            stroke="#cbd5e1"
            strokeDasharray="6 4"
            label={{ value: today.fitness, position: "right", fontSize: 12, fill: INK }}
          />
          <Area
            type="linear"
            dataKey="fitness"
            stroke={ACCENT}
            strokeWidth={2}
            fill={ACCENT}
            fillOpacity={0.07}
            dot={false}
            activeDot={{ r: 4 }}
          />
          <Line type="linear" dataKey="projected" stroke={ACCENT} strokeWidth={2} strokeDasharray="5 4" dot={false} activeDot={false} />
          {showFatigue && <Line type="linear" dataKey="fatigue" stroke={FATIGUE} strokeWidth={1.5} dot={false} />}
          {showForm && <Line type="linear" dataKey="form" stroke={FORM} strokeWidth={1.5} dot={false} />}
        </ComposedChart>
      </InViewChart>

      <InViewChart height={110}>
        <BarChart data={data} syncId="fitness" margin={{ top: 8, right: 28, left: -8, bottom: 0 }}>
          <XAxis dataKey="date" {...axis} ticks={monthStarts} tickFormatter={monthTick} interval={0} />
          {/* Same width as the chart above so bars sit under their day. */}
          <YAxis width={44} tick={false} axisLine={false} />
          <Tooltip cursor={{ fill: "transparent" }} content={<EffortTooltip />} />
          <ReferenceLine x={today.date} stroke="#cbd5e1" />
          <Bar
            dataKey="effort"
            fill="#d1d5db"
            activeBar={{ fill: ACCENT }}
            cursor="pointer"
            onClick={(d: { payload?: FitnessPoint }) => d.payload?.sessionHref && router.push(d.payload.sessionHref)}
          />
        </BarChart>
      </InViewChart>
    </div>
  );
}

type WeekPoint = { weekStart: string; total: number; low: number | null; high: number | null };

const shortDay = (d: string) =>
  new Date(d + "T12:00:00").toLocaleDateString("en-GB", { day: "numeric", month: "short" });

// Weekly Relative Effort totals (dots) over the recommended range (band).
// `home` (the run's own week, or this week) is marked in ink; `shown` in
// accent. Hovering or clicking a week picks it (the card resets on leave).
export function WeeklyEffortChart({
  weeks,
  home,
  shown,
  shownColor = ACCENT,
  onPick,
}: {
  weeks: WeekPoint[];
  home: number;
  shown: number;
  shownColor?: string; // the shown week's status color
  onPick: (i: number) => void;
}) {
  const data = weeks.map((w) => ({ ...w, range: w.low != null ? [w.low, w.high] : null }));
  const shownKey = weeks[shown]?.weekStart;
  const homeKey = weeks[home]?.weekStart;
  const pick = (st: { activeTooltipIndex?: number | string | null }) => {
    const i = st?.activeTooltipIndex;
    if (i != null) onPick(Number(i));
  };
  return (
    <InViewChart height={200}>
      <ComposedChart
        data={data}
        margin={{ top: 12, right: 4, left: 8, bottom: 0 }}
        onMouseMove={pick}
        onClick={pick}
        accessibilityLayer={false}
        style={{ cursor: "pointer" }}
      >
        <CartesianGrid stroke={GRID} horizontal={false} />
        <XAxis dataKey="weekStart" fontSize={11} stroke="#9ca3af" tick={{ fill: "#9ca3af" }} tickLine={false} axisLine={false} tickFormatter={shortDay} interval="preserveStartEnd" />
        <YAxis orientation="right" fontSize={11} stroke="#9ca3af" tick={{ fill: "#9ca3af" }} tickLine={false} axisLine={false} width={40} allowDecimals={false} />
        {/* Tooltip only drives hover tracking; the card header shows the week. */}
        <Tooltip content={() => null} cursor={false} />
        {homeKey && homeKey !== shownKey && <ReferenceLine x={homeKey} stroke={INK} />}
        {shownKey && <ReferenceLine x={shownKey} stroke={shownColor} />}
        <Area type="linear" dataKey="range" stroke="none" fill="#9ca3af" fillOpacity={0.18} connectNulls isAnimationActive={false} activeDot={false} />
        <Line
          type="linear"
          dataKey="total"
          stroke="none"
          isAnimationActive={false}
          activeDot={false}
          dot={(p: { cx?: number; cy?: number; payload?: WeekPoint }) => {
            const k = p.payload?.weekStart;
            const hot = k === shownKey;
            const sel = k === homeKey;
            return (
              <g key={k}>
                {hot && <circle cx={p.cx} cy={p.cy} r={11} fill={shownColor} fillOpacity={0.15} />}
                <circle
                  cx={p.cx}
                  cy={p.cy}
                  r={hot || sel ? 6 : 4}
                  fill={hot ? shownColor : sel ? INK : "var(--color-card, #fff)"}
                  stroke={hot ? shownColor : INK}
                  strokeWidth={1.5}
                />
              </g>
            );
          }}
        />
      </ComposedChart>
    </InViewChart>
  );
}
