import type { Db } from 'mongodb';
import type { ReferralStat, SyncJob } from './models';

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
