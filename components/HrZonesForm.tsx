"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Card, Button } from "@/components/ui";
import { defaultZones, DEFAULT_MAX_HR, ZONE_COLORS } from "@/lib/hr";
import type { HrZone } from "@/lib/types";

export function HrZonesForm({
  initialMaxHr,
  initialZones,
}: {
  initialMaxHr: number | null;
  initialZones: HrZone[] | null;
}) {
  const router = useRouter();
  const [maxHr, setMaxHr] = useState<string>(initialMaxHr ? String(initialMaxHr) : "");
  const [zones, setZones] = useState<HrZone[]>(
    initialZones ?? defaultZones(initialMaxHr ?? DEFAULT_MAX_HR)
  );
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function regenerate() {
    const m = Number(maxHr) || DEFAULT_MAX_HR;
    setZones(defaultZones(m));
    setSaved(false);
  }

  function updateZone(i: number, field: "min" | "max", value: string) {
    setZones((zs) => zs.map((z, idx) => (idx === i ? { ...z, [field]: Number(value) } : z)));
    setSaved(false);
  }

  async function save() {
    setError(null);
    setBusy(true);
    setSaved(false);
    try {
      const res = await fetch("/api/profile", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ maxHr: maxHr ? Number(maxHr) : null, hrZones: zones }),
      });
      if (!res.ok) throw new Error((await res.json()).error || "Could not save.");
      setSaved(true);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save.");
    } finally {
      setBusy(false);
    }
  }

  const inputCls =
    "w-full rounded-lg border border-border px-3 py-2 text-sm outline-none focus:border-accent bg-card tabular-nums";

  return (
    <Card className="p-6 max-w-xl">
      <div className="flex items-end gap-3 mb-5">
        <label className="block text-sm flex-1">
          <span className="text-muted">Max heart rate (bpm)</span>
          <input
            value={maxHr}
            onChange={(e) => {
              setMaxHr(e.target.value);
              setSaved(false);
            }}
            type="number"
            min={120}
            max={230}
            placeholder="e.g. 190"
            className={`mt-1 ${inputCls}`}
          />
        </label>
        <Button type="button" variant="ghost" onClick={regenerate}>
          Generate zones
        </Button>
      </div>

      <div className="text-xs uppercase tracking-wide text-muted mb-2">Zones (bpm)</div>
      <div className="space-y-2">
        {zones.map((z, i) => (
          <div key={i} className="flex items-center gap-3">
            <span
              className="w-2.5 h-2.5 rounded-full shrink-0"
              style={{ backgroundColor: ZONE_COLORS[i] ?? "#cbd5e1" }}
            />
            <span className="text-sm w-28 shrink-0">{z.name}</span>
            <input
              value={z.min}
              onChange={(e) => updateZone(i, "min", e.target.value)}
              type="number"
              className={inputCls}
              aria-label={`${z.name} min`}
            />
            <span className="text-muted text-sm">–</span>
            <input
              value={z.max}
              onChange={(e) => updateZone(i, "max", e.target.value)}
              type="number"
              className={inputCls}
              aria-label={`${z.name} max`}
            />
          </div>
        ))}
      </div>

      {error && <div className="text-sm text-red-600 mt-3">{error}</div>}
      <div className="flex items-center gap-3 mt-5">
        <Button onClick={save} disabled={busy}>
          {busy ? "Saving…" : "Save zones"}
        </Button>
        {saved && <span className="text-sm text-good">✓ Saved</span>}
      </div>
      <p className="text-xs text-muted mt-4">
        These zones are used to break down time-in-zone on every run. Set your max HR and tweak the
        boundaries to match your own testing (e.g. a lab or field test).
      </p>
    </Card>
  );
}
