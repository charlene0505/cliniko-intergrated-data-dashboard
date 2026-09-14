"use client";

import { useEffect } from "react";

// Stops the page behind a popup from scrolling while `active` is true. The page's scroll lives on the
// root element, so that's what gets locked — and it's padded by the scrollbar's width, so the scrollbar
// disappearing doesn't shift the whole layout sideways. Whatever was set before is restored on unlock,
// so back-to-back or nested popups don't clobber each other.
export function useScrollLock(active: boolean) {
  useEffect(() => {
    if (!active) return;
    const root = document.documentElement;
    const scrollbarWidth = window.innerWidth - root.clientWidth;
    const previous = { overflow: root.style.overflow, paddingRight: root.style.paddingRight };

    root.style.overflow = "hidden";
    if (scrollbarWidth > 0) root.style.paddingRight = `${scrollbarWidth}px`;

    return () => {
      root.style.overflow = previous.overflow;
      root.style.paddingRight = previous.paddingRight;
    };
  }, [active]);
}
