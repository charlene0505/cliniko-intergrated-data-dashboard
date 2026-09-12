"use client";

import type { NoShowStats } from "@/lib/attendance-stats";
import { cardNoBg, down, up } from "./ui";

export function NoShowsPanel({ stats }: { stats: NoShowStats | null }) {
  const max = stats ? Math.max(...stats.monthly.map(m => m.percent), 1) : 1;

  return (
    <section className={`${cardNoBg} flex flex-col gap-3`}>
      <h2 className="text-base font-semibold tracking-tight">No-shows &amp; late cancellations</h2>
      {stats ? (
        <>
          <div className="flex items-baseline gap-2.5 text-[34px] font-semibold tracking-tight">
            {stats.ratePercent}%{" "}
            <small className={stats.deltaPts <= 0 ? up : down}>{stats.deltaPts > 0 ? "+" : ""}{stats.deltaPts} pts</small>
          </div>
          <p className="text-xs leading-relaxed text-black/60">{stats.flaggedCount} of {stats.totalBooked} booked appointments were a no-show or a cancellation within 24 hours ({stats.periodLabel}).</p>
          <div className="flex h-16 items-end gap-1.5" role="img" aria-label={`No-show and late-cancellation rate by month: ${stats.monthly.map(m => `${m.label} ${m.percent}%`).join(', ')}`}>
            {stats.monthly.map((m, i) => (
              <div key={m.label} className="flex h-13 flex-1 flex-col justify-end overflow-hidden rounded-md">
                <i style={{ height: `${(m.percent / max) * 100}%`, background: i === stats.monthly.length - 1 ? "#f0a070" : "#8fd3ee" }} className="block w-full" />
              </div>
            ))}
          </div>
          <div className="flex justify-between text-[10.5px] uppercase tracking-widest text-black/50">
            <span>{stats.monthly[0]?.label}</span>
            <span>{stats.monthly[stats.monthly.length - 1]?.label}</span>
          </div>
        </>
      ) : (
        <p className="text-xs text-black/50">Loading real attendance data…</p>
      )}
    </section>
  );
}
