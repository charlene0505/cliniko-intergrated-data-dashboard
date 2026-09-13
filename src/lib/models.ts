export interface Patient {
  _id: string;              // Cliniko patient ID
  firstName: string;
  lastName: string;
  clinikoCreatedAt: Date;
  clinikoUpdatedAt: Date;
  referringDoctorId: string | null;
  syncedAt: Date;
  isDeleted: boolean;
  state: string | null;
  postCode: string | null;
  country: string | null;
  email: string | null;
  phone: string | null;
  appointmentNotes: string | null;
  referralSource: string | null;   // Cliniko's own "how did you hear about us" field, verbatim
}

export interface Doctor {
  _id: string;              // Cliniko contact ID
  firstName: string | null;
  lastName: string | null;
  companyName: string | null;
  displayName: string;      // Pre-formatted: "Dr. Jane Wong (Sydney Medical Centre)"
  clinikoUrl: string;
  syncedAt: Date;
}

export type StatPeriod = 'alltime' | 'ytd' | 'mtd' | '365d' | '90d' | '30d' | '7d';

export interface ReferralStat {
  _id: StatPeriod;          // Period identifier
  computedAt: Date;
  totalPatients: number;
  patientsWithReferrer: number;
  topReferrers: {
    doctorId: string;
    displayName: string;
    count: number;
  }[];
}

export interface ContactFailure {
  contactId: string;
  message: string;
}

// Each scope syncs and tracks its own incremental cutoff independently, so refreshing
// appointments doesn't force a re-fetch of patients (or vice versa).
export type SyncScope = 'patients' | 'appointments' | 'clinical';

export interface SyncJob {
  scope: SyncScope;
  contactFailures?: ContactFailure[];
  type: 'full' | 'incremental';
  status: 'running' | 'complete' | 'failed';
  startedAt: Date;
  completedAt: Date | null;
  patientsProcessed: number;
  patientsUpserted: number;
  doctorsUpserted: number;
  appointmentsUpserted: number;
  attendeesUpserted: number;
  patientCasesUpserted: number;
  lastSyncedAt: Date | null;  // The updatedAt cutoff used for incremental sync
  error: string | null;
}

// ── Reception: receptionists, their schedule, and internal tasks/messages ──
//
// Cliniko has no concept of these 3 people individually — every reception booking
// is made under one shared practitioner ("Receptionist Receptionist"), so unlike
// everything else in this file, these collections have no Cliniko source and are
// authored directly through this app.

export type Weekday = 'Mon' | 'Tue' | 'Wed' | 'Thu' | 'Fri' | 'Sat' | 'Sun';

export interface Receptionist {
  _id: string;               // locally generated (no Cliniko source)
  name: string;
  role: 'receptionist' | 'reception_manager';
}

// The repeating weekly pattern, e.g. "works Tue/Thu/Sat at CBD". One row per
// (receptionist, weekday) — small and static, only edited when someone's usual
// days change.
export interface RecurringShift {
  _id: string;               // `${receptionistId}_${weekday}`
  receptionistId: string;    // FK -> Receptionist._id
  weekday: Weekday;
  businessId: string;        // FK -> businesses._id
}

// A non-repeating exception for one calendar date — a swap, sick day, extra
// day, or day off. Only exists where a specific date deviates from the
// recurring pattern above; resolving "who's on today" checks here first and
// falls back to RecurringShift.
export interface ShiftOverride {
  _id: string;               // `${date}_${businessId}`
  date: string;               // "YYYY-MM-DD"
  businessId: string;        // FK -> businesses._id
  receptionistId: string | null;  // who's actually covering; null = nobody / closed
  coveringFor?: string | null;    // FK -> Receptionist._id — who the recurring pattern would've had, for display
  reason?: string | null;
}

// A task or a plain note, addressed to a receptionist or an existing
// practitioner. One collection for both — a "message" just leaves the
// task-only fields unset.
export interface ReceptionMessage {
  _id: string;
  kind: 'task' | 'message';
  text: string;
  recipient: { type: 'receptionist' | 'practitioner'; id: string };
  senderName: string;         // from the logged-in session (AuthUser.username)
  priority?: 'High' | 'Routine';
  dueDate?: Date | null;
  completedAt?: Date | null;
  completedBy?: string | null;
  createdAt: Date;
}
