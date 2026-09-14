"use client";

import { useRef } from "react";
import { KpiGrid } from "./kpi-grid";
import { PRACTICE_CHOICES, type PracticeChoice } from "@/lib/practices";

// When on, the dashboard shows pre-filled content instead of querying live data (currently the
// today's-briefing modal).
// function DataBlurToggle() {
//   const [enabled, setEnabled] = useDataBlur();
//   return (
//     <button
//       type="button"
//       role="switch"
//       aria-checked={enabled}
//       onClick={() => setEnabled(!enabled)}
//       className="flex cursor-pointer items-center gap-2 rounded-full border border-black/10 bg-white px-3 py-2 text-xs font-semibold text-ink transition-colors hover:bg-black/5"
//     >
//       <span className={`relative inline-block h-4 w-7 rounded-full transition-colors ${enabled ? "bg-teal-500" : "bg-black/20"}`}>
//         <span
//           className={`absolute top-0.5 left-0 h-3 w-3 rounded-full bg-white transition-transform ${enabled ? "translate-x-3.5" : "translate-x-0.5"}`}
//         />
//       </span>
//       Data blur
//     </button>
//   );
// }

// Compact location picker under the greeting. Switching here drives the banner's KPI boxes and the
// highlighted patients below; native details/summary keeps it keyboard-accessible without extra state.
function PracticeSwitcher({ practice, onPracticeChange }: { practice: PracticeChoice; onPracticeChange: (v: PracticeChoice) => void }) {
  const detailsRef = useRef<HTMLDetailsElement>(null);

  return (
    <details ref={detailsRef} className="group relative mt-3 w-fit">
      <summary className="flex cursor-pointer list-none items-center gap-2 rounded-full bg-white px-2 py-1 text-sm font-semibold text-ink shadow-sm transition-colors hover:bg-white/50 [&::-webkit-details-marker]:hidden">
        <span aria-hidden="true" className="text-teal-600">●</span>
        <span>{practice}</span>
        <span aria-hidden="true" className="text-[10px] text-black/45 transition-transform group-open:rotate-180">▼</span>
      </summary>
      <nav aria-label="Practice" className="absolute left-0 top-full z-30 mt-1 min-w-44 overflow-hidden rounded-2xl border border-black/10 bg-white py-1 shadow-lg">
        {PRACTICE_CHOICES.map((option) => (
          <button
            key={option}
            type="button"
            aria-pressed={option === practice}
            onClick={() => {
              onPracticeChange(option);
              detailsRef.current?.removeAttribute("open");
            }}
            className={`flex w-full items-center justify-between gap-4 px-4 py-2.5 text-left text-sm transition-colors hover:bg-black/5 ${
              option === practice ? "font-semibold text-ink" : "font-medium text-black/60"
            }`}
          >
            {option}
            {option === practice && <span className="text-teal-600" aria-hidden="true">✓</span>}
          </button>
        ))}
      </nav>
    </details>
  );
}

export function OverviewHeader({
  lastSyncedAt,
  onLogout,
  kpis,
  greetingName,
  practice,
  onPracticeChange,
}: {
  lastSyncedAt: string | null;
  onLogout: () => void;
  kpis: readonly (readonly [label: string, value: string, delta: string, tooltip: string])[];
  greetingName: string | null;
  practice: PracticeChoice;
  onPracticeChange: (v: PracticeChoice) => void;
}) {
  return (
    <header className=" bg-neutral-50">
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-black/10 px-7 py-3.5">
        <span className="flex items-center gap-1.5 text-xs text-black/60">
          <span className="block h-1.5 w-1.5 rounded-full bg-teal-500" />
          {lastSyncedAt
            ? `Cliniko · synced ${new Date(lastSyncedAt).toLocaleTimeString("en-AU", { timeZone: "Australia/Sydney", hour: "2-digit", minute: "2-digit" })}`
            : "Cliniko Integrated Smart Dashboard"}
        </span>
        <div className="flex items-center gap-3">
          {/* <DataBlurToggle /> */}
          <button
            onClick={onLogout}
            className="rounded-full border border-ink bg-ink px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-teal-600 hover:border-teal-600"
          >
            Log out
          </button>
        </div>
      </div>
      <div className="px-7 py-5">
        <div className="flex flex-wrap items-center justify-between gap-7 rounded-3xl bg-banner p-7">
          <div className="min-w-[230px] flex-1">
            <p className="text-xs text-black/60">
              {new Date().toLocaleDateString("en-AU", { timeZone: "Australia/Sydney", weekday: "long", day: "numeric", month: "long", year: "numeric" })}
            </p>
            <h1 className="mt-4 text-3xl font-semibold tracking-tight">Hello, {greetingName ?? "there"}</h1>
            <PracticeSwitcher practice={practice} onPracticeChange={onPracticeChange} />
          </div>
          <KpiGrid items={kpis} compact />
          <div className="flex flex-col items-end justify-center">
            <p className="mt-1 text-4xl font-extrabold">Sydney</p>
            <p className="mt-1 text-xl font-medium">Physiotherapy</p>
          </div>
        </div>
      </div>
    </header>
  );
}
