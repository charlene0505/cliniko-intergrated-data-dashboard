import type { Db } from 'mongodb';
import { resolveShiftsForDate } from './reception';
import type { AppointmentRecord, AttendanceRecord } from './clinical';
import type { Patient } from './models';
import { CURATED_SUMMARIES } from './today-briefing-curated';
import { practiceDay } from './date-range';

interface TodayEntry {
  patientName: string;
  practitionerName: string;
  startsAt: string;
  notes: string[];
}

export interface NotePoint {
  text: string;
  risk: boolean;
}

export interface PatientNoteItem {
  patientName: string;
  practitionerName: string;
  time: string;
  points: NotePoint[];
}

export interface ReceptionNote {
  time: string;
  kind: 'Message' | 'To Do';
  text: string;
}

export interface TodaySummary {
  patientNotes: PatientNoteItem[];
  receptionNotes: ReceptionNote[];
  trends: string[];
}

// The part of the summary that's actually judged (curated or rule-based) — receptionNotes is
// mechanical (derived straight from the reception-desk booking's block type) and always computed
// live in computeDayBriefing, so neither the curated overrides nor mockSummarize need to supply it.
export type JudgedSummary = Omit<TodaySummary, 'receptionNotes'>;

interface DayBriefing {
  date: string;
  businessName?: string;
  entries: TodayEntry[];
  summary: TodaySummary;
  mocked: true;
}

export interface TodayBriefing {
  status: 'ok' | 'not_scheduled';
  date: string;
  businessName?: string;
  entries?: TodayEntry[];
  summary?: TodaySummary;
  mocked?: true;
  // Present whenever a future shift was found within the lookahead window — a preview of the next
  // day this receptionist is actually rostered on, regardless of whether today is also a shift.
  nextShift?: DayBriefing;
}

