import { getDb } from '@/lib/mongodb';
import { getSession } from '@/lib/auth';
import { readPatients } from '@/lib/patient-dashboard';
export async function GET() {
  if (!(await getSession())) return Response.json({ error: 'Authentication required' }, { status: 401 });
  try { return Response.json({ patients: await readPatients(await getDb()) }, { headers: { 'Cache-Control': 'no-store' } }); }
  catch { return Response.json({ error: 'Unable to load patients.' }, { status: 503 }); }
}
