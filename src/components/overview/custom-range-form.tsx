"use client";

import { useState } from "react";
import type { DateRange } from "@/lib/date-range";

// Rendered inside the floating popover that the date-range button in PeriodSelector opens. It mounts
// fresh each time the popover opens, so it always starts from the range currently applied.
export function CustomRangeForm({ initial, onApply }: { initial: DateRange; onApply: (range: DateRange) => void }) {
  const [from, setFrom] = useState(initial.from);
  const [to, setTo] = useState(initial.to);

  return (
    <form
      className="flex flex-col gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        if (from && to && from <= to) onApply({ from, to });
      }}
    >
      <label className="flex items-center justify-between gap-3 text-xs font-medium whitespace-nowrap text-black/60">
        From
        <input
          required
          type="date"
          value={from}
          max={to || undefined}
          onChange={(e) => setFrom(e.target.value)}
          className="rounded-md border border-black/10 bg-white px-1.5 py-1 text-xs"
        />
      </label>
      <label className="flex items-center justify-between gap-3 text-xs font-medium whitespace-nowrap text-black/60">
        To
        <input
          required
          type="date"
          value={to}
          min={from || undefined}
          onChange={(e) => setTo(e.target.value)}
          className="rounded-md border border-black/10 bg-white px-1.5 py-1 text-xs"
        />
      </label>
      <button className="rounded-2xl bg-ink px-2 py-1 text-xs font-semibold whitespace-nowrap text-white transition-colors hover:bg-teal-600">Apply</button>
    </form>
  );
}
