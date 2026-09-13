import { getShowcaseDb } from '@/lib/showcase-db';
import { readPatients } from '@/lib/patient-dashboard';
export async function GET() {
  try { return Response.json({ patients: await readPatients(await getShowcaseDb()) }, { headers: { 'Cache-Control': 'no-store' } }); }
  catch { return Response.json({ error: 'Showcase is unavailable. Configure and seed the showcase database first.' }, { status: 503 }); }
}
