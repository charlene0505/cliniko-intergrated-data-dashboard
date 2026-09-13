import { getDb } from '@/lib/mongodb';
import { getSession } from '@/lib/auth';
import { listOverrides, setOverride } from '@/lib/reception';

export async function GET(request: Request) {
  if (!(await getSession())) return Response.json({ error: 'Authentication required' }, { status: 401 });
  const { searchParams } = new URL(request.url);
  const from = searchParams.get('from');
  const to = searchParams.get('to');
  if (!from || !to) return Response.json({ error: 'from and to (YYYY-MM-DD) are required' }, { status: 400 });

  try {
    return Response.json({ overrides: await listOverrides(await getDb(), from, to) });
  } catch {
    return Response.json({ error: 'Unable to load schedule overrides.' }, { status: 503 });
  }
}

export async function POST(request: Request) {
  if (!(await getSession())) return Response.json({ error: 'Authentication required' }, { status: 401 });
  const body = await request.json().catch(() => null);
  const { date, businessId, receptionistId, coveringFor, reason } = body ?? {};
  if (typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return Response.json({ error: 'date must be YYYY-MM-DD' }, { status: 400 });
  if (typeof businessId !== 'string' || !businessId) return Response.json({ error: 'businessId is required' }, { status: 400 });
  if (receptionistId !== null && typeof receptionistId !== 'string') return Response.json({ error: 'receptionistId must be a string or null' }, { status: 400 });

  try {
    await setOverride(await getDb(), {
      date,
      businessId,
      receptionistId: receptionistId ?? null,
      coveringFor: typeof coveringFor === 'string' ? coveringFor : null,
      reason: typeof reason === 'string' ? reason : null,
    });
    return Response.json({ success: true });
  } catch {
    return Response.json({ error: 'Unable to save the override.' }, { status: 503 });
  }
}
