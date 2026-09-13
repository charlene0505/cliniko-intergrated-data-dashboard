export type ReferralType = 'medicare' | 'dva' | null;

/** Normalized Cliniko records, shared by the live import and synthetic showcase. */
export interface CaseRecord {
  _id: string; patientId: string; name: string; isEpc: boolean; referralType: ReferralType;
  maxSessions: number | null; issueDate: string | null; expiryDate: string | null;
  closedAt: string | null; archivedAt: string | null;
  includeCancelled: boolean; includeDna: boolean;
}
export interface AppointmentRecord {
  _id: string; startsAt: string; endsAt: string;
  cancelledAt: string | null; archivedAt: string | null; deletedAt: string | null;
  didNotArrive: boolean; practitionerId: string | null; businessId: string | null;
  notes: string | null; blockTypeId: string | null; appointmentTypeId: string | null;
}
export interface AttendanceRecord {
  _id: string; patientId: string; caseId: string | null; appointmentId: string;
  cancelledAt: string | null; archivedAt: string | null; deletedAt: string | null;
  arrived: boolean | null; notes: string | null;
}
export interface EpcPlan extends CaseRecord {
  sessionsUsed: number; sessionsRemaining: number | null;
  nextAppointment: string | null; status: 'active' | 'closed' | 'expired' | 'archived';
}
// A case is EPC (GPCCMP) purely by its Cliniko referral_type — a medicare-referred case is always
// GPCCMP regardless of what the case's name field happens to say (e.g. "GP Management Plan", "EPC").
export function isEpcCase(referralType: ReferralType) { return referralType === 'medicare'; }
export function summarizeClinical(cases: CaseRecord[], attendances: AttendanceRecord[], appointments: AppointmentRecord[], now = new Date()) {
  const byId = new Map(appointments.map(a => [a._id, a]));
  const linked = attendances.flatMap(a => {
    const booking = byId.get(a.appointmentId);
    return booking && !a.archivedAt && !a.deletedAt && !booking.archivedAt && !booking.deletedAt ? [{ attendee: a, booking }] : [];
  });
  const valid = linked.filter(({ attendee, booking }) => !attendee.cancelledAt && !booking.cancelledAt && !booking.didNotArrive);
  const next = valid.filter(a => new Date(a.booking.startsAt) > now).sort((a,b) => a.booking.startsAt.localeCompare(b.booking.startsAt));
  const past = valid.filter(a => new Date(a.booking.endsAt) <= now).sort((a,b) => b.booking.startsAt.localeCompare(a.booking.startsAt));
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Australia/Sydney', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
  const plans: EpcPlan[] = cases.filter(c => isEpcCase(c.referralType)).map(c => {
    const sessionsUsed = linked.filter(({ attendee, booking }) => attendee.caseId === c._id && new Date(booking.endsAt) <= now
      && (c.includeCancelled || (!attendee.cancelledAt && !booking.cancelledAt))
      && (c.includeDna || !booking.didNotArrive)).length;
    return { ...c, sessionsUsed, sessionsRemaining: c.maxSessions === null ? null : Math.max(0, c.maxSessions - sessionsUsed),
      nextAppointment: next.find(a => a.attendee.caseId === c._id)?.booking.startsAt ?? null,
      status: c.archivedAt ? 'archived' : c.closedAt ? 'closed' : c.expiryDate && c.expiryDate < today ? 'expired' : 'active' };
  });
  return { plans, nextAppointment: next[0]?.booking.startsAt ?? null, lastVisit: past[0]?.booking.startsAt ?? null,
    practitionerId: (next[0] ?? past[0])?.booking.practitionerId ?? null,
    businessId: (next[0] ?? past[0])?.booking.businessId ?? null };
}
