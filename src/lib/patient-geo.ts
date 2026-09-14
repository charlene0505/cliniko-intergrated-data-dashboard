import type { Db } from 'mongodb';
import type { Patient } from './models';
import { PRACTICES } from './practices';
import postcodeCentres from './geo/nsw-postcodes.json';

interface PostcodeCentre {
  lng: number;
  lat: number;
  region: string | null;
  greaterSydney: boolean;
}

// Every NSW/ACT postal area's centre, from ABS boundaries (see scripts/build-postcode-geo.mjs).
const CENTRES: Record<string, PostcodeCentre> = postcodeCentres;

export interface PostcodePoint {
  postcode: string;
  region: string | null;
  lng: number;
  lat: number;
  patients: number;
}

export interface PatientGeo {
  points: PostcodePoint[];
  clinics: { label: string; lng: number; lat: number }[];
  mappedPatients: number;
  unmappedPatients: number;
}

// Patients per home postcode, placed at the postal area's centre. Cliniko's postcode is free text, so
// anything that isn't a known NSW/ACT postal area (blank, "NSW", an interstate or overseas code) is
// counted as unmapped rather than guessed at. Grouped inside MongoDB, so only ~400 rows come back.
export async function readPatientGeo(db: Db): Promise<PatientGeo | null> {
  const rows = await db.collection<Patient>('patients')
    .aggregate<{ _id: string; patients: number }>([
      { $match: { isDeleted: false } },
      { $group: { _id: { $trim: { input: { $toString: { $ifNull: ['$postCode', ''] } } } }, patients: { $sum: 1 } } },
    ])
    .toArray();
  if (!rows.length) return null;

  const points: PostcodePoint[] = [];
  let unmappedPatients = 0;
  for (const row of rows) {
    const centre = CENTRES[row._id];
    if (!centre) {
      unmappedPatients += row.patients;
      continue;
    }
    points.push({ postcode: row._id, region: centre.region, lng: centre.lng, lat: centre.lat, patients: row.patients });
  }
  points.sort((a, b) => b.patients - a.patients);

  return {
    points,
    // Street addresses aren't stored, so each clinic is marked at its own postcode's centre.
    clinics: PRACTICES.map((p) => ({ label: p.label, lng: CENTRES[p.postcode].lng, lat: CENTRES[p.postcode].lat })),
    mappedPatients: points.reduce((sum, p) => sum + p.patients, 0),
    unmappedPatients,
  };
}
