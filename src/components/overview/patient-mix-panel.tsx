"use client";

import { Segments } from "./segments";
import { PeriodSelector } from "./period-selector";
import { useEnterAnimation } from "@/lib/use-enter-animation";
import { useCachedFetch } from "@/lib/use-cached-fetch";
import { rangeSearch, resolvePeriod, type Period } from "@/lib/date-range";
import { cardNoBg } from "./ui";

// Same palette the fixture used — applied to whichever real labels come back, in count order,
// rather than tied to specific fixed categories (funding and referral source have different
// labels, and either can gain/lose a bucket as the real data's classification rules change).
const PALETTE = ["#0b7276", "#14a3a8", "#8fd3ee", "#f0a070", "#e8dfa0", "#c9c6bd"] as const;

interface MixSlice {
  label: string;
  count: number;
}

interface MixResponse {
  status: "ok" | "no_data";
  mix?: MixSlice[];
}

// Shared so a no-data response keeps a stable identity — `fresh` is an animation dependency below.
const NO_SLICES: MixSlice[] = [];

export function PatientMixPanel({
  mode,
  onModeChange,
  period,
  onPeriodChange,
}: {
  mode: string;
  onModeChange: (v: string) => void;
  period: Period;
  onPeriodChange: (v: Period) => void;
}) {
  const range = resolvePeriod(period);
  // Keyed by mode and the resolved days: every combination this tab has already seen renders from
  // cache on the click, and while a new one is in flight `data` holds the previous response, so
  // staleness is known during render — no waiting on the network round trip to react to the click.
  const { data, isStale, failed: fetchFailed } = useCachedFetch<MixResponse>(
    `patient-mix:${mode}:${range.from}:${range.to}`,
    `/api/cliniko/patient-mix?mode=${encodeURIComponent(mode)}&${rangeSearch(range)}`,
  );
  const mix = data ? (data.mix ?? NO_SLICES) : null;
  const fresh = isStale ? null : mix;

  // While a switch is in flight the previous shape is still rendered — but `entered` is false, so
  // every arc sits at zero length and the centre/legend are hidden. That keeps the panel's height
  // stable (no collapse to a loading strip and back) while still visibly starting from zero.
  const failed = fetchFailed && !fresh;
  const total = mix?.reduce((sum, s) => sum + s.count, 0) ?? 0;
  // `&& !!fresh` holds the zero state for the whole switch: without it the hook would flip back to
  // true a couple of frames after `fresh` went null and re-reveal the outgoing selection's numbers.
  // Transitions below are only applied while entered, so the reset to zero snaps and just the grow-in
  // animates — otherwise a switch to an already-cached range only showed a two-frame flicker.
  const entered = useEnterAnimation(fresh) && !!fresh;

  return (
    <section className={`${cardNoBg} flex h-full flex-col gap-4`}>
      <h2 className="text-base font-semibold tracking-tight">Patient Mix</h2>
      <div className="flex flex-row flex-wrap items-center justify-start gap-3">
        <Segments options={["Funding", "Referral source"]} value={mode} onChange={onModeChange} />
        <PeriodSelector value={period} onChange={onPeriodChange} />
      </div>

      {failed && (
        <p className="text-center text-xs text-clay">Couldn&apos;t load the {mode.toLowerCase()} mix. Try again shortly.</p>
      )}

      {!mix && !failed && <p className="text-center text-xs text-black/50">Loading real patient mix…</p>}

      {mix && total === 0 && (
        <p className="text-center text-xs text-black/50">
          {data?.status === "no_data" ? "No patient mix data yet." : "No patients in this period."}
        </p>
      )}

      {mix && total > 0 && (
        <>
          <div className="relative mx-auto h-44 w-44">
            <svg
              viewBox="0 0 120 120"
              role="img"
              aria-label={fresh ? `${mode} mix, ${total} total` : `Loading ${mode} mix`}
              className="h-full w-full -rotate-90"
            >
              {/* Always-on track ring. The arcs sit at zero length for the whole of an in-flight
                  switch, so without this the chart area would be empty while the request runs, which
                  reads as the graph failing to render rather than loading. */}
              <circle cx="60" cy="60" r="46" fill="none" stroke="var(--color-track)" strokeWidth="19" />
              {mix.map((slice, i) => {
                const c = 2 * Math.PI * 46;
                const offset = (mix.slice(0, i).reduce((n, s) => n + s.count, 0) / total) * c;
                const len = entered ? Math.max((slice.count / total) * c - 2, 0) : 0;
                return (
                  <circle
                    key={slice.label}
                    cx="60"
                    cy="60"
                    r="46"
                    fill="none"
                    stroke={PALETTE[i % PALETTE.length]}
                    strokeWidth="19"
                    strokeDasharray={`${len} ${c - len}`}
                    strokeDashoffset={-offset}
                    className={entered ? "transition-[stroke-dasharray] duration-300 ease-out" : undefined}
                  />
                );
              })}
            </svg>
            <div
              className={`absolute inset-0 flex flex-col items-center justify-center gap-0.5 ${entered ? "scale-100 opacity-100 transition-all duration-300 ease-out" : "scale-75 opacity-0"}`}
            >
              <strong className="text-3xl font-semibold tracking-tight">{total}</strong>
              <small className="text-[11px] text-black/55">{mode === "Funding" ? "patients" : "new patients"}</small>
            </div>
            {/* The total above is hidden while stale, so the hole would otherwise sit empty for the
                length of the query. */}
            {!fresh && !failed && (
              <div className="absolute inset-0 flex items-center justify-center">
                <span className="text-[11px] text-black/45">Updating…</span>
              </div>
            )}
          </div>
          <div>
            {mix.map((slice, i) => (
              <div
                className={`flex items-center gap-3 border-b border-black/10 py-2.5 last:border-0 ${
                  entered ? "translate-x-0 opacity-100 transition-all duration-300 ease-out" : "-translate-x-2 opacity-0"
                }`}
                key={slice.label}
              >
                <i style={{ background: PALETTE[i % PALETTE.length] }} className="block h-2.5 w-2.5 flex-none rounded-sm" />
                <span className="flex-1 text-sm">{slice.label}</span>
                <strong className="text-sm font-semibold tabular-nums">{slice.count}</strong>
                <small className="w-12 text-right text-xs text-black/50 tabular-nums">{((slice.count / total) * 100).toFixed(1)}%</small>
              </div>
            ))}
          </div>
        </>
      )}
    </section>
  );
}
