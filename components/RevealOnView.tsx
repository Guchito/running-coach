"use client";

import { useEffect, useRef, useState } from "react";

// Holds descendants' CSS animations (paused via [data-reveal="out"], see
// globals.css) until the wrapper first scrolls into view, then lets them play
// once. For below-the-fold reveals that would otherwise finish unseen on page
// load. Content is never hidden by the gate — only the motion waits.
export function RevealOnView({
  children,
  className = "",
  threshold = 0.4,
}: {
  children: React.ReactNode;
  className?: string;
  threshold?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
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

  return (
    <div ref={ref} data-reveal={inView ? "in" : "out"} className={className}>
      {children}
    </div>
  );
}
