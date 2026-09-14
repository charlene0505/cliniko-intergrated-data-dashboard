import { getDb } from '@/lib/mongodb';
import { parseRangeParams } from '@/lib/date-range';
import { readPatientMix, type PatientMixMode } from '@/lib/patient-mix';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const mode: PatientMixMode = searchParams.get('mode') === 'Referral source' ? 'Referral source' : 'Funding';
  const range = parseRangeParams(searchParams);

  try {
    // An indexed range query over `visits` / `daily_stats` (both rebuilt during sync), fast enough for
    // any range — so nothing is precomputed per period.
    const mix = await readPatientMix(await getDb(), mode, range);
    if (!mix) return Response.json({ status: 'no_data', mode, ...range });
    return Response.json({ status: 'ok', mode, ...range, mix });
  } catch {
    return Response.json({ error: 'Unable to load patient mix.' }, { status: 503 });
  }
}
