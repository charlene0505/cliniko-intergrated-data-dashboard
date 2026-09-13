"use client";

// Rendered inside the floating popover that the date-range button in PeriodSelector opens.
export function CustomRangeForm({ onApply }: { onApply: () => void }) {
  return (
    <form
      className="flex flex-col gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        onApply();
      }}
    >
      <label className="flex items-center justify-between gap-3 text-xs font-medium whitespace-nowrap text-black/60">
        From
        <input required type="date" defaultValue="2026-06-01" className="rounded-md border border-black/10 bg-white px-1.5 py-1 text-xs" />
      </label>
      <label className="flex items-center justify-between gap-3 text-xs font-medium whitespace-nowrap text-black/60">
        To
        <input required type="date" defaultValue="2026-09-12" className="rounded-md border border-black/10 bg-white px-1.5 py-1 text-xs" />
      </label>
      <button className="rounded-2xl bg-ink px-2 py-1 text-xs font-semibold whitespace-nowrap text-white transition-colors hover:bg-teal-600">Apply</button>
    </form>
  );
}
