"use client";

import { useEffect, useRef, useState } from "react";
import { CustomRangeForm } from "./custom-range-form";
import { PERIOD_OPTIONS, resolvePeriod, type Period } from "@/lib/date-range";

// "YYYY-MM-DD" → "DD/MM/YYYY", split rather than parsed so the day can't shift with the browser's
// timezone.
function formatDay(day: string): string {
  const [year, month, date] = day.split("-");
  return `${date}/${month}/${year}`;
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
export function PeriodSelector({ value, onChange }: { value: Period; onChange: (v: Period) => void }) {
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

  // Resolved by the same helper the API routes use, so the dates shown are exactly the days queried.
  const range = resolvePeriod(value);

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
          {typeof value === "string" ? value : "Custom range"}
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
          {formatDay(range.from)} - {formatDay(range.to)}
        </button>
        {showCustom && (
          <div className="absolute right-0 top-full z-20 mt-1 rounded-2xl border border-black/10 bg-white p-3 shadow-lg">
            <CustomRangeForm
              initial={range}
              onApply={(custom) => {
                onChange(custom);
                setShowCustom(false);
              }}
            />
          </div>
        )}
      </div>
    </div>
  );
}
