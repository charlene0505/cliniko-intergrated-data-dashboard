import { getDb } from '@/lib/mongodb';
import { getSession } from '@/lib/auth';
import { receptionistIdFor } from '@/lib/display-name';
import { computeTodayBriefing } from '@/lib/today-briefing';

// A rule-based preview of "what's going on today" for whichever practice the logged-in
// receptionist is rostered at today — not a live AI call yet (see mockSummarize in
// today-briefing.ts), just the shape of the feature over real appointment/note data.
export async function GET() {
  const session = await getSession();
  if (!session) return Response.json({ error: 'Authentication required' }, { status: 401 });

  const receptionistId = receptionistIdFor(session.username);
  if (!receptionistId) return Response.json({ status: 'no_identity' });

  try {
    return Response.json(await computeTodayBriefing(await getDb(), receptionistId));
  } catch {
    return Response.json({ error: "Unable to build today's briefing." }, { status: 503 });
  }
}
