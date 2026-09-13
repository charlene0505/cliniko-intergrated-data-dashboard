import type { Db } from 'mongodb';
import type { Patient, ReferralStat, SyncJob } from './models';

export interface ReferralVolumeStats {
  count: number;
  deltaPercent: number | null;
}

// Mirrors the referral_stats '7d' bucket (new patients with a referrer, trailing 7 days) but
// also fetches the prior 7-day window so the KPI can show a week-over-week delta, which the
// precomputed stats don't carry.
export async function computeReferralVolumeStats(db: Db, now = new Date()): Promise<ReferralVolumeStats | null> {
  // "Has patients ever synced" is checked separately from the windowed query below, so a
  // genuinely quiet week (zero new referrals) reports as a real 0 rather than falling back to
  // placeholder data.
  const hasSynced = await db.collection<Patient>('patients').findOne({}, { projection: { _id: 1 } });
  if (!hasSynced) return null;

  const weekMs = 7 * 24 * 3600 * 1000;
  const thisWeekStart = new Date(now.getTime() - weekMs);
  const lastWeekStart = new Date(now.getTime() - 2 * weekMs);

  const patients = await db.collection<Patient>('patients')
    .find(
      { isDeleted: false, referringDoctorId: { $ne: null }, clinikoCreatedAt: { $gte: lastWeekStart, $lt: now } },
      { projection: { clinikoCreatedAt: 1 } },
    )
    .toArray();

  let thisWeek = 0, lastWeek = 0;
  for (const p of patients) {
    if (new Date(p.clinikoCreatedAt) >= thisWeekStart) thisWeek++;
    else lastWeek++;
  }

  const deltaPercent = lastWeek ? Math.round(((thisWeek - lastWeek) / lastWeek) * 1000) / 10 : null;
  return { count: thisWeek, deltaPercent };
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
