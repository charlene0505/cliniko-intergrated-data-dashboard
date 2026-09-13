import type { Db } from 'mongodb';
import { randomUUID } from 'crypto';
import type { Receptionist, RecurringShift, ShiftOverride, ReceptionMessage, Weekday } from './models';

const WEEKDAYS: Weekday[] = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

// ── Receptionists ────────────────────────────────────────────────────────────

export async function listReceptionists(db: Db): Promise<Receptionist[]> {
  return db.collection<Receptionist>('receptionists').find().toArray();
}

export async function createReceptionist(db: Db, data: { name: string; role: Receptionist['role'] }): Promise<Receptionist> {
  const receptionist: Receptionist = { _id: randomUUID(), name: data.name, role: data.role };
  await db.collection<Receptionist>('receptionists').insertOne(receptionist);
  return receptionist;
}

// ── Recurring schedule ───────────────────────────────────────────────────────

export async function listRecurringShifts(db: Db): Promise<RecurringShift[]> {
  return db.collection<RecurringShift>('reception_schedule').find().toArray();
}

export async function setRecurringShift(db: Db, receptionistId: string, weekday: Weekday, businessId: string): Promise<void> {
  const shift: RecurringShift = { _id: `${receptionistId}_${weekday}`, receptionistId, weekday, businessId };
  await db.collection<RecurringShift>('reception_schedule').replaceOne({ _id: shift._id }, shift, { upsert: true });
}

export async function removeRecurringShift(db: Db, receptionistId: string, weekday: Weekday): Promise<void> {
  await db.collection<RecurringShift>('reception_schedule').deleteOne({ _id: `${receptionistId}_${weekday}` });
}

// ── Overrides ────────────────────────────────────────────────────────────────

export async function listOverrides(db: Db, fromDate: string, toDate: string): Promise<ShiftOverride[]> {
  return db.collection<ShiftOverride>('reception_schedule_overrides')
    .find({ date: { $gte: fromDate, $lte: toDate } })
    .toArray();
}

export async function setOverride(db: Db, data: {
  date: string;
  businessId: string;
  receptionistId: string | null;
  coveringFor?: string | null;
  reason?: string | null;
}): Promise<void> {
  const override: ShiftOverride = {
    _id: `${data.date}_${data.businessId}`,
    date: data.date,
    businessId: data.businessId,
    receptionistId: data.receptionistId,
    coveringFor: data.coveringFor ?? null,
    reason: data.reason ?? null,
  };
  await db.collection<ShiftOverride>('reception_schedule_overrides').replaceOne({ _id: override._id }, override, { upsert: true });
}

// `date` is a plain "YYYY-MM-DD" calendar date with no time component, so this reads its parts
// directly rather than parsing through a Date (which would apply the server's own timezone).
function weekdayOf(date: string): Weekday {
  const [y, m, d] = date.split('-').map(Number);
  const dayOfWeek = new Date(y, m - 1, d).getDay(); // 0=Sun..6=Sat
  return WEEKDAYS[(dayOfWeek + 6) % 7]; // rotate so the array's Mon=0..Sun=6 lines up
}

export interface ResolvedShift {
  businessId: string;
  receptionistId: string | null;
  coveringFor?: string | null;
  isOverride: boolean;
}

// Who's actually on for a given date, at every practice that has either a recurring shift or an
// override that day. An override always wins over the recurring pattern for its own date.
export async function resolveShiftsForDate(db: Db, date: string): Promise<ResolvedShift[]> {
  const weekday = weekdayOf(date);
  const [recurring, overrides] = await Promise.all([
    db.collection<RecurringShift>('reception_schedule').find({ weekday }).toArray(),
    db.collection<ShiftOverride>('reception_schedule_overrides').find({ date }).toArray(),
  ]);

  const byBusiness = new Map<string, ResolvedShift>();
  for (const r of recurring) {
    byBusiness.set(r.businessId, { businessId: r.businessId, receptionistId: r.receptionistId, isOverride: false });
  }
  for (const o of overrides) {
    byBusiness.set(o.businessId, { businessId: o.businessId, receptionistId: o.receptionistId, coveringFor: o.coveringFor ?? null, isOverride: true });
  }
  return Array.from(byBusiness.values());
}

// ── Messages / tasks ─────────────────────────────────────────────────────────

export async function listMessages(db: Db, filter?: { kind?: ReceptionMessage['kind']; recipientType?: 'receptionist' | 'practitioner'; recipientId?: string }): Promise<ReceptionMessage[]> {
  const query: Record<string, unknown> = {};
  if (filter?.kind) query.kind = filter.kind;
  if (filter?.recipientType) query['recipient.type'] = filter.recipientType;
  if (filter?.recipientId) query['recipient.id'] = filter.recipientId;
  return db.collection<ReceptionMessage>('reception_messages').find(query).sort({ createdAt: -1 }).toArray();
}

export async function createMessage(db: Db, data: {
  kind: ReceptionMessage['kind'];
  text: string;
  recipient: ReceptionMessage['recipient'];
  senderName: string;
  priority?: ReceptionMessage['priority'];
  dueDate?: Date | null;
}): Promise<ReceptionMessage> {
  const message: ReceptionMessage = {
    _id: randomUUID(),
    kind: data.kind,
    text: data.text,
    recipient: data.recipient,
    senderName: data.senderName,
    priority: data.priority,
    dueDate: data.dueDate ?? null,
    completedAt: null,
    completedBy: null,
    createdAt: new Date(),
  };
  await db.collection<ReceptionMessage>('reception_messages').insertOne(message);
  return message;
}

// Edits a task's own fields. Scoped to `senderName` in the query itself rather than by a separate
// read-then-check, so a task can only ever be edited by whoever sent it — the caller learns from
// the false return that the id either doesn't exist or isn't theirs, without leaking which.
export async function updateMessage(db: Db, id: string, senderName: string, fields: {
  text: string;
  recipient: ReceptionMessage['recipient'];
  priority?: ReceptionMessage['priority'];
}): Promise<boolean> {
  const result = await db.collection<ReceptionMessage>('reception_messages').updateOne(
    { _id: id, senderName },
    { $set: { text: fields.text, recipient: fields.recipient, priority: fields.priority } },
  );
  return result.matchedCount > 0;
}

// Scoped to `senderName` for the same reason as updateMessage: only whoever sent a task can
// remove it, enforced by the query rather than a separate ownership check.
export async function deleteMessage(db: Db, id: string, senderName: string): Promise<boolean> {
  const result = await db.collection<ReceptionMessage>('reception_messages').deleteOne({ _id: id, senderName });
  return result.deletedCount > 0;
}

export async function setMessageCompleted(db: Db, id: string, completedBy: string | null): Promise<void> {
  await db.collection<ReceptionMessage>('reception_messages').updateOne(
    { _id: id },
    { $set: { completedAt: completedBy ? new Date() : null, completedBy } },
  );
}
