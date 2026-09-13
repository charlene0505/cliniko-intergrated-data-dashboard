import { getDb } from '@/lib/mongodb';
import { getSession } from '@/lib/auth';
import { listRecurringShifts, setRecurringShift, removeRecurringShift } from '@/lib/reception';
import type { Weekday } from '@/lib/models';

const WEEKDAYS: Weekday[] = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

export async function GET() {
  if (!(await getSession())) return Response.json({ error: 'Authentication required' }, { status: 401 });
  try {
    return Response.json({ shifts: await listRecurringShifts(await getDb()) });
  } catch {
    return Response.json({ error: 'Unable to load the recurring schedule.' }, { status: 503 });
  }
}

export async function POST(request: Request) {
  if (!(await getSession())) return Response.json({ error: 'Authentication required' }, { status: 401 });
  const body = await request.json().catch(() => null);
  const { receptionistId, weekday, businessId } = body ?? {};
  if (typeof receptionistId !== 'string' || !receptionistId) return Response.json({ error: 'receptionistId is required' }, { status: 400 });
  if (!WEEKDAYS.includes(weekday)) return Response.json({ error: 'weekday must be one of Mon..Sun' }, { status: 400 });
  if (typeof businessId !== 'string' || !businessId) return Response.json({ error: 'businessId is required' }, { status: 400 });

  try {
    await setRecurringShift(await getDb(), receptionistId, weekday, businessId);
    return Response.json({ success: true });
  } catch {
    return Response.json({ error: 'Unable to save the shift.' }, { status: 503 });
  }
}

export async function DELETE(request: Request) {
  if (!(await getSession())) return Response.json({ error: 'Authentication required' }, { status: 401 });
  const { searchParams } = new URL(request.url);
  const receptionistId = searchParams.get('receptionistId');
  const weekday = searchParams.get('weekday') as Weekday | null;
  if (!receptionistId || !weekday || !WEEKDAYS.includes(weekday)) {
    return Response.json({ error: 'receptionistId and a valid weekday are required' }, { status: 400 });
  }

  try {
    await removeRecurringShift(await getDb(), receptionistId, weekday);
    return Response.json({ success: true });
  } catch {
    return Response.json({ error: 'Unable to remove the shift.' }, { status: 503 });
  }
}
