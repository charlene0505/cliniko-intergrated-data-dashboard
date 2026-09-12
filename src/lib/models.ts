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
