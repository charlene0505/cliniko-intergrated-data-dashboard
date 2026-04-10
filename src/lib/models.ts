export interface Patient {
  _id: string;              // Cliniko patient ID
  firstName: string;
  lastName: string;
  clinikoCreatedAt: Date;
  clinikoUpdatedAt: Date;
  referringDoctorId: string | null;
  syncedAt: Date;
  isDeleted: boolean;
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

export interface SyncJob {
  type: 'full' | 'incremental';
  status: 'running' | 'complete' | 'failed';
  startedAt: Date;
  completedAt: Date | null;
  patientsProcessed: number;
  patientsUpserted: number;
  doctorsUpserted: number;
  lastSyncedAt: Date | null;  // The updatedAt cutoff used for incremental sync
  error: string | null;
}
