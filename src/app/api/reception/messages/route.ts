import { getDb } from '@/lib/mongodb';
import { getSession } from '@/lib/auth';
import { listMessages, createMessage } from '@/lib/reception';
import { receptionistIdFor } from '@/lib/display-name';
import type { ReceptionMessage } from '@/lib/models';

export async function GET(request: Request) {
  const session = await getSession();
  if (!session) return Response.json({ error: 'Authentication required' }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const kind = searchParams.get('kind');
  const recipientType = searchParams.get('recipientType');
  const recipientId = searchParams.get('recipientId');

  try {
    const messages = await listMessages(await getDb(), {
      kind: kind === 'task' || kind === 'message' ? kind : undefined,
      recipientType: recipientType === 'receptionist' || recipientType === 'practitioner' ? recipientType : undefined,
      recipientId: recipientId ?? undefined,
    });
    return Response.json({ messages });
  } catch {
    return Response.json({ error: 'Unable to load messages.' }, { status: 503 });
  }
}

export async function POST(request: Request) {
  const session = await getSession();
  if (!session) return Response.json({ error: 'Authentication required' }, { status: 401 });

  const body = await request.json().catch(() => null);
  const kind: ReceptionMessage['kind'] = body?.kind === 'message' ? 'message' : 'task';
  const text = typeof body?.text === 'string' ? body.text.trim() : '';
  const recipientType = body?.recipient?.type;
  // "me" resolves to whichever receptionist this login is (see receptionistIdFor) — lets a client
  // (like the today-briefing "add to my to-do list" button) target the current session without
  // needing to know its own receptionist id.
  const recipientId = body?.recipient?.id === 'me' ? receptionistIdFor(session.username) : body?.recipient?.id;
  const priority = body?.priority === 'High' || body?.priority === 'Routine' ? body.priority : undefined;
  const dueDate = typeof body?.dueDate === 'string' ? new Date(body.dueDate) : null;

  if (!text) return Response.json({ error: 'text is required' }, { status: 400 });
  if (recipientType !== 'receptionist' && recipientType !== 'practitioner') {
    return Response.json({ error: 'recipient.type must be "receptionist" or "practitioner"' }, { status: 400 });
  }
  if (typeof recipientId !== 'string' || !recipientId) {
    return Response.json({ error: 'recipient.id is required (or "me", if this login is linked to a receptionist)' }, { status: 400 });
  }

  try {
    const message = await createMessage(await getDb(), {
      kind,
      text,
      recipient: { type: recipientType, id: recipientId },
      senderName: session.username,
      priority,
      dueDate,
    });
    return Response.json({ message }, { status: 201 });
  } catch {
    return Response.json({ error: 'Unable to create the message.' }, { status: 503 });
  }
}
