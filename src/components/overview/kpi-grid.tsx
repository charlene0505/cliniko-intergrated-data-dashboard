"use client";

import { label, up, down } from "./ui";

export function KpiGrid({ items }: { items: readonly (readonly [string, string, string])[] }) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
      {items.map(([kLabel, value, delta], i) => (
        <article key={kLabel} className="flex min-w-0 flex-col gap-2.5 rounded-[18px] border border-black/10 bg-white p-5">
          <div className={`${label} truncate`}>{kLabel}</div>
          <div className="flex items-baseline gap-2">
            <span className="text-3xl font-semibold tracking-tight">{value}</span>
            <span className={i < 2 ? up : down}>{delta}</span>
          </div>
        </article>
      ))}
    </div>
  );
}
