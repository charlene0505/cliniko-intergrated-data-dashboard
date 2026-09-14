import { getDb } from '@/lib/mongodb';
import { computeTodayApptStats, computeAppointmentVolumeStats } from '@/lib/attendance-stats';
import { computeReferralVolumeStats } from '@/lib/referrals';
import { PRACTICES } from '@/lib/practices';

export async function GET(request: Request) {
  // `practice` is a Cliniko business id; anything unrecognised (or none) means all practices.
  const practiceParam = new URL(request.url).searchParams.get('practice');
  const businessId = PRACTICES.some((p) => p.id === practiceParam) ? practiceParam : null;

  try {
    const db = await getDb();
    const now = new Date();
    const [today, appointments, referrals] = await Promise.all([
      computeTodayApptStats(db, now, businessId),
      computeAppointmentVolumeStats(db, now, businessId),
      computeReferralVolumeStats(db, now, businessId),
    ]);
    if (!today && !appointments && !referrals) return Response.json({ status: 'no_data' });
    return Response.json({ status: 'ok', today, appointments, referrals });
  } catch {
    return Response.json({ status: 'error', error: 'Unable to load KPI data.' }, { status: 500 });
  }
}
