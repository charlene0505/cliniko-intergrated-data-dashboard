"use client";

import fixture from "@/lib/ui/overview-fixtures.json";
import { Segments } from "./segments";
import { panel, tagAlert, tagNew, tagYellow } from "./ui";

type Highlight = (typeof fixture.highlights)[number];

const FILTERS = ["All", "High cancellation risk", "AHTR not updated", "New patient"];
const PRACTICES = ["Hurstville", "CBD", "All practices"];

function PracticeLinks({ practice, onPracticeChange }: { practice: string; onPracticeChange: (v: string) => void }) {
  return (
    <div className="flex items-center gap-2 text-xs">
      {PRACTICES.map((p, i) => (
        <span key={p} className="flex items-center gap-2">
          {i > 0 && <span className="text-black">•</span>}
          <button
            type="button"
            onClick={() => onPracticeChange(p)}
            className={`cursor-pointer border-0 bg-transparent p-0 font-medium transition-colors hover:text-black ${
              p === practice ? "text-black underline underline-offset-2" : "text-black/60"
            }`}
          >
            {p}
          </button>
        </span>
      ))}
    </div>
  );
}

export function HighlightedPatientsPanel({
  visible,
  filter,
  onFilterChange,
  practice,
  onPracticeChange,
  onPreview,
}: {
  visible: Highlight[];
  filter: string;
  onFilterChange: (v: string) => void;
  practice: string;
  onPracticeChange: (v: string) => void;
  onPreview: (label: string) => void;
}) {
  return (
    <section className={`${panel} h-115`}>
      <div className="flex flex-col gap-3 px-6 py-4">
        <div className="flex items-center justify-between gap-3 py-2">
          <h2 className="text-base font-semibold tracking-tight">Highlighted Patients from Today</h2>
          <PracticeLinks practice={practice} onPracticeChange={onPracticeChange} />
        </div>
        <div className="self-start">
          <Segments options={FILTERS} value={filter} onChange={onFilterChange} />
        </div>
      </div>
      <div className="flex-1 overflow-y-auto">
        {visible.map((h) => (
          <div className="mx-6 flex items-center justify-between gap-3.5 border-b border-black/10 py-3 last:border-0" key={h.name}>
            <div className="flex min-w-0 flex-wrap items-baseline gap-2.5">
              <time className="w-16 flex-none text-xs font-semibold text-black/65">{h.time}</time>
              <button
                className="cursor-pointer border-0 bg-transparent p-0 text-left font-semibold text-[#0b7276] hover:text-[#14a3a8]"
                onClick={() => onPreview(h.name)}
              >
                {h.name}
              </button>
              <span className={h.reason === "New patient" ? tagNew : h.reason === "AHTR not updated" ? tagYellow : tagAlert}>{h.reason}</span>
              <small className="text-xs text-black/55">{h.note}</small>
            </div>
            <p className="whitespace-nowrap text-right text-xs text-black/50">
              {h.clinician}
              <small className="block text-[11px] text-black/40">{h.practice}</small>
            </p>
          </div>
        ))}
        {!visible.length && <p className="p-6 text-center text-sm text-black/50">No patients match these filters.</p>}
      </div>
    </section>
  );
}
