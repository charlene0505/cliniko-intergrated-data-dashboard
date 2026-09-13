import { getDb } from '@/lib/mongodb';
import { readReferrals } from '@/lib/referrals';

export async function GET() {
  try {
    return Response.json(await readReferrals(await getDb()));
  } catch {
    return Response.json({ status: 'error', error: 'Unable to load referral data.' }, { status: 500 });
  }
}
