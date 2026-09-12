import type { Db } from 'mongodb';

interface StoredAppointment {
  _id: string;
  startsAt: string;
  cancelledAt: string | null;
  archivedAt: string | null;
  deletedAt: string | null;
  didNotArrive: boolean;
}
interface StoredAttendee {
  _id: string;
  patientId: string;
  appointmentId: string;
  cancelledAt: string | null;
  archivedAt: string | null;
  deletedAt: string | null;
}

export interface NoShowStats {
  ratePercent: number;
  deltaPts: number;
  totalBooked: number;
  flaggedCount: number;
  periodLabel: string;
  monthly: { label: string; percent: number }[];
}

export interface PatientMixStats {
  monthly: { label: string; newCount: number; totalCount: number; percent: number }[];
}

export type PatientMixRange = 'Last week' | 'Last month' | 'Last quarter';

function buildMixBuckets(range: PatientMixRange, now: Date) {
  if (range === 'Last week') {
    // 7 daily buckets — include the date, not just the weekday name, so consecutive weeks
    // (or a week spanning a month boundary) are never ambiguous.
    return Array.from({ length: 7 }, (_, i) => {
      const start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - (6 - i));
      const end = new Date(start.getFullYear(), start.getMonth(), start.getDate() + 1);
      return { label: `${start.toLocaleString('en-AU', { weekday: 'short' })} ${start.getDate()}`, start: start.getTime(), end: end.getTime() };
    });
  }
  if (range === 'Last quarter') {
    // 3 monthly buckets
    return Array.from({ length: 3 }, (_, i) => {
      const start = new Date(now.getFullYear(), now.getMonth() - (2 - i), 1);
      const end = new Date(start.getFullYear(), start.getMonth() + 1, 1);
      return { label: start.toLocaleString('en-AU', { month: 'short' }), start: start.getTime(), end: end.getTime() };
    });
  }
  // 'Last month': 4 trailing 7-day weeks
  return Array.from({ length: 4 }, (_, i) => {
    const end = new Date(now.getFullYear(), now.getMonth(), now.getDate() - (3 - i) * 7 + 1);
    const start = new Date(end.getFullYear(), end.getMonth(), end.getDate() - 7);
    return { label: `${start.getDate()}/${start.getMonth() + 1}`, start: start.getTime(), end: end.getTime() };
  });
}

async function loadClinical(db: Db) {
  const [appointments, attendees] = await Promise.all([
    db.collection<StoredAppointment>('appointments').find({}).toArray(),
    db.collection<StoredAttendee>('attendees').find({}).toArray(),
  ]);
  return { appointments, attendees };
}

// A visit is "flagged" if the patient didn't arrive, or cancelled less than 24h before the appointment.
function isLateCancellation(cancelledAt: Date | null, startsAt: Date): boolean {
  return !!cancelledAt && cancelledAt <= startsAt && startsAt.getTime() - cancelledAt.getTime() < 24 * 3600 * 1000;
}

export async function computeNoShowStats(db: Db, now = new Date()): Promise<NoShowStats | null> {
  const { appointments, attendees } = await loadClinical(db);
  if (!appointments.length) return null;
  const byAppt = new Map(appointments.map(a => [a._id, a]));

  const MONTHS = 8;
  const buckets = Array.from({ length: MONTHS }, (_, i) => {
    const d = new Date(now.getFullYear(), now.getMonth() - (MONTHS - 1 - i), 1);
    return { label: d.toLocaleString('en-AU', { month: 'short' }), year: d.getFullYear(), month: d.getMonth(), total: 0, flagged: 0 };
  });
  const windowStart = new Date(buckets[0].year, buckets[0].month, 1);

  // The headline rate/count is scoped to the exact same trailing window as the monthly chart —
  // not "everything we've ever synced" — so the two numbers always describe the same period.
  let total = 0, flagged = 0;
  for (const at of attendees) {
    if (at.archivedAt || at.deletedAt) continue;
    const appt = byAppt.get(at.appointmentId);
    if (!appt || appt.archivedAt || appt.deletedAt) continue;
    const startsAt = new Date(appt.startsAt);
    if (startsAt > now || startsAt < windowStart) continue;

    const cancelledAt = at.cancelledAt ? new Date(at.cancelledAt) : appt.cancelledAt ? new Date(appt.cancelledAt) : null;
    const isFlagged = appt.didNotArrive === true || isLateCancellation(cancelledAt, startsAt);

    total++;
    if (isFlagged) flagged++;
    const bucket = buckets.find(b => b.year === startsAt.getFullYear() && b.month === startsAt.getMonth());
    if (bucket) { bucket.total++; if (isFlagged) bucket.flagged++; }
  }

  const monthly = buckets.map(b => ({ label: b.label, percent: b.total ? Math.round((b.flagged / b.total) * 1000) / 10 : 0 }));
  const ratePercent = total ? Math.round((flagged / total) * 1000) / 10 : 0;
  const last = monthly[monthly.length - 1]?.percent ?? 0;
  const prev = monthly[monthly.length - 2]?.percent ?? last;
  const periodLabel = `${buckets[0].label}–${buckets[buckets.length - 1].label} ${buckets[buckets.length - 1].year}`;

  return { ratePercent, deltaPts: Math.round((last - prev) * 10) / 10, totalBooked: total, flaggedCount: flagged, periodLabel, monthly };
}

export async function computePatientMixStats(db: Db, range: PatientMixRange = 'Last month', now = new Date()): Promise<PatientMixStats | null> {
  const { appointments, attendees } = await loadClinical(db);
  if (!appointments.length) return null;
  const byAppt = new Map(appointments.map(a => [a._id, a]));

  // A patient counts as "new" in a period if their oldest recorded visit (their first-ever
  // appointment, by our data) falls inside that period; every other patient who visited during
  // the period is "returning". This depends only on attendance history — not the Cliniko
  // patient record's created_at, which is unreliable: Cliniko can reset it when patient records
  // are merged, so a years-long patient's profile can end up with a created_at from last week.
  const visitsByPatient = new Map<string, Date[]>();
  for (const at of attendees) {
    if (at.archivedAt || at.deletedAt) continue;
    const appt = byAppt.get(at.appointmentId);
    if (!appt || appt.archivedAt || appt.deletedAt || appt.didNotArrive) continue;
    if (at.cancelledAt || appt.cancelledAt) continue;
    const startsAt = new Date(appt.startsAt);
    if (startsAt > now) continue;
    if (!visitsByPatient.has(at.patientId)) visitsByPatient.set(at.patientId, []);
    visitsByPatient.get(at.patientId)!.push(startsAt);
  }

  const buckets = buildMixBuckets(range, now).map(b => ({ ...b, newCount: 0, totalCount: 0 }));

  for (const [, dates] of visitsByPatient) {
    const oldestVisit = Math.min(...dates.map(d => d.getTime()));
    for (const bucket of buckets) {
      if (!dates.some(d => d.getTime() >= bucket.start && d.getTime() < bucket.end)) continue;
      bucket.totalCount++;
      if (oldestVisit >= bucket.start && oldestVisit < bucket.end) bucket.newCount++;
    }
  }

  return {
    monthly: buckets.map(b => ({
      label: b.label, newCount: b.newCount, totalCount: b.totalCount,
      percent: b.totalCount ? Math.round((b.newCount / b.totalCount) * 1000) / 10 : 0,
    })),
  };
}
