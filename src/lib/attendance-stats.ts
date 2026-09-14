import type { Db } from "mongodb";

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
  monthly: {
    label: string;
    newCount: number;
    totalCount: number;
    percent: number;
  }[];
}

export type PatientMixRange =
  | "Last 7 Days"
  | "Last 30 Days"
  | "Year to Date"
  | "Last Year";

export interface TodayApptStats {
  completed: number;
  remaining: number;
}

export interface AppointmentVolumeStats {
  count: number;
  deltaPercent: number | null;
}

// ── Stored results ──────────────────────────────────────────────────────────
//
// Both attendance panels (No-shows, New vs Returning) are derived from a full scan of appointments
// and attendees. Running that per request left the panels on "Loading real attendance data…" for
// the length of the scan on every refresh, so — as with referral stats and patient mix — each range
// is computed once during sync and read back from `attendance_stats`.

type Clinical = Awaited<ReturnType<typeof loadClinical>>;

export interface AttendanceStat {
  _id: PatientMixRange;
  computedAt: Date;
  // Range-independent, but stored on every range's document so a read is a single findOne.
  noShows: NoShowStats;
  patientMix: PatientMixStats;
}

const ATTENDANCE_RANGES: PatientMixRange[] = ["Last 7 Days", "Last 30 Days", "Year to Date", "Last Year"];

export async function computeAttendance(
  db: Db,
  range: PatientMixRange,
  clinical?: Clinical,
): Promise<{ noShows: NoShowStats; patientMix: PatientMixStats } | null> {
  const data = clinical ?? (await loadClinical(db));
  const now = new Date();
  const [noShows, patientMix] = await Promise.all([
    computeNoShowStats(db, now, data),
    computePatientMixStats(db, range, now, data),
  ]);
  return noShows && patientMix ? { noShows, patientMix } : null;
}

export async function readStoredAttendance(db: Db, range: PatientMixRange): Promise<AttendanceStat | null> {
  return db.collection<AttendanceStat>("attendance_stats").findOne({ _id: range });
}

export async function storeAttendance(
  db: Db,
  range: PatientMixRange,
  value: { noShows: NoShowStats; patientMix: PatientMixStats },
): Promise<void> {
  await db.collection<AttendanceStat>("attendance_stats").replaceOne(
    { _id: range },
    { computedAt: new Date(), noShows: value.noShows, patientMix: value.patientMix },
    { upsert: true },
  );
}

// Called at the end of a sync. Loads the clinical data once and reuses it for every range, rather
// than re-scanning both collections for each of the four ranges.
export async function computeAndStoreAttendance(db: Db): Promise<void> {
  const clinical = await loadClinical(db);
  for (const range of ATTENDANCE_RANGES) {
    const value = await computeAttendance(db, range, clinical);
    if (value) await storeAttendance(db, range, value);
  }
}

function buildMixBuckets(range: PatientMixRange, now: Date) {
  if (range === "Last 7 Days") {
    // 7 daily buckets — include the date, not just the weekday name, so consecutive weeks
    // (or a week spanning a month boundary) are never ambiguous.
    return Array.from({ length: 7 }, (_, i) => {
      const start = new Date(
        now.getFullYear(),
        now.getMonth(),
        now.getDate() - (6 - i),
      );
      const end = new Date(
        start.getFullYear(),
        start.getMonth(),
        start.getDate() + 1,
      );
      return {
        label: `${start.toLocaleString("en-AU", { weekday: "short" })} ${start.getDate()}`,
        start: start.getTime(),
        end: end.getTime(),
      };
    });
  }
  if (range === "Year to Date") {
    // One monthly bucket per elapsed month this year (1 in January, up to 12 in December).
    const months = now.getMonth() + 1;
    return Array.from({ length: months }, (_, i) => {
      const start = new Date(now.getFullYear(), i, 1);
      const end = new Date(start.getFullYear(), start.getMonth() + 1, 1);
      return {
        label: start.toLocaleString("en-AU", { month: "short" }),
        start: start.getTime(),
        end: end.getTime(),
      };
    });
  }
  if (range === "Last Year") {
    // 12 trailing monthly buckets
    return Array.from({ length: 12 }, (_, i) => {
      const start = new Date(now.getFullYear(), now.getMonth() - (11 - i), 1);
      const end = new Date(start.getFullYear(), start.getMonth() + 1, 1);
      return {
        label: start.toLocaleString("en-AU", { month: "short" }),
        start: start.getTime(),
        end: end.getTime(),
      };
    });
  }
  // 'Last 30 Days': 4 trailing 7-day weeks
  return Array.from({ length: 4 }, (_, i) => {
    const end = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate() - (3 - i) * 7 + 1,
    );
    const start = new Date(
      end.getFullYear(),
      end.getMonth(),
      end.getDate() - 7,
    );
    return {
      label: `${start.getDate()}/${start.getMonth() + 1}`,
      start: start.getTime(),
      end: end.getTime(),
    };
  });
}

