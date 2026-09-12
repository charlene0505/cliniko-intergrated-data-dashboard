import { getDb } from '@/lib/mongodb';
import { computeNoShowStats, computePatientMixStats } from '@/lib/attendance-stats';
import type { PatientMixRange } from '@/lib/attendance-stats';

const MIX_RANGES: PatientMixRange[] = ['Last week', 'Last month', 'Last quarter'];

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const rangeParam = searchParams.get('range');
    const range = (MIX_RANGES as string[]).includes(rangeParam ?? '') ? (rangeParam as PatientMixRange) : 'Last month';

    const db = await getDb();
    const [noShows, patientMix] = await Promise.all([
      computeNoShowStats(db),
      computePatientMixStats(db, range),
    ]);
    if (!noShows || !patientMix) return Response.json({ status: 'no_data' });
    return Response.json({ status: 'ok', noShows, patientMix });
  } catch {
    return Response.json({ status: 'error', error: 'Unable to load attendance data.' }, { status: 500 });
  }
}
