import { getDb } from '@/lib/mongodb';
import { getSession } from '@/lib/auth';
import { resolveShiftsForDate } from '@/lib/reception';

function today(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// Who's actually on, per practice, for a given date (override-wins-over-recurring). Defaults to
// today when no ?date= is given.
export async function GET(request: Request) {
  if (!(await getSession())) return Response.json({ error: 'Authentication required' }, { status: 401 });
  const { searchParams } = new URL(request.url);
  const date = searchParams.get('date') || today();

  try {
    const shifts = await resolveShiftsForDate(await getDb(), date);
    return Response.json({ date, shifts });
  } catch {
    return Response.json({ error: 'Unable to load schedule.' }, { status: 503 });
  }
}
