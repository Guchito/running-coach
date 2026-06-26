import type { HrZone } from "./types";

export const DEFAULT_MAX_HR = 190;

// Standard 5-zone model as a percentage of max HR.
const ZONE_DEFS: { name: string; lowPct: number; highPct: number }[] = [
  { name: "Z1 Recovery", lowPct: 0.5, highPct: 0.6 },
  { name: "Z2 Easy", lowPct: 0.6, highPct: 0.7 },
  { name: "Z3 Aerobic", lowPct: 0.7, highPct: 0.8 },
  { name: "Z4 Threshold", lowPct: 0.8, highPct: 0.9 },
  { name: "Z5 VO2 Max", lowPct: 0.9, highPct: 1.0 },
];

export const ZONE_COLORS = ["#94a3b8", "#10b981", "#4f46e5", "#f59e0b", "#e11d48"];

// Build default zones from a max HR.
export function defaultZones(maxHr: number = DEFAULT_MAX_HR): HrZone[] {
  return ZONE_DEFS.map((z, i) => ({
    name: z.name,
    min: Math.round(maxHr * z.lowPct),
    max: i === ZONE_DEFS.length - 1 ? maxHr : Math.round(maxHr * z.highPct) - 1,
  }));
}

// Resolve the zones to use for a user: their custom zones, else defaults from
// their max HR, else defaults from the standard estimate.
export function resolveZones(
  maxHr: number | null,
  hrZones: HrZone[] | null
): HrZone[] {
  if (hrZones && hrZones.length) return hrZones;
  return defaultZones(maxHr ?? DEFAULT_MAX_HR);
}

// Seconds spent in each zone, from a bpm->seconds histogram.
export function zoneTimes(
  histogram: Record<string, number>,
  zones: HrZone[]
): { zone: HrZone; seconds: number }[] {
  const out = zones.map((zone) => ({ zone, seconds: 0 }));
  for (const [bpmStr, secs] of Object.entries(histogram)) {
    const bpm = Number(bpmStr);
    // Below the first zone's min counts toward Z1; above the last max -> Z5.
    let idx = out.findIndex(({ zone }) => bpm >= zone.min && bpm <= zone.max);
    if (idx === -1) {
      if (bpm < zones[0].min) idx = 0;
      else idx = out.length - 1;
    }
    out[idx].seconds += secs;
  }
  return out;
}
