"use client";

import { useEffect, useRef } from "react";

// Rolls a stat up from 0 to its final value the first time it scrolls into
// view. Works on formatted strings ("13.01 km", "1:20:07", "149 / 168"):
// every digit-run counts up in place, everything else stays put, and each
// run keeps its width (zero-padded) so tabular/mono layouts don't jitter.
//
// The SSR'd text IS the final value — JS only repaints intermediate frames
// straight to textContent (no per-frame React renders), so with JS disabled
// or reduced motion the number is simply there.
const DURATION_MS = 900;

export function CountUp({ value, delayMs = 0 }: { value: string; delayMs?: number }) {
  const ref = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const target = value;
    const parts = target.split(/(\d+)/); // keeps the digit runs as segments
    const isNum = parts.map((p) => /^\d+$/.test(p));
    if (!isNum.some(Boolean)) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const frame = (eased: number) => {
      el.textContent = parts
        .map((part, i) => {
          if (!isNum[i]) return part;
          const n = Math.round(parseInt(part, 10) * eased);
          return String(n).padStart(part.length, "0");
        })
        .join("");
    };

    let raf = 0;
    let started = false;
    const io = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting || started) return;
        started = true;
        io.disconnect();
        // Zero immediately, then hold until this stat's slot in the
        // left-to-right sequence comes up (delayMs).
        frame(0);
        const t0 = performance.now() + delayMs;
        const tick = (now: number) => {
          const p = Math.min(1, Math.max(0, (now - t0) / DURATION_MS));
          if (p >= 1) {
            el.textContent = target;
            return;
          }
          frame(1 - Math.pow(1 - p, 3));
          raf = requestAnimationFrame(tick);
        };
        raf = requestAnimationFrame(tick);
      },
      { threshold: 0.6 }
    );
    io.observe(el);
    return () => {
      io.disconnect();
      cancelAnimationFrame(raf);
    };
  }, [value, delayMs]);

  return <span ref={ref}>{value}</span>;
}
