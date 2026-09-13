import { getDb } from '@/lib/mongodb';
import { getSession } from '@/lib/auth';
import { deleteMessage, setMessageCompleted, updateMessage } from '@/lib/reception';

// Two shapes share this route:
//   { completed: boolean }              — toggles completion. Un-marking is how a crossed-out task
//                                         gets reopened; there's no separate "reset" action.
//   { text, recipient, priority }       — edits the task itself, which only its sender may do.
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return Response.json({ error: 'Authentication required' }, { status: 401 });

  const { id } = await params;
  const body = await request.json().catch(() => null);

  if (typeof body?.completed === 'boolean') {
    try {
      await setMessageCompleted(await getDb(), id, body.completed ? session.username : null);
      return Response.json({ success: true });
    } catch {
      return Response.json({ error: 'Unable to update the message.' }, { status: 503 });
    }
  }

  const text = typeof body?.text === 'string' ? body.text.trim() : '';
  const recipientType = body?.recipient?.type;
  const recipientId = body?.recipient?.id;
  const priority = body?.priority === 'High' || body?.priority === 'Routine' ? body.priority : undefined;

  if (!text) return Response.json({ error: 'text is required' }, { status: 400 });
  if (recipientType !== 'receptionist' && recipientType !== 'practitioner') {
    return Response.json({ error: 'recipient.type must be "receptionist" or "practitioner"' }, { status: 400 });
  }
  if (typeof recipientId !== 'string' || !recipientId) {
    return Response.json({ error: 'recipient.id is required' }, { status: 400 });
  }

  try {
    const updated = await updateMessage(await getDb(), id, session.username, {
      text,
      recipient: { type: recipientType, id: recipientId },
      priority,
    });
    if (!updated) return Response.json({ error: 'You can only edit tasks you assigned.' }, { status: 403 });
    return Response.json({ success: true });
  } catch {
    return Response.json({ error: 'Unable to update the message.' }, { status: 503 });
  }
}

// Removing a task is likewise the sender's call only.
export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return Response.json({ error: 'Authentication required' }, { status: 401 });

  const { id } = await params;

  try {
    const deleted = await deleteMessage(await getDb(), id, session.username);
    if (!deleted) return Response.json({ error: 'You can only delete tasks you assigned.' }, { status: 403 });
    return Response.json({ success: true });
  } catch {
    return Response.json({ error: 'Unable to delete the message.' }, { status: 503 });
  }
}
