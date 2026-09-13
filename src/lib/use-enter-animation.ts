"use client";

import { useEffect, useState } from "react";

// Returns false on first paint, then true a frame later — pair it with a CSS `transition` on
// whatever visual property represents the data (bar height/width, stroke-dashoffset) scaled by
// this flag, so the chart grows in from zero once real data has rendered, instead of just
// popping in at full size. Pass a dep so it re-triggers (resets to false, then true again) when
// the underlying data changes — e.g. switching chart mode or date range.
export function useEnterAnimation(dep?: unknown): boolean {
  const [entered, setEntered] = useState(false);

  useEffect(() => {
    // Deliberate reset-then-animate: when `dep` changes, snap back to the un-entered state so the
    // transition replays from zero instead of jumping straight to the new value.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setEntered(false);
    let raf2 = 0;
    const raf1 = requestAnimationFrame(() => {
      raf2 = requestAnimationFrame(() => setEntered(true));
    });
    return () => {
      cancelAnimationFrame(raf1);
      cancelAnimationFrame(raf2);
    };
  }, [dep]);

  return entered;
}
