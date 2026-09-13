"use client";

import { useEffect, useState } from "react";
import { Segments } from "./segments";
import { PeriodSelector } from "./period-selector";
import { useEnterAnimation } from "@/lib/use-enter-animation";
import { cardNoBg } from "./ui";

// Same palette the fixture used — applied to whichever real labels come back, in count order,
// rather than tied to specific fixed categories (funding and referral source have different
// labels, and either can gain/lose a bucket as the real data's classification rules change).
const PALETTE = ["#0b7276", "#14a3a8", "#8fd3ee", "#f0a070", "#e8dfa0", "#c9c6bd"] as const;

interface MixSlice {
  label: string;
  count: number;
}

export function PatientMixPanel({
  mode,
  onModeChange,
  mixRange,
  onRangeChange,
  onPreviewCustomRange,
}: {
  mode: string;
  onModeChange: (v: string) => void;
  mixRange: string;
  onRangeChange: (v: string) => void;
  onPreviewCustomRange: () => void;
}) {
  // Data is stored together with the mode it was fetched for, so staleness is derived during
  // render: the moment `mode` changes, the held data stops matching and `fresh` reads as null
  // straight away — no waiting on the network round trip to react to the click.
  const [loaded, setLoaded] = useState<{ mode: string; mix: MixSlice[] } | null>(null);
  const fresh = loaded?.mode === mode ? loaded.mix : null;

  useEffect(() => {
    const controller = new AbortController();
    fetch(`/api/cliniko/patient-mix?mode=${encodeURIComponent(mode)}`, { signal: controller.signal })
      .then((res) => res.json())
      .then((data: { status: string; mix?: MixSlice[] }) =>
        setLoaded({ mode, mix: data.status === "ok" ? (data.mix ?? []) : [] }),
      )
      .catch(() => {});
    return () => controller.abort();
  }, [mode]);

  // While a switch is in flight the previous shape is still rendered — but `entered` is false, so
  // every arc sits at zero length and the centre/legend are hidden. That keeps the panel's height
  // stable (no collapse to a loading strip and back) while still visibly starting from zero.
  const mix = fresh ?? loaded?.mix ?? null;
  const total = mix?.reduce((sum, s) => sum + s.count, 0) ?? 0;
  // `&& !!fresh` holds the zero state for the whole switch: without it the hook would flip back to
  // true a couple of frames after `fresh` went null and re-reveal the outgoing mode's numbers.
  const entered = useEnterAnimation(fresh) && !!fresh;

  return (
    <section className={`${cardNoBg} flex h-full flex-col gap-4`}>
      <h2 className="text-base font-semibold tracking-tight">Patient mix</h2>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Segments options={["funding", "referral source"]} value={mode} onChange={onModeChange} />
        <PeriodSelector value={mixRange} onChange={onRangeChange} onApplyCustomRange={onPreviewCustomRange} />
      </div>

      {!mix && <p className="text-center text-xs text-black/50">Loading real patient mix…</p>}

      {mix && total === 0 && <p className="text-center text-xs text-black/50">No patient mix data yet.</p>}

      {mix && total > 0 && (
        <>
          <div className="relative mx-auto h-44 w-44">
            <svg
              viewBox="0 0 120 120"
              role="img"
              aria-label={fresh ? `${mode} mix, ${total} total` : `Loading ${mode} mix`}
              className="h-full w-full -rotate-90"
            >
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
                    className="transition-[stroke-dasharray] duration-300 ease-out"
                  />
                );
              })}
            </svg>
            <div
              className={`absolute inset-0 flex flex-col items-center justify-center gap-0.5 transition-all duration-300 ease-out ${entered ? "scale-100 opacity-100" : "scale-75 opacity-0"}`}
            >
              <strong className="text-3xl font-semibold tracking-tight">{total}</strong>
              <small className="text-[11px] text-black/55">{mode === "funding" ? "patients" : "new patients"}</small>
            </div>
          </div>
          <div>
            {mix.map((slice, i) => (
              <div
                className={`flex items-center gap-3 border-b border-black/10 py-2.5 transition-all duration-300 ease-out last:border-0 ${
                  entered ? "translate-x-0 opacity-100" : "-translate-x-2 opacity-0"
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
