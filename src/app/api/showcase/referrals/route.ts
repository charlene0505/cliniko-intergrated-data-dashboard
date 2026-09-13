import { getShowcaseDb } from '@/lib/showcase-db';
import { readReferrals } from '@/lib/referrals';

export async function GET() {
  try {
    return Response.json(await readReferrals(await getShowcaseDb()), { headers: { 'Cache-Control': 'no-store' } });
  } catch {
    return Response.json({ status: 'error', error: 'Showcase is unavailable. Configure and seed the showcase database first.' }, { status: 503 });
  }
}
