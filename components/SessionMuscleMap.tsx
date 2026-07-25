"use client";

import { useEffect, useState } from "react";
import { Card } from "@/components/ui";

function titleCase(s: string): string {
  return s.toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
}

// "Muscles trained" — a front+back body diagram for the whole session, primary
// movers in accent, supporting muscles softer. The visualizer only renders on a
// white background (free tier), so the image sits in its own light panel; the
// blue highlights carry the data, on brand.
export function SessionMuscleMap({
  target,
  secondary,
}: {
  target: string[];
  secondary: string[];
}) {
  const [gender, setGender] = useState<"male" | "female">("male");
  const [failed, setFailed] = useState(false);

  // Remember the chosen body model across sessions.
  useEffect(() => {
    const saved = localStorage.getItem("muscleMapGender");
    if (saved === "female" || saved === "male") setGender(saved);
  }, []);
  function pick(g: "male" | "female") {
    setGender(g);
    setFailed(false);
    localStorage.setItem("muscleMapGender", g);
  }

  const src =
    `/api/muscle-map?target=${encodeURIComponent(target.join(","))}` +
    `&secondary=${encodeURIComponent(secondary.join(","))}&gender=${gender}`;

  return (
    <Card className="p-5 mt-4">
      <div className="flex items-baseline justify-between gap-3 mb-3">
        <h2 className="font-medium">Muscles trained</h2>
        <div className="flex rounded-lg border border-border overflow-hidden text-xs">
          {(["male", "female"] as const).map((g) => (
            <button
              key={g}
              type="button"
              onClick={() => pick(g)}
              className={`px-2.5 py-1 capitalize ${
                gender === g ? "bg-accent-soft text-accent font-medium" : "text-muted hover:text-foreground"
              }`}
            >
              {g}
            </button>
          ))}
        </div>
      </div>

      <div className="grid gap-5 sm:grid-cols-[minmax(0,320px)_1fr] items-start">
        {failed ? (
          <div className="rounded-xl border border-border bg-black/3 aspect-square grid place-items-center text-sm text-muted">
            Diagram unavailable
          </div>
        ) : (
          <div className="rounded-xl overflow-hidden border border-border bg-white">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={src}
              alt="Front and back view of the muscles worked this session"
              className="w-full h-auto block"
              onError={() => setFailed(true)}
            />
          </div>
        )}

        <div className="space-y-4">
          <div>
            <div className="flex items-center gap-2 mb-1.5">
              <span className="inline-block w-3 h-3 rounded-full bg-accent" />
              <span className="text-xs uppercase tracking-wider text-muted">Primary movers</span>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {target.map((m) => (
                <span key={m} className="text-xs px-2 py-0.5 rounded-full bg-accent-soft text-accent">
                  {titleCase(m)}
                </span>
              ))}
            </div>
          </div>

          {secondary.length > 0 && (
            <div>
              <div className="flex items-center gap-2 mb-1.5">
                <span className="inline-block w-3 h-3 rounded-full bg-[#93c5fd]" />
                <span className="text-xs uppercase tracking-wider text-muted">Supporting</span>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {secondary.map((m) => (
                  <span key={m} className="text-xs px-2 py-0.5 rounded-full bg-black/4 text-foreground/70">
                    {titleCase(m)}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </Card>
  );
}
