import { getDb } from '@/lib/mongodb';
import type { ReferralStat, SyncJob } from '@/lib/models';

export async function GET() {
  try {
    const db = await getDb();

    // Check if a sync is currently running
    const runningSyncJob = await db.collection<SyncJob>('sync_jobs').findOne(
      { status: 'running' },
      { sort: { startedAt: -1 } }
    );

    // Fetch all pre-computed stat periods in one query
    const stats = await db.collection<ReferralStat>('referral_stats')
      .find()
      .toArray();

    // No data at all — database is empty, sync has never run
    if (stats.length === 0) {
      return Response.json({
        status: runningSyncJob ? 'syncing' : 'no_data',
        message: runningSyncJob
          ? 'Initial sync is in progress. This may take a few minutes.'
          : 'No data yet. Trigger a sync to populate the dashboard.',
      });
    }

    // Index stats by period for easy lookup
    const byPeriod = Object.fromEntries(stats.map(s => [s._id, s]));

    // Find the last completed sync job for "last updated" display
    const lastSync = await db.collection<SyncJob>('sync_jobs').findOne(
      { status: 'complete' },
      { sort: { completedAt: -1 } }
    );

    return Response.json({
      status: 'ok',
      isSyncing: !!runningSyncJob,
      lastSyncedAt: lastSync?.completedAt ?? null,
      stats: byPeriod,
    });

  } catch (error) {
    return Response.json({
      status: 'error',
      error: error instanceof Error ? error.message : 'Unknown error',
    }, { status: 500 });
  }
}