async function loadClinical(db: Db) {
  const [appointments, attendees] = await Promise.all([
    // Projected to just the fields the stats read. Pulling whole documents (notes, practitioner and
    // type ids, extra timestamps) made every scan transfer far more than it uses.
    db
      .collection<StoredAppointment>("appointments")
      .find({})
      .project<StoredAppointment>({ startsAt: 1, cancelledAt: 1, archivedAt: 1, deletedAt: 1, didNotArrive: 1 })
      .toArray(),
    db
      .collection<StoredAttendee>("attendees")
      .find({})
      .project<StoredAttendee>({ patientId: 1, appointmentId: 1, cancelledAt: 1, archivedAt: 1, deletedAt: 1 })
      .toArray(),
  ]);
  return { appointments, attendees };
}

// A visit is "flagged" if the patient didn't arrive, or cancelled less than 24h before the appointment.
function isLateCancellation(cancelledAt: Date | null, startsAt: Date): boolean {
  return (
    !!cancelledAt &&
    cancelledAt <= startsAt &&
    startsAt.getTime() - cancelledAt.getTime() < 24 * 3600 * 1000
  );
}

export async function computeNoShowStats(
  db: Db,
  now = new Date(),
  clinical?: Clinical,
): Promise<NoShowStats | null> {
  const { appointments, attendees } = clinical ?? (await loadClinical(db));
  if (!appointments.length) return null;
  const byAppt = new Map(appointments.map((a) => [a._id, a]));

  const MONTHS = 8;
  const buckets = Array.from({ length: MONTHS }, (_, i) => {
    const d = new Date(now.getFullYear(), now.getMonth() - (MONTHS - 1 - i), 1);
    return {
      label: d.toLocaleString("en-AU", { month: "short" }),
      year: d.getFullYear(),
      month: d.getMonth(),
      total: 0,
      flagged: 0,
    };
  });
  const windowStart = new Date(buckets[0].year, buckets[0].month, 1);

  // The headline rate/count is scoped to the exact same trailing window as the monthly chart —
  // not "everything we've ever synced" — so the two numbers always describe the same period.
  let total = 0,
    flagged = 0;
  for (const at of attendees) {
    if (at.archivedAt || at.deletedAt) continue;
    const appt = byAppt.get(at.appointmentId);
    if (!appt || appt.archivedAt || appt.deletedAt) continue;
    const startsAt = new Date(appt.startsAt);
    if (startsAt > now || startsAt < windowStart) continue;

    const cancelledAt = at.cancelledAt
      ? new Date(at.cancelledAt)
      : appt.cancelledAt
        ? new Date(appt.cancelledAt)
        : null;
    const isFlagged =
      appt.didNotArrive === true || isLateCancellation(cancelledAt, startsAt);

    total++;
    if (isFlagged) flagged++;
    const bucket = buckets.find(
      (b) =>
        b.year === startsAt.getFullYear() && b.month === startsAt.getMonth(),
    );
    if (bucket) {
      bucket.total++;
      if (isFlagged) bucket.flagged++;
    }
  }

  const monthly = buckets.map((b) => ({
    label: b.label,
    percent: b.total ? Math.round((b.flagged / b.total) * 1000) / 10 : 0,
  }));
  const ratePercent = total ? Math.round((flagged / total) * 1000) / 10 : 0;
  const last = monthly[monthly.length - 1]?.percent ?? 0;
  const prev = monthly[monthly.length - 2]?.percent ?? last;
  const periodLabel = `${buckets[0].label}–${buckets[buckets.length - 1].label} ${buckets[buckets.length - 1].year}`;

  return {
    ratePercent,
    deltaPts: Math.round((last - prev) * 10) / 10,
    totalBooked: total,
    flaggedCount: flagged,
    periodLabel,
    monthly,
  };
}

