"use client";

import { up, down } from "./ui";

// "—" is the not-yet-loaded placeholder. Every other delta is coloured by sign, and without this it
// would fall through to the green "up" style and read as an improvement.
function deltaClass(delta: string): string {
  if (delta === "—") return "text-xs font-semibold text-black/40";
  return delta.trimStart().startsWith("-") ? down : up;
}

export function KpiGrid({ items, compact = false }: { items: readonly (readonly [string, string, string])[]; compact?: boolean }) {
  if (compact) {
    return (
      <div className="flex flex-wrap gap-2.5">
        {items.map(([label, value, delta, tooltip], i) => (
          <article
            key={i}
            className="group relative flex h-24 w-24 flex-col items-center justify-center gap-1 rounded-2xl border border-white bg-white/50 p-2 text-center"
          >
            <span className="text-xs leading-none font-semibold tracking-tight">
              {label}
            </span>
            <span className="text-4xl leading-none font-semibold tracking-tight">
              {value}
            </span>
            <span className={`${deltaClass(delta)} text-base leading-tight`}>
              {delta}
            </span>
            <div className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-2 w-35 -translate-x-1/2 rounded-lg bg-black/80 px-2 py-1.5 text-xs leading-snug font-medium text-white opacity-0 transition-opacity duration-150 group-hover:opacity-100">
              {tooltip}
            </div>
          </article>
        ))}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
      {items.map(([value, delta], i) => (
        <article key={i} className="flex min-w-0 flex-col gap-2.5 rounded-[18px] border border-black/10 bg-white p-5">
          <div className="flex items-baseline gap-2">
            <span className="text-3xl font-semibold tracking-tight">{value}</span>
            <span className={deltaClass(delta)}>{delta}</span>
          </div>
        </article>
      ))}
    </div>
  );
}
