import { getDb } from '@/lib/mongodb';
import { computeTodayApptStats, computeAppointmentVolumeStats } from '@/lib/attendance-stats';
import { computeReferralVolumeStats } from '@/lib/referrals';

export async function GET() {
  try {
    const db = await getDb();
    const [today, appointments, referrals] = await Promise.all([
      computeTodayApptStats(db),
      computeAppointmentVolumeStats(db),
      computeReferralVolumeStats(db),
    ]);
    if (!today && !appointments && !referrals) return Response.json({ status: 'no_data' });
    return Response.json({ status: 'ok', today, appointments, referrals });
  } catch {
    return Response.json({ status: 'error', error: 'Unable to load KPI data.' }, { status: 500 });
  }
}
