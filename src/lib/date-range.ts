// Calendar-day ranges shared by the period picker (client) and the API routes (server), so a preset
// resolves to exactly the same days on both sides. Days are practice-local "YYYY-MM-DD" strings — the
// same form `daily_stats` and `visits` are keyed by — which turns a range filter into a plain indexed
// string comparison with no timezone maths at query time.

export const PRACTICE_TIME_ZONE = "Australia/Sydney";

export const PERIOD_OPTIONS = ["Last 7 Days", "Last 30 Days", "Year to Date", "Last Year"] as const;
export type PeriodPreset = (typeof PERIOD_OPTIONS)[number];

export interface DateRange {
  from: string; // inclusive
  to: string; // inclusive
}

export type Period = PeriodPreset | DateRange;

// Built once: constructing an Intl formatter is far slower than calling one, and the sync formats a
// date for every patient and visit.
const dayFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: PRACTICE_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

export function practiceDay(date: Date): string {
  return dayFormatter.format(date);
}

function addDays(day: string, n: number): string {
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

export function isDay(value: string | null): value is string {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  // Round-tripped so an impossible date like 2026-02-30 (which Date silently rolls into March) fails.
  const d = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value;
}

export function resolvePeriod(period: Period, now = new Date()): DateRange {
  if (typeof period !== "string") return period;
  const today = practiceDay(now);
  switch (period) {
    case "Last 7 Days":
      return { from: addDays(today, -6), to: today };
    case "Year to Date":
      return { from: `${today.slice(0, 4)}-01-01`, to: today };
    case "Last Year":
      return { from: addDays(today, -364), to: today };
    default: // "Last 30 Days"
      return { from: addDays(today, -29), to: today };
  }
}

// Reads `from`/`to` off an API request. Anything missing or malformed falls back to the default preset
// rather than erroring, the same way the routes already treat an unknown `mode` or `range` param.
export function parseRangeParams(params: URLSearchParams, now = new Date()): DateRange {
  const from = params.get("from");
  const to = params.get("to");
  return isDay(from) && isDay(to) && from <= to ? { from, to } : resolvePeriod("Last 30 Days", now);
}

export function rangeSearch(range: DateRange): string {
  return `from=${range.from}&to=${range.to}`;
}
