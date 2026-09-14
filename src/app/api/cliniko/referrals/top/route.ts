import { getDb } from '@/lib/mongodb';
import { parseRangeParams } from '@/lib/date-range';
import { readTopReferrers } from '@/lib/referrals';

export async function GET(request: Request) {
  const range = parseRangeParams(new URL(request.url).searchParams);
  try {
    const topReferrers = await readTopReferrers(await getDb(), range);
    if (!topReferrers) return Response.json({ status: 'no_data', ...range });
    return Response.json({ status: 'ok', ...range, topReferrers });
  } catch {
    return Response.json({ status: 'error', error: 'Unable to load referral data.' }, { status: 500 });
  }
}
