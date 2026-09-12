"use client";

// Rendered as a child inside the same pill-group container as the period Segments buttons
// (see PeriodSelector), not as its own bordered card — so no background/border of its own here.
// basis-full forces it onto its own wrapped line below `lg`; from `lg` up it sits inline with
// the pills in the same row.
export function CustomRangeForm({ onApply }: { onApply: () => void }) {
  return (
    <form
      className="flex basis-full flex-wrap items-center gap-1.5 lg:basis-auto"
      onSubmit={(e) => {
        e.preventDefault();
        onApply();
      }}
    >
      <label className="flex items-center pl-2 gap-1 text-xs font-medium text-black/60">
        From
        <input required type="date" defaultValue="2026-06-01" className="rounded-md border-0 bg-white px-1 py-1 text-xs" />
      </label>
      <label className="flex items-center gap-1 text-xs font-medium text-black/60">
        To
        <input required type="date" defaultValue="2026-09-12" className="rounded-md border-0 bg-white px-1 py-1 text-xs" />
      </label>
      <button className="rounded-2xl bg-ink px-2 py-1 text-xs font-semibold whitespace-nowrap text-white transition-colors hover:bg-teal-600">Apply</button>
    </form>
  );
}
