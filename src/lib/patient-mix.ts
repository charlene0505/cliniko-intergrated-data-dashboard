import type { Db } from "mongodb";
import type { AppointmentRecord, AttendanceRecord } from "./clinical";
import type { Patient } from "./models";

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

export async function computeReferralSourceMix(
  db: Db,
): Promise<MixSlice[] | null> {
  const patients = await db
    .collection<Patient>("patients")
    .find({ isDeleted: false })
    .project({ referralSource: 1 })
    .toArray();
  if (!patients.length) return null;

  const counts = new Map<string, number>();
  for (const p of patients) {
    const label = classifyReferralSource(p.referralSource);
    if (!label) continue;
    counts.set(label, (counts.get(label) ?? 0) + 1);
  }
  if (!counts.size) return null;
  return [...counts.entries()]
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => b.count - a.count);
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

export async function computeFundingMix(db: Db): Promise<MixSlice[] | null> {
  const [appointments, attendees, appointmentTypes] = await Promise.all([
    db.collection<AppointmentRecord>("appointments").find({}).toArray(),
    db.collection<AttendanceRecord>("attendees").find({}).toArray(),
    db
      .collection<{ _id: string; name: string }>("appointment_types")
      .find({})
      .toArray(),
  ]);
  if (!appointments.length || !attendees.length) return null;

  const typeNameById = new Map(appointmentTypes.map((t) => [t._id, t.name]));
  const apptById = new Map(appointments.map((a) => [a._id, a]));

  // Latest clinical (non-admin) booking per patient, most recent first.
  const latestByPatient = new Map<string, AppointmentRecord>();
  const sorted = [...attendees].sort((a, b) => {
    const aAppt = apptById.get(a.appointmentId);
    const bAppt = apptById.get(b.appointmentId);
    return (bAppt?.startsAt ?? "").localeCompare(aAppt?.startsAt ?? "");
  });
  for (const at of sorted) {
    if (at.archivedAt || at.deletedAt || latestByPatient.has(at.patientId))
      continue;
    const appt = apptById.get(at.appointmentId);
    if (!appt || appt.archivedAt || appt.deletedAt) continue;
    const typeName = appt.appointmentTypeId
      ? typeNameById.get(appt.appointmentTypeId)
      : undefined;
    if (typeName && ADMIN_APPOINTMENT_TYPE_PATTERN.test(typeName)) continue;
    latestByPatient.set(at.patientId, appt);
  }

  const counts = new Map<string, number>();
  for (const appt of latestByPatient.values()) {
    const typeName = appt.appointmentTypeId
      ? (typeNameById.get(appt.appointmentTypeId) ?? null)
      : null;
    const label = classifyFundingType(typeName);
    counts.set(label, (counts.get(label) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => b.count - a.count);
}
