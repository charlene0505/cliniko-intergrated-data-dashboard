import type { Db } from "mongodb";
import { clinikoFetch } from "./cliniko";
import { isEpcCase } from "./clinical";
import type {
  CaseRecord,
  AppointmentRecord,
  AttendanceRecord,
} from "./clinical";

type Link = { links?: { self?: string } } | null;
interface RawRecord {
  id: string;
  [key: string]: unknown;
}
function id(link: unknown): string | null {
  return (
    (link as Link)?.links?.self?.match(/\/([^/?]+)(?:\?.*)?$/)?.[1] ?? null
  );
}
function str(value: unknown) {
  return typeof value === "string" ? value : null;
}

export async function fetchClinicalPages(
  endpoint: string,
  key: string,
  query = "",
): Promise<RawRecord[]> {
  const records: RawRecord[] = [];
  for (let page = 1; ; page++) {
    await new Promise((resolve) => setTimeout(resolve, 310));
    const result = (await clinikoFetch(
      `${endpoint}?per_page=100&page=${page}${query}`,
    )) as Record<string, unknown>;
    if (!Array.isArray(result[key]))
      throw new Error(`Invalid Cliniko ${key} response`);
    records.push(...(result[key] as RawRecord[]));
    if (!(result.links as { next?: string })?.next) return records;
  }
}

function startOfThisYear(): string {
  return new Date(Date.UTC(new Date().getUTCFullYear(), 0, 1)).toISOString();
}

// Incremental cutoff when this scope has synced before; otherwise bound the first fetch to this
// year for the high-volume collections (appointments/attendees — one patient can have years of
// history). Patient cases aren't bounded on a first sync: an EPC/AHTR plan opened last year can
// still be active today.
//
// The whole "q[]=..." expression must be percent-encoded, not just the date value — Cliniko's
// Rails backend only recognises the array-filter param as `q%5B%5D`. A literal `q[]=` still gets
// a 200 response, but the filter is silently ignored and every record is returned unfiltered.
function updatedAtFilter(
  since: Date | null,
  boundFirstFetchToThisYear: boolean,
): string {
  const cutoff = since
    ? since.toISOString()
    : boundFirstFetchToThisYear
      ? startOfThisYear()
      : null;
  return cutoff
    ? `&${encodeURIComponent("q[]")}=${encodeURIComponent(`updated_at:>=${cutoff}`)}`
    : "";
}

async function upsertAll<T extends { _id: string }>(
  db: Db,
  name: string,
  records: T[],
) {
  if (!records.length) return;
  const collection = db.collection<T>(name);
  for (let offset = 0; offset < records.length; offset += 500) {
    const batch = records.slice(offset, offset + 500);
    await collection.bulkWrite(
      batch.map((r) => ({
        updateOne: {
          filter: { _id: r._id } as never,
          update: { $set: r },
          upsert: true,
        },
      })),
    );
  }
}

export async function syncAppointments(
  db: Db,
  send: (data: object) => void,
  since: Date | null,
) {
  send({
    phase: "processing",
    message: since
      ? "Fetching updated appointments from Cliniko..."
      : "Fetching this year's appointments from Cliniko...",
  });
  const rawBookings = await fetchClinicalPages(
    "/bookings",
    "bookings",
    updatedAtFilter(since, true),
  );
  const bookings: AppointmentRecord[] = rawBookings.map((b) => {
    if (typeof b.starts_at !== "string" || typeof b.ends_at !== "string")
      throw new Error("Booking is missing its dates");
    return {
      _id: String(b.id),
      startsAt: b.starts_at,
      endsAt: b.ends_at,
      cancelledAt: str(b.cancelled_at),
      archivedAt: str(b.archived_at),
      deletedAt: str(b.deleted_at),
      didNotArrive: b.did_not_arrive === true,
      practitionerId: id(b.practitioner),
      businessId: id(b.business),
    };
  });
  await upsertAll(db, "appointments", bookings);

  send({
    phase: "processing",
    message: since
      ? "Fetching updated attendees from Cliniko..."
      : "Fetching this year's attendees from Cliniko...",
  });
  const rawAttendees = await fetchClinicalPages(
    "/attendees",
    "attendees",
    updatedAtFilter(since, true),
  );
  const attendees: AttendanceRecord[] = rawAttendees.map((a) => {
    const patientId = id(a.patient),
      appointmentId = id(a.booking);
    if (!patientId || !appointmentId)
      throw new Error("Attendee is missing patient or booking");
    return {
      _id: String(a.id),
      patientId,
      appointmentId,
      caseId: id(a.patient_case),
      cancelledAt: str(a.cancelled_at),
      archivedAt: str(a.archived_at),
      deletedAt: str(a.deleted_at),
      arrived: typeof a.arrived === "boolean" ? a.arrived : null,
    };
  });
  await upsertAll(db, "attendees", attendees);

  return {
    appointmentsUpserted: bookings.length,
    attendeesUpserted: attendees.length,
  };
}

export async function syncClinicalOthers(
  db: Db,
  send: (data: object) => void,
  since: Date | null,
) {
  send({
    phase: "processing",
    message: "Fetching patient cases from Cliniko...",
  });
  const rawCases = await fetchClinicalPages(
    "/patient_cases",
    "patient_cases",
    updatedAtFilter(since, false),
  );
  const cases: CaseRecord[] = rawCases.map((c) => {
    const patientId = id(c.patient);
    if (!patientId || typeof c.name !== "string")
      throw new Error("Patient case is missing its patient or name");
    return {
      _id: String(c.id),
      patientId,
      name: c.name,
      isEpc: isEpcCase(c.name),
      maxSessions: typeof c.max_sessions === "number" ? c.max_sessions : null,
      issueDate: str(c.issue_date),
      expiryDate: str(c.expiry_date),
      closedAt: str(c.closed_at),
      archivedAt: str(c.archived_at),
      includeCancelled: c.include_cancelled_attendees === true,
      includeDna: c.include_dna_attendees === true,
    };
  });
  await upsertAll(db, "patient_cases", cases);

  send({
    phase: "processing",
    message: "Fetching practitioners and businesses from Cliniko...",
  });
  const practitioners = await fetchClinicalPages(
    "/practitioners",
    "practitioners",
  );
  const businesses = await fetchClinicalPages("/businesses", "businesses");
  await upsertAll(
    db,
    "practitioners",
    practitioners.map((p) => ({
      _id: String(p.id),
      name: [p.first_name, p.last_name].filter(Boolean).join(" "),
    })),
  );
  await upsertAll(
    db,
    "businesses",
    businesses.map((b) => ({
      _id: String(b.id),
      name: str(b.business_name) ?? str(b.name) ?? "Not recorded",
    })),
  );

  return {
    patientCasesUpserted: cases.length,
    practitioners: practitioners.length,
    businesses: businesses.length,
  };
}
