import type { Db, Document } from "mongodb";
import type { DailyMetric, DailyStat } from "./models";
import type { DateRange } from "./date-range";
import { replaceDerived } from "./derived";

// ── Daily rollups ────────────────────────────────────────────────────────────
//
// Additive counts (referrals per doctor, new patients per referral source) are stored as one document
// per practice-local day per key, rebuilt at the end of a sync. Any date range — preset or custom — is
// then a sum over at most one document per day per key, so the query cost is bounded by the length of
// the range rather than the number of underlying patients or appointments.

export async function replaceDailyStats(
  db: Db,
  metric: DailyMetric,
  rows: { date: string; key: string; count: number }[],
): Promise<void> {
  const docs: DailyStat[] = rows.map((r) => ({
    _id: `${metric}|${r.date}|${r.key}`,
    metric,
    date: r.date,
    key: r.key,
    count: r.count,
  }));
  await replaceDerived(db, "daily_stats", { metric }, docs);
}

export async function hasDailyStats(db: Db, metric: DailyMetric): Promise<boolean> {
  return !!(await db.collection<DailyStat>("daily_stats").findOne({ metric }, { projection: { _id: 1 } }));
}

// Leading pipeline stages that total one metric over a range, one row per key (`_id` = key). Callers
// append their own lookups and sorting.
export function sumDailyStats(metric: DailyMetric, range: DateRange): Document[] {
  return [
    { $match: { metric, date: { $gte: range.from, $lte: range.to } } },
    { $group: { _id: "$key", count: { $sum: "$count" } } },
  ];
}
