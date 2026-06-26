import { zoneTimes, ZONE_COLORS } from "@/lib/hr";
import { formatDuration } from "@/lib/parseRun";
import type { HrZone } from "@/lib/types";

// Renders time-in-zone for one run, computed from its bpm histogram against
// the runner's (custom or default) HR zones.
export function HrZonesCard({
  histogram,
  zones,
  customized,
}: {
  histogram: Record<string, number>;
  zones: HrZone[];
  customized: boolean;
}) {
  const times = zoneTimes(histogram, zones);
  const total = times.reduce((a, t) => a + t.seconds, 0) || 1;

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <div className="text-xs uppercase tracking-wide text-muted">Heart-rate zones</div>
        <a href="/settings" className="text-xs text-accent">
          {customized ? "Edit zones" : "Set your zones"}
        </a>
      </div>
      <div className="space-y-1.5">
        {times.map(({ zone, seconds }, i) => (
          <div key={zone.name} className="flex items-center gap-2 text-xs">
            <span className="w-24 text-muted truncate" title={`${zone.min}-${zone.max} bpm`}>
              {zone.name}
            </span>
            <div className="flex-1 h-1.5 rounded-full bg-black/[0.05] overflow-hidden">
              <div
                className="h-full rounded-full"
                style={{
                  width: `${(seconds / total) * 100}%`,
                  backgroundColor: ZONE_COLORS[i] ?? "#cbd5e1",
                }}
              />
            </div>
            <span className="w-12 text-right tabular-nums text-muted">{formatDuration(seconds)}</span>
          </div>
        ))}
      </div>
      {!customized && (
        <p className="text-[11px] text-muted mt-2">Using default zones — set your max HR in Settings.</p>
      )}
    </div>
  );
}
