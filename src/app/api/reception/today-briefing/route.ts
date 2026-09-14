import { getDb } from '@/lib/mongodb';
import { getSession } from '@/lib/auth';
import { receptionistIdFor } from '@/lib/display-name';
import { computeTodayBriefing } from '@/lib/today-briefing';
import { fixtureBriefing } from '@/lib/today-briefing-curated';

// "What's going on today" plus the next-shift preview. The admin login always gets the stored,
// hand-analysed briefing for both (see today-briefing-curated.ts) and never reads live data. Every other
// login gets a rule-based preview for whichever practice they're rostered at today — not a live AI call
// yet (see mockSummarize in today-briefing.ts), just the shape of the feature over real appointment/note data.
export async function GET() {
  const session = await getSession();
  if (!session) return Response.json({ error: 'Authentication required' }, { status: 401 });

  if (session.role === 'admin') return Response.json(fixtureBriefing());

  const receptionistId = receptionistIdFor(session.username);
  if (!receptionistId) return Response.json({ status: 'no_identity' });

  try {
    return Response.json(await computeTodayBriefing(await getDb(), receptionistId));
  } catch {
    return Response.json({ error: "Unable to build today's briefing." }, { status: 503 });
  }
}