// Days are practice-local "YYYY-MM-DD" strings (Australia/Sydney). The server's own clock can't be used
// for this: on a UTC host, "today" would roll over at 10–11am Sydney time.
function addDayString(day: string, n: number): string {
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

// Who's on for a given date, at which practice — this is the whole "scoped to the practice she's
// in today" requirement, resting entirely on the reception_schedule / overrides already in place.
async function businessFor(db: Db, receptionistId: string, date: string): Promise<string | null> {
  const shifts = await resolveShiftsForDate(db, date);
  return shifts.find((s) => s.receptionistId === receptionistId)?.businessId ?? null;
}

const LOOKAHEAD_DAYS = 14;

// Walks forward day by day (capped at LOOKAHEAD_DAYS) to find this receptionist's next rostered
// day — recurring shifts alone repeat weekly, but an override could also place them somewhere
// sooner, so this has to check each date rather than just jumping to "same weekday next week".
async function nextShiftFor(db: Db, receptionistId: string, fromDay: string): Promise<{ date: string; businessId: string } | null> {
  for (let i = 1; i <= LOOKAHEAD_DAYS; i++) {
    const date = addDayString(fromDay, i);
    const businessId = await businessFor(db, receptionistId, date);
    if (businessId) return { date, businessId };
  }
  return null;
}

// Note text can come from three places: the patient's own record, the booking itself, or the
// attendee (this specific visit) — Cliniko keeps them separate, so this is what "combine both of
// them" (booking notes + attendee notes) plus the patient's standing notes looks like in practice.
function combinedNotes(patient: Patient | undefined, appt: AppointmentRecord, attendee: AttendanceRecord | undefined): string[] {
  return [patient?.appointmentNotes, appt.notes, attendee?.notes].filter((n): n is string => !!n && n.trim().length > 0);
}

const RISK_PATTERN = /allerg|anaphylax|fall(s|en)?\b|urgent|severe|chest pain|red flag|suicid|self.?harm|safeguard\b|risk/i;
const PAYMENT_PATTERN = /invoice|payment|overdue|workcover|claim|epc\b|medicare|ndis|ctp\b|outstanding|balance/i;
// Real notes are long, messy free text (clinical narrative, billing tables, and one-line
// front-desk reminders all mixed together). Without a real model to actually judge relevance, the
// best a rule-based pass can do is pick out a few lines that look like something to act on —
// admins can always check Cliniko for the rest, so this stays short rather than dumping it all in.
const ACTION_PATTERN = /\?|(?:^|\W)(ask|bring|confirm|reschedul|cancel|dna\b|away|reminder|please|follow.?up|check|call\b|book\b)/i;
const LINE_MAX = 140;
const MAX_BULLETS = 3;

function formatTime(iso: string): string {
  return new Intl.DateTimeFormat('en-AU', { timeZone: 'Australia/Sydney', hour: 'numeric', minute: '2-digit', hour12: true }).format(new Date(iso));
}

function pickBullets(fullText: string): NotePoint[] {
  const lines = fullText.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const actionLines = lines.filter((l) => ACTION_PATTERN.test(l));
  const substantiveLines = lines.filter((l) => !actionLines.includes(l) && l.length > 20);
  const chosen = [...new Set([...actionLines, ...substantiveLines])].slice(0, MAX_BULLETS);
  return chosen.map((l) => ({
    text: l.length > LINE_MAX ? `${l.slice(0, LINE_MAX - 1)}…` : l,
    risk: RISK_PATTERN.test(l),
  }));
}

// Placeholder for a real AI call: rule-based only, so the shape of the feature can be shown
// before any model is actually wired up. `mocked: true` on the response is how the UI knows to
// label this as a preview rather than a live summary.
function mockSummarize(entries: TodayEntry[]): JudgedSummary {
  const patientNotes: PatientNoteItem[] = [];

  for (const e of entries) {
    if (!e.notes.length) continue;
    const fullText = e.notes.join('\n\n');
    patientNotes.push({
      patientName: e.patientName,
      practitionerName: e.practitionerName,
      time: formatTime(e.startsAt),
      points: pickBullets(fullText),
    });
  }

  const trends: string[] = [`${entries.length} appointment${entries.length === 1 ? '' : 's'} booked today.`];
  const withNotes = entries.filter((e) => e.notes.length).length;
  if (withNotes) trends.push(`${withNotes} of ${entries.length} appointments have notes on file.`);
  const paymentMentions = entries.filter((e) => e.notes.some((n) => PAYMENT_PATTERN.test(n))).length;
  if (paymentMentions) trends.push(`${paymentMentions} appointment${paymentMentions === 1 ? '' : 's'} mention billing/claim details worth a follow-up.`);

  const byPractitioner = new Map<string, number>();
  for (const e of entries) byPractitioner.set(e.practitionerName, (byPractitioner.get(e.practitionerName) ?? 0) + 1);
  const busiest = [...byPractitioner.entries()].sort((a, b) => b[1] - a[1])[0];
  if (busiest && byPractitioner.size > 1) trends.push(`${busiest[0]} has the fullest list today (${busiest[1]} appointments).`);

  return { patientNotes, trends };
}

// Every reception booking that isn't a real patient visit is made under one shared practitioner,
// "Receptionist Receptionist" — Cliniko types each of those blocks (LUNCH, TRAVEL, "TO DO
// (Receptionist Only)", "Messages", etc.), and only the message/to-do ones belong in a briefing;
// a lunch break or a generic "Unavailable" marker isn't something to report on.
const RECEPTION_DESK_TYPE_PATTERN = /messages|to do/i;

async function computeReceptionNotes(db: Db, inWindow: AppointmentRecord[]): Promise<ReceptionNote[]> {
  const receptionDesk = await db.collection<{ _id: string; name: string }>('practitioners').findOne({ name: 'Receptionist Receptionist' });
  if (!receptionDesk) return [];

  const candidates = [...inWindow]
    .filter((a) => a.practitionerId === receptionDesk._id && !!a.notes?.trim())
    .sort((a, b) => a.startsAt.localeCompare(b.startsAt));
  if (!candidates.length) return [];

  const blockTypeIds = [...new Set(candidates.map((a) => a.blockTypeId).filter((id): id is string => !!id))];
  const blockTypes = await db.collection<{ _id: string; name: string }>('unavailable_block_types').find({ _id: { $in: blockTypeIds } }).toArray();
  const blockTypeById = new Map(blockTypes.map((t) => [t._id, t.name]));

  const notes: ReceptionNote[] = [];
  for (const a of candidates) {
    const typeName = a.blockTypeId ? blockTypeById.get(a.blockTypeId) : undefined;
    if (!typeName || !RECEPTION_DESK_TYPE_PATTERN.test(typeName)) continue;
    notes.push({ time: formatTime(a.startsAt), kind: /messages/i.test(typeName) ? 'Message' : 'To Do', text: a.notes!.trim() });
  }
  return notes;
}

// The actual aggregation, parameterized by date + business rather than always "now" — shared by
// today's briefing and the next-shift preview so they build the exact same shape.
async function computeDayBriefing(db: Db, businessId: string, date: string): Promise<DayBriefing> {
  // Only the one day is fetched. This used to load every appointment the practice has ever had plus
  // every attendee in the database (~12k + ~14k documents, ~37s) and filter down to the day in JS.
  // startsAt is stored in UTC, so the indexed query takes a window a day wider either side and the
  // exact Sydney day is matched afterwards.
  const [candidates, business] = await Promise.all([
    db
      .collection<AppointmentRecord>('appointments')
      .find({
        businessId,
        startsAt: { $gte: `${addDayString(date, -1)}T00:00:00Z`, $lt: `${addDayString(date, 2)}T00:00:00Z` },
      })
      .toArray(),
    db.collection<{ _id: string; name: string }>('businesses').findOne({ _id: businessId }),
  ]);

  const inWindow = candidates.filter(
    (a) => !a.cancelledAt && !a.archivedAt && !a.deletedAt && practiceDay(new Date(a.startsAt)) === date,
  );

  const attendees = await db
    .collection<AttendanceRecord>('attendees')
    .find({ appointmentId: { $in: inWindow.map((a) => a._id) } })
    .toArray();
  const attendeeByAppt = new Map<string, AttendanceRecord>();
  for (const at of attendees) {
    if (at.archivedAt || at.deletedAt || at.cancelledAt) continue;
    attendeeByAppt.set(at.appointmentId, at);
  }

  const receptionNotes = await computeReceptionNotes(db, inWindow);

  // Cliniko's /bookings also returns generic blocked-time slots (no linked patient at all) —
  // these aren't real appointments, so a "day briefing" for patients only counts the ones with an
  // actual attendee.
  const dayAppts = inWindow.filter((a) => attendeeByAppt.has(a._id));
  if (!dayAppts.length) {
    return {
      date,
      businessName: business?.name,
      entries: [],
      summary: { patientNotes: [], receptionNotes, trends: ['No appointments booked.'] },
      mocked: true,
    };
  }

  const patientIds = [...attendeeByAppt.values()].map((a) => a.patientId);
  const practitionerIds = [...new Set(dayAppts.map((a) => a.practitionerId).filter((id): id is string => !!id))];
  const [patients, practitioners] = await Promise.all([
    db.collection<Patient>('patients').find({ _id: { $in: patientIds } }).toArray(),
    db.collection<{ _id: string; name: string }>('practitioners').find({ _id: { $in: practitionerIds } }).toArray(),
  ]);
  const patientById = new Map(patients.map((p) => [p._id, p]));
  const practitionerById = new Map(practitioners.map((p) => [p._id, p]));

  const entries: TodayEntry[] = [...dayAppts]
    .sort((a, b) => a.startsAt.localeCompare(b.startsAt))
    .map((appt) => {
      const attendee = attendeeByAppt.get(appt._id);
      const patient = attendee ? patientById.get(attendee.patientId) : undefined;
      const practitioner = appt.practitionerId ? practitionerById.get(appt.practitionerId) : undefined;
      return {
        patientName: patient ? `${patient.firstName} ${patient.lastName}`.trim() || 'Unknown patient' : 'Unknown patient',
        practitionerName: practitioner?.name ?? 'Unassigned',
        startsAt: appt.startsAt,
        notes: combinedNotes(patient, appt, attendee),
      };
    });

  const judged = CURATED_SUMMARIES[`${date}_${businessId}`] ?? mockSummarize(entries);
  const summary: TodaySummary = { ...judged, receptionNotes };
  return { date, businessName: business?.name, entries, summary, mocked: true };
}

export async function computeTodayBriefing(db: Db, receptionistId: string, now = new Date()): Promise<TodayBriefing> {
  const date = practiceDay(now);
  const businessId = await businessFor(db, receptionistId, date);
  const next = await nextShiftFor(db, receptionistId, date);
  const nextShift = next ? await computeDayBriefing(db, next.businessId, next.date) : undefined;

  if (businessId) return { status: 'ok', ...(await computeDayBriefing(db, businessId, date)), nextShift };
  if (!next) return { status: 'not_scheduled', date };
  return { status: 'not_scheduled', date, nextShift };
}
