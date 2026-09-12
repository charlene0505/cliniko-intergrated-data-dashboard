"use client";

import type { ReactNode } from "react";

export function Segments({ options, value, onChange, children }: { options: string[]; value: string; onChange: (v: string) => void; children?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-black/10 bg-surface-muted p-1">
      {options.map((o) => (
        <button
          key={o}
          type="button"
          aria-pressed={o === value}
          onClick={() => onChange(o)}
          className={`rounded-2xl px-2 py-1 text-xs whitespace-nowrap transition-colors ${o === value ? "bg-ink font-semibold text-white" : "font-medium text-black/60 hover:text-black/80"}`}
        >
          {o}
        </button>
      ))}
      {children}
    </div>
  );
}
