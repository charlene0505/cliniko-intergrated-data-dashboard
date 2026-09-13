import { getDb } from '@/lib/mongodb';
import { getSession } from '@/lib/auth';

// Read-only listing of the existing Cliniko-synced practitioners collection, used to populate the
// "or write it to others" recipient option when composing a reception task/message.
export async function GET() {
  if (!(await getSession())) return Response.json({ error: 'Authentication required' }, { status: 401 });
  try {
    const practitioners = await (await getDb()).collection<{ _id: string; name: string }>('practitioners').find().toArray();
    return Response.json({ practitioners });
  } catch {
    return Response.json({ error: 'Unable to load practitioners.' }, { status: 503 });
  }
}
