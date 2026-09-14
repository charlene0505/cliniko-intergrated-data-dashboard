import type { Db } from "mongodb";
import type { AppointmentRecord, AttendanceRecord } from "./clinical";
import type { Patient, Visit } from "./models";
import { practiceDay, type DateRange } from "./date-range";
import { hasDailyStats, replaceDailyStats, sumDailyStats } from "./daily-stats";
import { replaceDerived } from "./derived";

export interface MixSlice {
  label: string;
  count: number;
}

// ── Referral source ─────────────────────────────────────────────────────────
//
// Cliniko's patients.referral_source is a real field, but it's a free-text box, not a locked
// dropdown — ~2% of records have someone's name, a claim number, or a date typed into it instead
// of a source. Bucketed from a real sample of this practice's data (2,000 patients): "(none)" 973,
// "Dr Referral" 449, "Word of Mouth" 237, "Website" 207, "Google Map" 77, "Street Sign" 37, plus
// ~25 one-off entries.
const REFERRAL_SOURCE_BUCKETS: { label: string; pattern: RegExp }[] = [
  // "family" is deliberately not a keyword here — real GP referral sources are often typed as an
  // actual practice name ("Diligence Family Practice", "Kingsgrove Family Med Centre"), and it
  // would swallow those before the GP check below ever ran.
  {
    label: "Word of Mouth",
    pattern: /word of mouth|existing patient|\bfriend\b/i,
  },
  {
    label: "GP",
    pattern:
      /\bdr\b|\bgp\b|doctor|referral|medical|practice|\bcentre\b|specialist/i,
  },
  { label: "Google", pattern: /google|website|web\b/i },
  // Health funds/insurers occasionally get typed into this field directly (e.g. "GIO") rather
  // than tracked as a claim elsewhere — a short known-name list, since there's no reliable
  // "insurance" keyword to match on in the stray entries themselves.
  {
    label: "Private Health Fund",
    pattern:
      /health fund|insur|\bgio\b|\bbupa\b|medibank|\bhcf\b|\bnib\b|\baia\b/i,
  },
];

// null means "no referral source recorded" — excluded entirely rather than bucketed as Others, so
// the mix reflects the ratio among patients who were actually referred by something, not diluted
// by the (much larger) group nobody asked or nobody answered.
export function classifyReferralSource(raw: string | null): string | null {
  if (!raw || !raw.trim()) return null;
  const match = REFERRAL_SOURCE_BUCKETS.find((b) => b.pattern.test(raw));
  return match?.label ?? "Others";
}

// Rebuilt at the end of a patients sync, as daily counts per bucket by the day each patient was
// created. The bucketing is regex-based so it runs here in Node — once per sync, not once per request.
export async function rebuildReferralSourceDailyStats(db: Db): Promise<void> {
  const patients = await db
    .collection<Patient>("patients")
    .find({ isDeleted: false, referralSource: { $nin: [null, ""] } })
    .project<Pick<Patient, "referralSource" | "clinikoCreatedAt">>({ referralSource: 1, clinikoCreatedAt: 1 })
    .toArray();

  const rows = new Map<string, { date: string; key: string; count: number }>();
  for (const p of patients) {
    const label = classifyReferralSource(p.referralSource);
    if (!label) continue;
    const date = practiceDay(p.clinikoCreatedAt);
    const row = rows.get(`${date}|${label}`) ?? { date, key: label, count: 0 };
    row.count++;
    rows.set(`${date}|${label}`, row);
  }
  await replaceDailyStats(db, "referralSource", [...rows.values()]);
}

async function readReferralSourceMix(db: Db, range: DateRange): Promise<MixSlice[]> {
  const rows = await db
    .collection("daily_stats")
    .aggregate<{ _id: string; count: number }>([...sumDailyStats("referralSource", range), { $sort: { count: -1, _id: 1 } }])
    .toArray();
  return rows.map((r) => ({ label: r._id, count: r.count }));
}

// ── Funding ──────────────────────────────────────────────────────────────────
//
// patient_cases.name is unbounded free text (1,000+ distinct values in this practice's data) and
// can't be classified reliably. appointment_types is different: a small, practice-defined
// vocabulary (~58 entries) that bakes the funding source into the type's own name — e.g.
// "Physiotherapy: Workcover 1 Area Initial", "Physiotherapy: NDIS In Clinic". A patient's current
// funding is read from the appointment type of their most recent *clinical* booking (administrative
// types — report writing, case conferencing, staff interviews, product sales — are skipped since
// they don't represent how the patient's care is actually funded).
const ADMIN_APPOINTMENT_TYPE_PATTERN =
  /staff interview|product sales|report writing|case conferenc|clinical notes fee|in service|pre-employment/i;

const FUNDING_BUCKETS: { label: string; pattern: RegExp }[] = [
  { label: "NDIS", pattern: /ndis/i },
  { label: "WorkCover", pattern: /\bwc\b|workcover/i },
  { label: "CTP", pattern: /\bctp\b/i },
  { label: "DVA", pattern: /\bdva\b/i },
  { label: "GPCCMP", pattern: /gpccmp|\bepc\b|\bahtr\b/i }, // AHTR = Allied Health Treatment Request, issued under an EPC/GPCCMP plan
];

