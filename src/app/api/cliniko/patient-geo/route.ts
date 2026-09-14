import { getDb } from '@/lib/mongodb';
import { readPatientGeo } from '@/lib/patient-geo';

export async function GET() {
  try {
    const geo = await readPatientGeo(await getDb());
    if (!geo) return Response.json({ status: 'no_data' });
    return Response.json({ status: 'ok', ...geo });
  } catch {
    return Response.json({ status: 'error', error: 'Unable to load patient locations.' }, { status: 500 });
  }
}
