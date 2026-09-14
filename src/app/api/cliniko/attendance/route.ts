import { getDb } from '@/lib/mongodb';
import { computeAttendance, readStoredAttendance, storeAttendance, type PatientMixRange } from '@/lib/attendance-stats';

const MIX_RANGES: PatientMixRange[] = ['Last 7 Days', 'Last 30 Days', 'Year to Date', 'Last Year'];

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const rangeParam = searchParams.get('range');
    const range = (MIX_RANGES as string[]).includes(rangeParam ?? '') ? (rangeParam as PatientMixRange) : 'Last 30 Days';

    const db = await getDb();

    // Normal path: sync has already computed this range, so it's a single indexed read.
    const stored = await readStoredAttendance(db, range);
    if (stored) {
      return Response.json({ status: 'ok', noShows: stored.noShows, patientMix: stored.patientMix, computedAt: stored.computedAt });
    }

    // Only before the first sync that populates the collection. The underlying scan is slow, so the
    // result is stored on the way out rather than recomputed for the next caller.
    const value = await computeAttendance(db, range);
    if (!value) return Response.json({ status: 'no_data' });
    await storeAttendance(db, range, value);
    return Response.json({ status: 'ok', ...value, computedAt: new Date() });
  } catch {
    return Response.json({ status: 'error', error: 'Unable to load attendance data.' }, { status: 500 });
  }
}
