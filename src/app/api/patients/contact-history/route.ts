import { getSession } from '@/lib/auth';
import { getDb } from '@/lib/mongodb';
import type { ContactHistoryEntry, ContactHistoryType, Patient } from '@/lib/models';

const TYPES: ContactHistoryType[] = ['careplan', 'payment', 'clinical'];

function validType(value: unknown): value is ContactHistoryType {
  return typeof value === 'string' && TYPES.includes(value as ContactHistoryType);
}

function patientFilter(email: string) {
  return { email: { $regex: `^${email.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, $options: 'i' }, isDeleted: false };
}

export async function GET(request: Request) {
  if (!(await getSession())) return Response.json({ error: 'Authentication required' }, { status: 401 });
  const searchParams = new URL(request.url).searchParams;
  const emails = searchParams.getAll('email').map((email) => email.trim()).filter(Boolean);
  const requestedType = searchParams.get('type');
  const type = validType(requestedType) ? requestedType : null;
  if (!emails.length) return Response.json({ histories: {} });
  const patients = await (await getDb()).collection<Patient>('patients')
    .find({ email: { $in: emails }, isDeleted: false }, { projection: { email: 1, contactHistory: 1 } })
    .toArray();
  return Response.json({
    histories: Object.fromEntries(patients.map((patient) => [
      patient.email,
      (patient.contactHistory ?? []).filter((entry) => !type || entry.type === type),
    ])),
  }, { headers: { 'Cache-Control': 'no-store' } });
}

export async function POST(request: Request) {
  if (!(await getSession())) return Response.json({ error: 'Authentication required' }, { status: 401 });
  const body = await request.json();
  const email = typeof body.email === 'string' ? body.email.trim() : '';
  const note = typeof body.note === 'string' ? body.note.trim() : '';
  if (!email || !note || !validType(body.type)) return Response.json({ error: 'Email, note and a valid type are required.' }, { status: 400 });
  const entry: ContactHistoryEntry = { note, type: body.type, createdAt: new Date() };
  const result = await (await getDb()).collection<Patient>('patients').updateOne(patientFilter(email), { $push: { contactHistory: entry } });
  if (!result.matchedCount) return Response.json({ error: 'Patient not found.' }, { status: 404 });
  return Response.json({ entry });
}

export async function PATCH(request: Request) {
  if (!(await getSession())) return Response.json({ error: 'Authentication required' }, { status: 401 });
  const body = await request.json();
  const email = typeof body.email === 'string' ? body.email.trim() : '';
  const note = typeof body.note === 'string' ? body.note.trim() : '';
  const createdAt = new Date(body.createdAt);
  if (!email || !note || Number.isNaN(createdAt.getTime()) || !validType(body.type)) return Response.json({ error: 'Valid entry details are required.' }, { status: 400 });
  const result = await (await getDb()).collection<Patient>('patients').updateOne(
    { ...patientFilter(email), 'contactHistory.createdAt': createdAt },
    { $set: { 'contactHistory.$[entry].note': note, 'contactHistory.$[entry].type': body.type } },
    { arrayFilters: [{ 'entry.createdAt': createdAt }] },
  );
  if (!result.matchedCount) return Response.json({ error: 'Contact-history entry not found.' }, { status: 404 });
  return Response.json({ entry: { note, type: body.type, createdAt } });
}

export async function DELETE(request: Request) {
  if (!(await getSession())) return Response.json({ error: 'Authentication required' }, { status: 401 });
  const body = await request.json();
  const email = typeof body.email === 'string' ? body.email.trim() : '';
  const createdAt = new Date(body.createdAt);
  if (!email || Number.isNaN(createdAt.getTime())) return Response.json({ error: 'Valid entry details are required.' }, { status: 400 });
  const result = await (await getDb()).collection<Patient>('patients').updateOne(
    { ...patientFilter(email), 'contactHistory.createdAt': createdAt },
    { $pull: { contactHistory: { createdAt } } },
  );
  if (!result.matchedCount) return Response.json({ error: 'Contact-history entry not found.' }, { status: 404 });
  return Response.json({ ok: true });
}
