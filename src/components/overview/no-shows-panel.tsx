"use client";

import type { NoShowStats } from "@/lib/attendance-stats";
import { useScrollReveal } from "@/lib/use-scroll-reveal";
import { cardNoBg, down, up } from "./ui";

// Percentage coordinates inside the plot box. The x inset keeps the first/last dot (and their
// labels) from hanging off the edges; the y band leaves headroom above the tallest point for its
// number label.
const X_PAD = 7;
const Y_TOP = 26;
const Y_BOTTOM = 86;

const LINE = "#14a3a8";
const CURRENT = "#f0a070";

export function NoShowsPanel({ stats }: { stats: NoShowStats | null }) {
  // Attached to the chart, which only mounts once `stats` arrives — the observer picks it up
  // whenever that happens, so the line/dots always paint hidden first and then animate in.
  const [chartRef, entered] = useScrollReveal<HTMLDivElement>();

  const monthly = stats?.monthly ?? [];
  // Scaled against 0..max (not min..max) so a point's height stays proportional to its actual
  // rate — the same basis the bars used, rather than magnifying small month-to-month noise.
  const max = Math.max(...monthly.map((m) => m.percent), 1);
  const x = (i: number) => (monthly.length < 2 ? 50 : X_PAD + (i / (monthly.length - 1)) * (100 - 2 * X_PAD));
  const y = (percent: number) => Y_TOP + (1 - percent / max) * (Y_BOTTOM - Y_TOP);

  return (
    <section className={`${cardNoBg} flex flex-col gap-3`}>
      <h2 className="text-base font-semibold tracking-tight">
        No-shows &amp; late cancellations
      </h2>
      {stats ? (
        <>
          <div>
            <div className="flex items-baseline gap-2.5 text-[34px] font-semibold tracking-tight">
              {stats.ratePercent}%{" "}
              <small className={stats.deltaPts <= 0 ? up : down}>
                {stats.deltaPts > 0 ? "+" : ""}
                {stats.deltaPts} pts
              </small>
            </div>
            <p className="text-xs leading-relaxed text-black/60 font-normal">
              {stats.flaggedCount}/{stats.totalBooked} ({stats.periodLabel}).
            </p>
          </div>

          <div
            ref={chartRef}
            className="relative h-28 w-full"
            role="img"
            aria-label={`No-show and late-cancellation rate by month: ${monthly.map((m) => `${m.label} ${m.percent}%`).join(", ")}`}
          >
            {/* Drawn in with a left-to-right clip rather than a stroke-dash offset: the viewBox is
                stretched non-uniformly, which makes dash lengths resolve against the rendered pixel
                width instead of the normalised pathLength and breaks the line into repeating gaps.
                A clip wipe is independent of both width and scaling. */}
            <svg
              viewBox="0 0 100 100"
              preserveAspectRatio="none"
              className="absolute inset-0 h-full w-full overflow-visible"
              style={{
                clipPath: entered ? "inset(-20% 0 -20% 0)" : "inset(-20% 100% -20% 0)",
                transition: "clip-path 900ms ease-out",
              }}
            >
              <polyline
                points={monthly.map((m, i) => `${x(i)},${y(m.percent)}`).join(" ")}
                fill="none"
                stroke={LINE}
                strokeWidth={2}
                strokeLinecap="round"
                strokeLinejoin="round"
                vectorEffect="non-scaling-stroke"
              />
            </svg>

            {monthly.map((m, i) => {
              const isCurrent = i === monthly.length - 1;
              return (
                // The wrapper is exactly the dot's size so that centring it lands the dot itself on
                // the data point (and so on the line); the number floats above it rather than
                // sharing a stacked box, which would push the dot below the point.
                <div
                  key={m.label}
                  className="absolute h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2"
                  style={{ left: `${x(i)}%`, top: `${y(m.percent)}%` }}
                >
                  {/* Each dot waits for the line to reach it, so the numbers land left to right. */}
                  <span
                    className="absolute bottom-full left-1/2 mb-1.5 -translate-x-1/2 text-xs font-semibold tabular-nums whitespace-nowrap text-ink transition-opacity duration-300 ease-out"
                    style={{ opacity: entered ? 1 : 0, transitionDelay: `${300 + i * 110}ms` }}
                  >
                    {m.percent}%
                  </span>
                  <span
                    className="block h-full w-full rounded-full border-2 border-white transition-transform duration-300 ease-out"
                    style={{
                      background: isCurrent ? CURRENT : LINE,
                      transform: entered ? "scale(1)" : "scale(0)",
                      transitionDelay: `${300 + i * 110}ms`,
                    }}
                  />
                </div>
              );
            })}

            {monthly.map((m, i) => (
              <span
                key={m.label}
                className="absolute bottom-0 -translate-x-1/2 text-[10.5px] uppercase tracking-widest whitespace-nowrap text-black/50"
                style={{ left: `${x(i)}%` }}
              >
                {m.label}
              </span>
            ))}
          </div>
        </>
      ) : (
        <p className="text-xs text-black/50">Loading real attendance data…</p>
      )}
    </section>
  );
}
