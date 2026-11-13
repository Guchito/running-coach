"use client";

import { useEffect, useRef, useState } from "react";
import "maplibre-gl/dist/maplibre-gl.css";
import { Card } from "@/components/ui";
import { STYLE } from "./RouteMap";
import type { LatLng } from "@/lib/sessionMeta";

// Where suggested routes start. Tap the map to drop the pin, then save.
// With nothing saved, routes start where most runs start (`usual`), which is
// also where the map opens.
export function HomeSetting({ initial, usual }: { initial: LatLng | null; usual: LatLng | null }) {
  const el = useRef<HTMLDivElement>(null);
  const [saved, setSaved] = useState(initial);
  const [pin, setPin] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const movePin = useRef<(p: LatLng | null) => void>(() => {});

  useEffect(() => {
    const node = el.current;
    if (!node) return;
    let map: import("maplibre-gl").Map | undefined;
    let cancelled = false;
    import("maplibre-gl").then(({ Map, Marker, NavigationControl, setWorkerUrl }) => {
      if (cancelled) return;
      // Same worker fix as RouteMap: the bundler renames MapLibre's worker file.
      setWorkerUrl(new URL("maplibre-gl/dist/maplibre-gl-worker.mjs", import.meta.url).href);
      const at = initial ?? usual;
      map = new Map({
        container: node,
        style: STYLE,
        center: at ? [at[1], at[0]] : [0, 20],
        zoom: at ? 14 : 1,
        attributionControl: { compact: true },
        dragRotate: false,
        pitchWithRotate: false,
      });
      map.touchZoomRotate.disableRotation();
      map.addControl(new NavigationControl({ showCompass: false }), "top-right");
      const marker = new Marker({ color: "#2563eb" });
      movePin.current = (p) => {
        if (p) marker.setLngLat([p[1], p[0]]).addTo(map!);
        else marker.remove();
      };
      movePin.current(initial);
      map.on("click", (e) => {
        const p: LatLng = [e.lngLat.lat, e.lngLat.lng];
        movePin.current(p);
        setPin(p);
      });
    });
    return () => {
      cancelled = true;
      map?.remove();
    };
    // The map is created once; later pin moves go through movePin.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function save(next: LatLng | null) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/home", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(next ? { lat: next[0], lng: next[1] } : { lat: null }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error ?? "Could not save.");
      setSaved(next);
      setPin(next);
      movePin.current(next);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save.");
    } finally {
      setBusy(false);
    }
  }

  const changed = pin !== saved;
  return (
    <Card className="p-5">
      <p className="text-sm text-muted mb-3">
        Suggested routes on the plan page start here. Tap the map to place the pin.{" "}
        {saved ? "" : "Nothing saved yet, so routes start where most of your runs start."}
      </p>
      <div ref={el} className="h-72 w-full rounded-xl overflow-hidden bg-[#f2f3f0]" />
      <div className="flex items-center gap-4 mt-3 text-sm">
        <button
          type="button"
          onClick={() => save(pin)}
          disabled={busy || !changed || !pin}
          className="px-3 py-1.5 rounded-lg bg-accent text-white font-medium cursor-pointer disabled:opacity-50 disabled:cursor-default"
        >
          {busy ? "Saving…" : "Save home"}
        </button>
        {saved && (
          <button
            type="button"
            onClick={() => save(null)}
            disabled={busy}
            className="text-accent hover:underline cursor-pointer disabled:opacity-50"
          >
            Clear (use my usual start)
          </button>
        )}
        {saved && !changed && <span className="text-muted">Saved</span>}
        {error && <span className="text-red-600">{error}</span>}
      </div>
    </Card>
  );
}
