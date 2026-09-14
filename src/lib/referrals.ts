import type { Db } from 'mongodb';
import type { Patient, ReferralStat, SyncJob, Visit } from './models';
import { PRACTICE_TIME_ZONE, type DateRange } from './date-range';
import { hasDailyStats, replaceDailyStats, sumDailyStats } from './daily-stats';
import { ensureVisits } from './patient-mix';

export interface ReferralVolumeStats {
  count: number;
  deltaPercent: number | null;
}

export type TopReferrer = ReferralStat['topReferrers'][number];

// Mirrors the referral_stats '7d' bucket (new patients with a referrer, trailing 7 days) but
// also fetches the prior 7-day window so the KPI can show a week-over-week delta, which the
// precomputed stats don't carry.
export async function computeReferralVolumeStats(
  db: Db,
  now = new Date(),
  businessId: string | null = null,
): Promise<ReferralVolumeStats | null> {
  // "Has patients ever synced" is checked separately from the windowed query below, so a
  // genuinely quiet week (zero new referrals) reports as a real 0 rather than falling back to
  // placeholder data.
  const hasSynced = await db.collection<Patient>('patients').findOne({}, { projection: { _id: 1 } });
  if (!hasSynced) return null;

  const weekMs = 7 * 24 * 3600 * 1000;
  const thisWeekStart = new Date(now.getTime() - weekMs);
  const lastWeekStart = new Date(now.getTime() - 2 * weekMs);

  let patients = await db.collection<Patient>('patients')
    .find(
      { isDeleted: false, referringDoctorId: { $ne: null }, clinikoCreatedAt: { $gte: lastWeekStart, $lt: now } },
      { projection: { clinikoCreatedAt: 1 } },
    )
    .toArray();

  // Patients carry no practice of their own, so for one practice a referral counts when that patient
  // has a booking there — at any time, since a brand-new referral's first visit is often still ahead.
  // A referral with no booking yet anywhere only shows under all practices.
  if (businessId && patients.length) {
    const atPractice = (await ensureVisits(db))
      ? new Set<string>(
          await db.collection<Visit>('visits').distinct('patientId', { businessId, patientId: { $in: patients.map((p) => p._id) } }),
        )
      : new Set<string>();
    patients = patients.filter((p) => atPractice.has(p._id));
  }

  let thisWeek = 0, lastWeek = 0;
  for (const p of patients) {
    if (new Date(p.clinikoCreatedAt) >= thisWeekStart) thisWeek++;
    else lastWeek++;
  }

  const deltaPercent = lastWeek ? Math.round(((thisWeek - lastWeek) / lastWeek) * 1000) / 10 : null;
  return { count: thisWeek, deltaPercent };
}

// Rebuilt at the end of a patients sync: new patients with a referring doctor, counted per doctor per
// practice-local creation day. Grouped entirely inside MongoDB, so only the daily totals come back.
export async function rebuildReferralDailyStats(db: Db): Promise<void> {
  const rows = await db.collection<Patient>('patients')
    .aggregate<{ _id: { date: string; key: string }; count: number }>([
      { $match: { isDeleted: false, referringDoctorId: { $ne: null } } },
      { $group: {
        _id: {
          date: { $dateToString: { format: '%Y-%m-%d', date: '$clinikoCreatedAt', timezone: PRACTICE_TIME_ZONE } },
          key: '$referringDoctorId',
        },
        count: { $sum: 1 },
      }},
    ])
    .toArray();
  await replaceDailyStats(db, 'referrals', rows.map(r => ({ date: r._id.date, key: r._id.key, count: r.count })));
}

// Top referrers for any date range, summed from the daily rollups. Returns null only when patients
// have never been synced.
export async function readTopReferrers(db: Db, range: DateRange, limit = 20): Promise<TopReferrer[] | null> {
  if (!(await hasDailyStats(db, 'referrals'))) {
    const hasSynced = await db.collection<Patient>('patients').findOne({}, { projection: { _id: 1 } });
    if (!hasSynced) return null;
    // Before the first sync that builds the rollups (e.g. straight after deploying this).
    await rebuildReferralDailyStats(db);
  }

  return db.collection('daily_stats')
    .aggregate<TopReferrer>([
      ...sumDailyStats('referrals', range),
      { $sort: { count: -1, _id: 1 } },
      { $lookup: { from: 'doctors', localField: '_id', foreignField: '_id', as: 'doctor' } },
      // Same rule as referral_stats: skip doctors since deleted from Cliniko (no matching doctor record)
      { $match: { doctor: { $ne: [] } } },
      { $limit: limit },
      { $unwind: '$doctor' },
      { $project: { _id: 0, doctorId: '$_id', displayName: '$doctor.displayName', count: 1 } },
    ])
    .toArray();
}

export async function readReferrals(db: Db) {
    // Check if a sync is currently running
    const runningSyncJob = await db.collection<SyncJob>('sync_jobs').findOne(
      { status: 'running', scope: 'patients' },
      { sort: { startedAt: -1 } }
    );

    // Fetch all pre-computed stat periods in one query
    const stats = await db.collection<ReferralStat>('referral_stats')
      .find()
      .toArray();

    // No data at all — database is empty, sync has never run
    if (stats.length === 0) {
      return {
        status: runningSyncJob ? 'syncing' : 'no_data',
        message: runningSyncJob
          ? 'Initial sync is in progress. This may take a few minutes.'
          : 'No data yet. Trigger a sync to populate the dashboard.',
      };
    }

    // Index stats by period for easy lookup
    const byPeriod = Object.fromEntries(stats.map(s => [s._id, s]));

    // Find the last completed sync job for "last updated" display
    const lastSync = await db.collection<SyncJob>('sync_jobs').findOne(
      { status: 'complete', scope: 'patients' },
      { sort: { completedAt: -1 } }
    );

    return {
      status: 'ok',
      isSyncing: !!runningSyncJob,
      lastSyncedAt: lastSync?.completedAt ?? null,
      stats: byPeriod,
      contactFailures: lastSync?.contactFailures ?? [],
    };

}
