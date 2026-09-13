import { getDb } from '@/lib/mongodb';
import { getSession } from '@/lib/auth';
import { listReceptionists, createReceptionist } from '@/lib/reception';
import type { Receptionist } from '@/lib/models';

export async function GET() {
  if (!(await getSession())) return Response.json({ error: 'Authentication required' }, { status: 401 });
  try {
    return Response.json({ receptionists: await listReceptionists(await getDb()) });
  } catch {
    return Response.json({ error: 'Unable to load receptionists.' }, { status: 503 });
  }
}

export async function POST(request: Request) {
  if (!(await getSession())) return Response.json({ error: 'Authentication required' }, { status: 401 });
  const body = await request.json().catch(() => null);
  const name = typeof body?.name === 'string' ? body.name.trim() : '';
  const role: Receptionist['role'] = body?.role === 'reception_manager' ? 'reception_manager' : 'receptionist';
  if (!name) return Response.json({ error: 'name is required' }, { status: 400 });

  try {
    const receptionist = await createReceptionist(await getDb(), { name, role });
    return Response.json({ receptionist }, { status: 201 });
  } catch {
    return Response.json({ error: 'Unable to create receptionist.' }, { status: 503 });
  }
}
