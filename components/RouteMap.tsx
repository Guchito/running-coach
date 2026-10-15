"use client";

import { useEffect, useRef } from "react";
import "maplibre-gl/dist/maplibre-gl.css";
import { coreBounds, homeTracks, type LatLng } from "@/lib/sessionMeta";

// Routes on a vector street map: MapLibre + OpenFreeMap's "Positron" style (free,
// no key, OSM data). One track: the route with a white casing and start/finish
// dots. `heat`: every track as a translucent line in one layer, so streets you
// run often stack up darker. MapLibre needs `window`, so it's loaded in the effect.
const STYLE = "https://tiles.openfreemap.org/styles/positron";

export function RouteMap({ tracks, heat = false }: { tracks: LatLng[][]; heat?: boolean }) {
  const el = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const node = el.current;
    const lines = tracks.filter((t) => t.length > 1);
    if (!node || lines.length === 0) return;

    let map: import("maplibre-gl").Map | undefined;
    let cancelled = false;
    import("maplibre-gl").then(({ Map, NavigationControl, setWorkerUrl }) => {
      if (cancelled) return;
      // MapLibre guesses its worker's address from its own file name, which the
      // bundler renames, so the guess 404s and no tiles ever draw. Point it at
      // the bundler's copy instead.
      setWorkerUrl(new URL("maplibre-gl/dist/maplibre-gl-worker.mjs", import.meta.url).href);
      const lngLat = (t: LatLng[]) => t.map(([lat, lng]) => [lng, lat]);
      const [[s, w], [n, e]] = heat ? coreBounds(homeTracks(lines), 0.95) : coreBounds(lines);

      map = new Map({
        container: node,
        style: STYLE,
        bounds: [
          [w, s],
          [e, n],
        ],
        fitBoundsOptions: { padding: heat ? 24 : 40 },
        attributionControl: { compact: true },
        dragRotate: false,
        pitchWithRotate: false,
      });
      map.touchZoomRotate.disableRotation();
      map.addControl(new NavigationControl({ showCompass: false }), "top-right");

      map.on("load", () => {
        const m = map!;
        // The box can still be settling when the map is created (fonts, CSS),
        // which frames the routes for the wrong size. Re-fit at the final size.
        m.resize();
        m.fitBounds([[w, s], [e, n]], { padding: heat ? 24 : 40, animate: false });
        m.addSource("routes", {
          type: "geojson",
          data: {
            type: "FeatureCollection",
            features: lines.map((t) => ({
              type: "Feature",
              properties: {},
              geometry: { type: "LineString", coordinates: lngLat(t) },
            })),
          },
        });
        const round = { "line-join": "round", "line-cap": "round" } as const;

        if (heat) {
          // Overlapping features in one translucent layer blend, so a street run
          // once is a faint trace and a weekly loop turns deep blue. Width grows
          // with zoom so it reads as a heat trail zoomed out and a path zoomed in.
          m.addLayer({
            id: "heat",
            type: "line",
            source: "routes",
            layout: round,
            paint: {
              "line-color": "#1d4ed8",
              "line-opacity": 0.28,
              "line-width": ["interpolate", ["linear"], ["zoom"], 10, 2.5, 13, 3.5, 16, 6],
              "line-blur": 0.5,
            },
          });
          return;
        }

        const t = lines[0];
        m.addLayer({ id: "casing", type: "line", source: "routes", layout: round, paint: { "line-color": "#fff", "line-width": 8 } });
        m.addLayer({ id: "route", type: "line", source: "routes", layout: round, paint: { "line-color": "#2563eb", "line-width": 4.5 } });
        m.addSource("ends", {
          type: "geojson",
          data: {
            type: "FeatureCollection",
            features: [
              { type: "Feature", properties: { color: "#16a34a" }, geometry: { type: "Point", coordinates: lngLat([t[0]])[0] } },
              { type: "Feature", properties: { color: "#dc2626" }, geometry: { type: "Point", coordinates: lngLat([t[t.length - 1]])[0] } },
            ],
          },
        });
        m.addLayer({
          id: "ends",
          type: "circle",
          source: "ends",
          paint: { "circle-radius": 7, "circle-color": ["get", "color"], "circle-stroke-color": "#fff", "circle-stroke-width": 2.5 },
        });
      });
    });

    return () => {
      cancelled = true;
      map?.remove();
    };
  }, [tracks, heat]);

  return (
    <div
      ref={el}
      className={`${heat ? "h-[28rem]" : "h-80"} w-full rounded-xl overflow-hidden bg-[#f2f3f0]`}
    />
  );
}
