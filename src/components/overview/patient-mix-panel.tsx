"use client";

import Link from "next/link";
import { Segments } from "./segments";
import { PeriodSelector } from "./period-selector";
import { cardNoBg, link } from "./ui";

const funding = [
  ["Private", 242, "#0b7276"],
  ["GPCCMP", 90, "#14a3a8"],
  ["CTP", 21, "#8fd3ee"],
  ["Workcover", 18, "#f0a070"],
] as const;
const sources = [
  ["GP / medical centre", 54, "#0b7276"],
  ["Word of mouth", 12, "#14a3a8"],
  ["Google / website", 10, "#8fd3ee"],
  ["Specialist", 6, "#e8dfa0"],
  ["Existing patient", 3, "#f0a070"],
  ["WorkCover / insurer", 2, "#c9c6bd"],
] as const;

export function PatientMixPanel({
  mode,
  onModeChange,
  mixRange,
  onRangeChange,
  onPreviewCustomRange,
  onPreviewBookings,
}: {
  mode: string;
  onModeChange: (v: string) => void;
  mixRange: string;
  onRangeChange: (v: string) => void;
  onPreviewCustomRange: () => void;
  onPreviewBookings: () => void;
}) {
  const mix = mode === "funding" ? funding : sources;
  const total = mix.reduce((sum, row) => sum + row[1], 0);

  return (
    <section className={`${cardNoBg} flex flex-col gap-4`}>
      <h2 className="text-base font-semibold tracking-tight">Patient mix</h2>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Segments options={["funding", "referral source"]} value={mode} onChange={onModeChange} />
        <PeriodSelector value={mixRange} onChange={onRangeChange} onApplyCustomRange={onPreviewCustomRange} />
        {mode === "referral source" ? (
          <Link className={link} href="/referrals">Detail →</Link>
        ) : (
          <button className={link} onClick={onPreviewBookings}>Detail →</button>
        )}
      </div>
      <div className="relative mx-auto h-44 w-44">
        <svg viewBox="0 0 120 120" role="img" aria-label={`Sample ${mode} mix, ${total} total`} className="h-full w-full -rotate-90">
          {mix.map(([mLabel, value, color], i) => {
            const c = 2 * Math.PI * 46;
            const offset = (mix.slice(0, i).reduce((n, r) => n + r[1], 0) / total) * c;
            const len = (value / total) * c;
            return (
              <circle
                key={mLabel}
                cx="60"
                cy="60"
                r="46"
                fill="none"
                stroke={color}
                strokeWidth="19"
                strokeDasharray={`${Math.max(len - 2, 0)} ${c - Math.max(len - 2, 0)}`}
                strokeDashoffset={-offset}
              />
            );
          })}
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-0.5">
          <strong className="text-3xl font-semibold tracking-tight">{total}</strong>
          <small className="text-[11px] text-black/55">{mode === "funding" ? "appointments" : "new patients"}</small>
        </div>
      </div>
      <div>
        {mix.map(([mLabel, value, color]) => (
          <div className="flex items-center gap-3 border-b border-black/10 py-2.5 last:border-0" key={mLabel}>
            <i style={{ background: color }} className="block h-2.5 w-2.5 flex-none rounded-sm" />
            <span className="flex-1 text-sm">{mLabel}</span>
            <strong className="text-sm font-semibold tabular-nums">{value}</strong>
            <small className="w-12 text-right text-xs text-black/50 tabular-nums">{((value / total) * 100).toFixed(1)}%</small>
          </div>
        ))}
      </div>
    </section>
  );
}
