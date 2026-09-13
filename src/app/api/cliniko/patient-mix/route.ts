import { getDb } from '@/lib/mongodb';
import { computeFundingMix, computeReferralSourceMix } from '@/lib/patient-mix';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const mode = searchParams.get('mode') === 'referral source' ? 'referral source' : 'funding';

  try {
    const db = await getDb();
    const mix = mode === 'funding' ? await computeFundingMix(db) : await computeReferralSourceMix(db);
    if (!mix) return Response.json({ status: 'no_data' });
    return Response.json({ status: 'ok', mode, mix });
  } catch {
    return Response.json({ error: 'Unable to load patient mix.' }, { status: 503 });
  }
}