export async function computePatientMixStats(
  db: Db,
  range: PatientMixRange = "Last 30 Days",
  now = new Date(),
  clinical?: Clinical,
): Promise<PatientMixStats | null> {
  const { appointments, attendees } = clinical ?? (await loadClinical(db));
  if (!appointments.length) return null;
  const byAppt = new Map(appointments.map((a) => [a._id, a]));

  // A patient counts as "new" in a period if their oldest recorded visit (their first-ever
  // appointment, by our data) falls inside that period; every other patient who visited during
  // the period is "returning". This depends only on attendance history — not the Cliniko
  // patient record's created_at, which is unreliable: Cliniko can reset it when patient records
  // are merged, so a years-long patient's profile can end up with a created_at from last week.
  const visitsByPatient = new Map<string, Date[]>();
  for (const at of attendees) {
    if (at.archivedAt || at.deletedAt) continue;
    const appt = byAppt.get(at.appointmentId);
    if (!appt || appt.archivedAt || appt.deletedAt || appt.didNotArrive)
      continue;
    if (at.cancelledAt || appt.cancelledAt) continue;
    const startsAt = new Date(appt.startsAt);
    if (startsAt > now) continue;
    if (!visitsByPatient.has(at.patientId))
      visitsByPatient.set(at.patientId, []);
    visitsByPatient.get(at.patientId)!.push(startsAt);
  }

  const buckets = buildMixBuckets(range, now).map((b) => ({
    ...b,
    newCount: 0,
    totalCount: 0,
  }));

  for (const [, dates] of visitsByPatient) {
    const oldestVisit = Math.min(...dates.map((d) => d.getTime()));
    for (const bucket of buckets) {
      if (
        !dates.some(
          (d) => d.getTime() >= bucket.start && d.getTime() < bucket.end,
        )
      )
        continue;
      bucket.totalCount++;
      if (oldestVisit >= bucket.start && oldestVisit < bucket.end)
        bucket.newCount++;
    }
  }

  return {
    monthly: buckets.map((b) => ({
      label: b.label,
      newCount: b.newCount,
      totalCount: b.totalCount,
      percent: b.totalCount
        ? Math.round((b.newCount / b.totalCount) * 1000) / 10
        : 0,
    })),
  };
}

function isLiveAppointment(a: StoredAppointment): boolean {
  return !a.cancelledAt && !a.archivedAt && !a.deletedAt;
}

// Cliniko's times are stored as second-precision UTC strings ("2026-09-14T23:00:00Z"). Bounds are
// formatted identically so a string comparison on the indexed startsAt field matches the instant
// comparison, letting a window query read only its own appointments instead of all of them.
function clinikoIso(d: Date): string {
  return d.toISOString().replace(/\.\d{3}Z$/, "Z");
}

// `businessId` narrows the window to one practice; null counts every practice.
async function findAppointmentsBetween(
  db: Db,
  start: Date,
  end: Date,
  businessId: string | null,
): Promise<StoredAppointment[] | null> {
  const appointments = db.collection<StoredAppointment>("appointments");
  // Distinguish "nothing synced yet" (null, so the caller falls back to placeholder data) from
  // "synced, but genuinely zero appointments in the window" (e.g. a Sunday closure, or a practice
  // that's closed today).
  if (!(await appointments.findOne({}, { projection: { _id: 1 } }))) return null;
  return appointments
    .find({ startsAt: { $gte: clinikoIso(start), $lt: clinikoIso(end) }, ...(businessId ? { businessId } : {}) })
    .project<StoredAppointment>({ startsAt: 1, cancelledAt: 1, archivedAt: 1, deletedAt: 1, didNotArrive: 1 })
    .toArray();
}

export async function computeTodayApptStats(
  db: Db,
  now = new Date(),
  businessId: string | null = null,
): Promise<TodayApptStats | null> {
  const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const endOfDay = new Date(startOfDay.getTime() + 24 * 3600 * 1000);
  const appointments = await findAppointmentsBetween(db, startOfDay, endOfDay, businessId);
  if (!appointments) return null;

  const today = appointments.filter(isLiveAppointment);
  const completed = today.filter((a) => new Date(a.startsAt) <= now).length;
  return { completed, remaining: today.length - completed };
}

// Compares the trailing 7 days against the 7 days before that, so the KPI's "+8% than last
// week" reads the same trailing window every time it's viewed, not a fixed calendar week.
export async function computeAppointmentVolumeStats(
  db: Db,
  now = new Date(),
  businessId: string | null = null,
): Promise<AppointmentVolumeStats | null> {
  const weekMs = 7 * 24 * 3600 * 1000;
  const thisWeekStart = new Date(now.getTime() - weekMs);
  const lastWeekStart = new Date(now.getTime() - 2 * weekMs);
  const appointments = await findAppointmentsBetween(db, lastWeekStart, now, businessId);
  if (!appointments) return null;

  let thisWeek = 0,
    lastWeek = 0;
  for (const a of appointments) {
    if (!isLiveAppointment(a)) continue;
    const startsAt = new Date(a.startsAt);
    if (startsAt >= thisWeekStart && startsAt < now) thisWeek++;
    else if (startsAt >= lastWeekStart && startsAt < thisWeekStart) lastWeek++;
  }

  const deltaPercent = lastWeek
    ? Math.round(((thisWeek - lastWeek) / lastWeek) * 1000) / 10
    : null;
  return { count: thisWeek, deltaPercent };
}
