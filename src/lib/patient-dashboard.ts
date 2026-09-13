import type { Db } from 'mongodb';

// Both live and showcase routes use this query and response shape.
export async function readPatients(db: Db) {
  return db.collection('patients').aggregate([
    { $match: { isDeleted: false } },
    { $sort: { clinikoCreatedAt: -1, _id: 1 } },
    { $limit: 200 },
    { $lookup: { from: 'doctors', localField: 'referringDoctorId', foreignField: '_id', as: 'doctor' } },
    { $project: { _id: 1, firstName: 1, lastName: 1, clinikoCreatedAt: 1,
      doctor: { $ifNull: [{ $arrayElemAt: ['$doctor.displayName', 0] }, 'Not recorded'] },
      clinical: 1 } },
  ]).toArray();
}

export interface DashboardPatient {
  _id: string;
  firstName: string;
  lastName: string;
  clinikoCreatedAt: string;
  doctor: string;
  clinical?: {
    phone: string; email: string; practitioner: string; practice: string;
    reason: string; lastVisit: string; nextAppointment: string | null;
    funding: string; sessionsUsed: number; sessionsApproved: number;
    expiry: string; followUp: string; task: string; claim: string | null;
  };
}
