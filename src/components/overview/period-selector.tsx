"use client";

import { useEffect, useRef, useState } from "react";
import { CustomRangeForm } from "./custom-range-form";

export const PERIOD_OPTIONS = ["Last 7 Days", "Last 30 Days", "Year to Date", "Last Year"] as const;

function daysBefore(now: Date, n: number): Date {
  return new Date(now.getFullYear(), now.getMonth(), now.getDate() - n);
}

// Mirrors the bucket windows computed server-side (see buildMixBuckets in attendance-stats.ts /
// the referral_stats period cutoffs) so the displayed range always matches what the data covers.
function resolveRange(value: string, now: Date): { start: Date; end: Date } {
  switch (value) {
    case "Last 7 Days":
      return { start: daysBefore(now, 6), end: now };
    case "Year to Date":
      return { start: new Date(now.getFullYear(), 0, 1), end: now };
    case "Last Year":
      return { start: daysBefore(now, 364), end: now };
    default: // "Last 30 Days"
      return { start: daysBefore(now, 29), end: now };
  }
}

function formatDate(d: Date): string {
  return d.toLocaleDateString("en-AU", { day: "2-digit", month: "2-digit", year: "numeric" });
}

function CalendarIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="none" className="h-3.5 w-3.5 flex-none text-black/50" aria-hidden="true">
      <rect x="3" y="4.5" width="14" height="12" rx="2" stroke="currentColor" strokeWidth="1.4" />
      <path d="M3 8h14" stroke="currentColor" strokeWidth="1.4" />
      <path d="M6.5 3v3M13.5 3v3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  );
}

// Shared by every panel that offers a time-range filter (Patient mix, Top referring doctors, New
// vs Returning patients): a preset dropdown, plus a date-range display next to it that doubles as
// the trigger for a custom From/To form — mirroring a preset-dropdown + range-picker pattern.
export function PeriodSelector({ value, onChange, onApplyCustomRange }: { value: string; onChange: (v: string) => void; onApplyCustomRange: () => void }) {
  const [open, setOpen] = useState(false);
  const [showCustom, setShowCustom] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
        setShowCustom(false);
      }
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  const { start, end } = resolveRange(value, new Date());

  return (
    <div ref={rootRef} className="flex flex-wrap items-center gap-2">
      <div className="relative">
        <button
          type="button"
          aria-expanded={open}
          onClick={() => {
            setOpen((o) => !o);
            setShowCustom(false);
          }}
          className="flex items-center gap-1.5 rounded-2xl border border-black/10 bg-white px-3 py-1.5 text-xs font-semibold text-ink"
        >
          {value}
          <span className={`text-[9px] transition-transform ${open ? "rotate-180" : ""}`} aria-hidden="true">▾</span>
        </button>
        {open && (
          <div className="absolute left-0 top-full z-20 mt-1 w-40 overflow-hidden rounded-2xl border border-black/10 bg-white py-1 shadow-lg">
            {PERIOD_OPTIONS.map((option) => (
              <button
                key={option}
                type="button"
                aria-pressed={option === value}
                onClick={() => {
                  onChange(option);
                  setOpen(false);
                }}
                className={`flex w-full items-center justify-between px-3 py-2 text-left text-xs whitespace-nowrap transition-colors ${
                  option === value ? "bg-ink font-semibold text-white" : "font-medium text-black/70 hover:bg-black/5"
                }`}
              >
                {option}
                {option === value && <span aria-hidden="true">✓</span>}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="relative">
        <button
          type="button"
          aria-expanded={showCustom}
          onClick={() => {
            setShowCustom((s) => !s);
            setOpen(false);
          }}
          className="flex items-center gap-1.5 rounded-2xl border border-black/10 bg-white px-3 py-1.5 text-xs font-medium whitespace-nowrap text-black/70"
        >
          <CalendarIcon />
          {formatDate(start)} - {formatDate(end)}
        </button>
        {showCustom && (
          <div className="absolute right-0 top-full z-20 mt-1 rounded-2xl border border-black/10 bg-white p-3 shadow-lg">
            <CustomRangeForm
              onApply={() => {
                onApplyCustomRange();
                setShowCustom(false);
              }}
            />
          </div>
        )}
      </div>
    </div>
  );
}