// Generic clinical visits with no funding keyword at all ("Physiotherapy: Initial Appointment", a
// massage session) are privately billed by elimination. Specialty service lines that don't map to
// any of the five named sources (on-site workshops, aged care, OT, ergonomics assessments, group
// classes) go to Others rather than being guessed into Private.
const PRIVATE_APPOINTMENT_TYPE_PATTERN =
  /\bprivate\b|initial appointment|subsequent appointment|remedial massage/i;

export function classifyFundingType(
  appointmentTypeName: string | null,
): string {
  if (!appointmentTypeName) return "Others";
  const funded = FUNDING_BUCKETS.find((b) =>
    b.pattern.test(appointmentTypeName),
  );
  if (funded) return funded.label;
  return PRIVATE_APPOINTMENT_TYPE_PATTERN.test(appointmentTypeName)
    ? "Private"
    : "Others";
}

// Rebuilt at the end of an appointments or clinical sync — funding depends on bookings, attendees and
// appointment types, which arrive in different scopes. Joining and classifying happen here, once, so
// the range query below never loads appointments or evaluates a regex.
export async function rebuildVisits(db: Db): Promise<void> {
  const [appointments, attendees, appointmentTypes] = await Promise.all([
    db
      .collection<AppointmentRecord>("appointments")
      .find({})
      .project<AppointmentRecord>({ startsAt: 1, cancelledAt: 1, archivedAt: 1, deletedAt: 1, didNotArrive: 1, appointmentTypeId: 1, businessId: 1 })
      .toArray(),
    db
      .collection<AttendanceRecord>("attendees")
      .find({})
      .project<AttendanceRecord>({ patientId: 1, appointmentId: 1, cancelledAt: 1, archivedAt: 1, deletedAt: 1 })
      .toArray(),
    db.collection<{ _id: string; name: string }>("appointment_types").find({}).toArray(),
  ]);

  const typeNameById = new Map(appointmentTypes.map((t) => [t._id, t.name]));
  const apptById = new Map(appointments.map((a) => [a._id, a]));

  const visits: Visit[] = [];
  for (const at of attendees) {
    if (at.archivedAt || at.deletedAt) continue;
    const appt = apptById.get(at.appointmentId);
    if (!appt || appt.archivedAt || appt.deletedAt) continue;
    const typeName = appt.appointmentTypeId ? (typeNameById.get(appt.appointmentTypeId) ?? null) : null;
    visits.push({
      _id: at._id,
      patientId: at.patientId,
      appointmentId: at.appointmentId,
      businessId: appt.businessId ?? null,
      startsAt: appt.startsAt,
      date: practiceDay(new Date(appt.startsAt)),
      fundingLabel: classifyFundingType(typeName),
      isClinical: !typeName || !ADMIN_APPOINTMENT_TYPE_PATTERN.test(typeName),
      cancelledAt: at.cancelledAt ?? appt.cancelledAt ?? null,
      didNotArrive: appt.didNotArrive === true,
    });
  }
  await replaceDerived(db, "visits", {}, visits);
}

// Builds `visits` on demand when it's missing, or was built before `businessId` was added to it — so
// a deploy doesn't have to wait for the next sync. Returns false when there's no attendance to build from.
export async function ensureVisits(db: Db): Promise<boolean> {
  const sample = await db.collection<Visit>("visits").findOne({}, { projection: { businessId: 1 } });
  if (sample && "businessId" in sample) return true;
  if (!(await db.collection("attendees").findOne({}, { projection: { _id: 1 } }))) return false;
  await rebuildVisits(db);
  return true;
}

// A patient's funding for a period is the funding of their latest clinical booking inside it.
async function readFundingMix(db: Db, range: DateRange): Promise<MixSlice[]> {
  const rows = await db
    .collection<Visit>("visits")
    .aggregate<{ _id: string; count: number }>([
      { $match: { date: { $gte: range.from, $lte: range.to }, isClinical: true } },
      { $sort: { startsAt: -1, _id: -1 } },
      { $group: { _id: "$patientId", label: { $first: "$fundingLabel" } } },
      { $group: { _id: "$label", count: { $sum: 1 } } },
      { $sort: { count: -1, _id: 1 } },
    ])
    .toArray();
  return rows.map((r) => ({ label: r._id, count: r.count }));
}

// ── Range queries ────────────────────────────────────────────────────────────

export type PatientMixMode = "Funding" | "Referral source";

// Returns null only when the source data has never been synced (the panel's "no data" state); a
// period with nothing in it is a real, empty mix.
export async function readPatientMix(db: Db, mode: PatientMixMode, range: DateRange): Promise<MixSlice[] | null> {
  // Before the first sync that builds the derived collection (e.g. straight after deploying this), it's
  // built once on demand from whatever raw data is already there.
  if (mode === "Funding") {
    if (!(await ensureVisits(db))) return null;
    return readFundingMix(db, range);
  }
  if (!(await hasDailyStats(db, "referralSource"))) {
    if (!(await db.collection("patients").findOne({}, { projection: { _id: 1 } }))) return null;
    await rebuildReferralSourceDailyStats(db);
  }
  return readReferralSourceMix(db, range);
}
