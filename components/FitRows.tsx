"use client";

import { useLayoutEffect, useRef } from "react";

// A list that shows only the rows that fit its height — whole rows, never a
// half-cut one. Used where a card stretches to match a neighbouring column.
// The caller must give the box a fixed height at lg (e.g. absolute inset-0).
// Only active at lg and up (where the card is stretched); smaller screens cap
// the list with CSS in the caller, so there's no flash before hydration.
export function FitRows({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const box = ref.current;
    if (!box) return;
    const mq = window.matchMedia("(min-width: 1024px)");
    const fit = () => {
      const rows = [...box.children] as HTMLElement[];
      rows.forEach((r) => {
        r.style.display = "";
        r.style.borderBottomWidth = "";
      });
      if (!mq.matches) return;
      const limit = box.clientHeight;
      // The caller pins the box's height (absolute, inset-0), so hiding rows
      // can't resize it and re-trigger the observer. Measure every row first,
      // then hide, so earlier hides don't shift later measurements.
      const overflow = rows.map((r, i) => i > 0 && r.offsetTop + r.offsetHeight > limit);
      rows.forEach((r, i) => overflow[i] && (r.style.display = "none"));
      // divide-y borders every row but the DOM-last one; the last *visible*
      // row shouldn't keep a divider under it.
      const lastShown = overflow.lastIndexOf(false);
      if (lastShown < rows.length - 1) rows[lastShown].style.borderBottomWidth = "0";
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(box);
    mq.addEventListener("change", fit);
    return () => {
      ro.disconnect();
      mq.removeEventListener("change", fit);
    };
  }, []);

  return (
    <div ref={ref} className={`relative ${className}`}>
      {children}
    </div>
  );
}
