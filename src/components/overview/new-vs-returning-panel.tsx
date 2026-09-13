"use client";

import type { PatientMixStats } from "@/lib/attendance-stats";
import { PeriodSelector } from "./period-selector";
import { useScrollReveal } from "@/lib/use-scroll-reveal";
import { cardNoBg } from "./ui";

export function NewVsReturningPanel({
  trendRange,
  onRangeChange,
  onApplyCustomRange,
  stats,
}: {
  trendRange: string;
  onRangeChange: (v: string) => void;
  onApplyCustomRange: () => void;
  stats: PatientMixStats | null;
}) {
  const monthly = stats?.monthly ?? [];
  // Attached to the bar row below, which only mounts once `stats` has arrived — the observer picks
  // it up whenever that happens, so the columns always paint hidden first and then animate in.
  const [barsRef, entered] = useScrollReveal<HTMLDivElement>();

  return (
    <section className={`${cardNoBg} flex flex-col gap-3`}>
      <h2 className="text-base font-semibold tracking-tight">
        New vs Returning patients
      </h2>
      <PeriodSelector
        value={trendRange}
        onChange={onRangeChange}
        onApplyCustomRange={onApplyCustomRange}
      />
      {stats ? (
        <div
          ref={barsRef}
          className="flex items-center gap-2"
          role="img"
          aria-label={`New-patient percentage by period: ${monthly.map((m) => `${m.label}: ${m.newCount} new of ${m.totalCount} total (${m.percent}%)`).join(", ")}`}
        >
          {monthly.map((m, i) => (
            // Column width isn't fixed — it's 1/n of the available row (minus the gap-2 between
            // each), so it scales with however many bars this period has (3 for a quarter, 7 for
            // a week) instead of leaving dead space or overflowing at a fixed width. Each whole
            // column (box + label) fades/slides in on its own delay so they appear one by one,
            // rather than all popping in at once with only the fill growing.
            <div
              key={m.label}
              className={`flex flex-1 flex-col items-center gap-1 transition-all duration-500 ease-out ${
                entered ? "opacity-100 translate-y-0" : "opacity-0 translate-y-3"
              }`}
              style={{ transitionDelay: `${i * 100}ms` }}
            >
              {/* Fill height is the literal new/total percentage (0-100% of the track) — not
                  normalized against the tallest bar in view, so a 19% bar always reads as ~1/5
                  full regardless of what the neighbouring bars show. */}
              <div className="relative flex h-14 w-full flex-col justify-end overflow-visible rounded-t-md  bg-alert/50 ">
                <div
                  style={{ height: entered ? `${m.percent}%` : "0%", transitionDelay: `${i * 100}ms` }}
                  className="w-full bg-teal-300 transition-[height] duration-700 ease-out"
                />
                <span className="absolute left-1/2 top-1/2 -translate-x-1/2 whitespace-nowrap text-center text-md font-bold tabular-nums text-ink">
                  {m.newCount}
                  {/* <span className="font-medium text-black/50">
                    /{m.totalCount}
                  </span> */}
                </span>
              </div>
              <span className="whitespace-nowrap text-center text-xs uppercase tracking-widest text-black/50">
                {m.label}
              </span>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-xs text-black/50">Loading real attendance data…</p>
      )}
    </section>
  );
}
