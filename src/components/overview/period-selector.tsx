"use client";

import { Segments } from "./segments";
import { CustomRangeForm } from "./custom-range-form";

export const PERIOD_OPTIONS = ["Last week", "Last month", "Last quarter"] as const;

// Shared by every panel that offers a time-range filter (Patient mix, Top referring doctors,
// New vs Returning patients) so they always expose the same set of ranges and the same custom
// date-range form, from one place. The date form lives inside the same pill container as the
// period buttons (not a separate card next to it) — on small screens it wraps to its own line
// below the pills; from `lg` up it sits inline with them in one row.
export function PeriodSelector({ value, onChange, onApplyCustomRange }: { value: string; onChange: (v: string) => void; onApplyCustomRange: () => void }) {
  return (
    <Segments options={[...PERIOD_OPTIONS]} value={value} onChange={onChange}>
      <CustomRangeForm onApply={onApplyCustomRange} />
    </Segments>
  );
}
