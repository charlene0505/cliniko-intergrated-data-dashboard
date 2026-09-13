"use client";

import type { ReactNode } from "react";
import { useScrollReveal } from "@/lib/use-scroll-reveal";

// Wraps a panel/section so it fades and slides in the moment it's scrolled into view, rather than
// on a fixed timer from page load — panels already on screen at first paint reveal almost
// immediately, ones further down wait for the user to actually scroll to them.
export function Reveal({
  children,
  className = "",
  delayMs = 0,
}: {
  children: ReactNode;
  className?: string;
  delayMs?: number;
}) {
  const [ref, visible] = useScrollReveal<HTMLDivElement>();
  return (
    <div
      ref={ref}
      className={`transition-all duration-500 ease-out ${
        visible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"
      } ${className}`}
      style={{ transitionDelay: `${delayMs}ms` }}
    >
      {children}
    </div>
  );
}
