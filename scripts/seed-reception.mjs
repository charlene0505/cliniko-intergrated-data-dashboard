// Seeds the 3 receptionists (with placeholder names — replace via the dashboard once real staff
// are decided) and their recurring weekly schedule across both practices. Cliniko has no concept
// of these people individually (every reception booking is made under one shared practitioner,
// "Receptionist Receptionist"), so this data has no Cliniko source and lives only in our own DB.
//
// Idempotent: every document uses a fixed _id, so re-running this just re-applies the same shape
// instead of creating duplicates.
import { MongoClient } from 'mongodb';
import { loadEnvFile } from 'node:process';

try { loadEnvFile('.env.local'); } catch (error) { if (error.code !== 'ENOENT') throw error; }
const uri = process.env.MONGODB_URI;
if (!uri) throw new Error('MONGODB_URI environment variable is not set.');

// Cliniko business ids for the two practices (from the `businesses` collection).
const CBD = '73038';         // Sydney Health Physiotherapy - Sydney CBD
const HURSTVILLE = '74938';  // Sydney Health Physiotherapy - Hurstville

const receptionists = [
  { _id: 'receptionist-emma', name: 'Emma Thompson', role: 'receptionist' },
  { _id: 'receptionist-liam', name: 'Liam Carter', role: 'receptionist' },
  { _id: 'receptionist-sophie', name: 'Sophie Nguyen', role: 'reception_manager' },
  // Tracey is the real person behind the "admin" login (see display-name.ts / receptionistIdFor)
  // — a 4th receptionist, not a stand-in for one of the 3 placeholders above.
  { _id: 'receptionist-tracey', name: 'Tracey', role: 'receptionist' },
];

// Emma covers Hurstville all week, Liam covers CBD all week, and Sophie (the manager) splits her
// week across both practices rather than being tied to one.
const shifts = [
  ...['Mon', 'Tue', 'Wed', 'Thu', 'Fri'].map((weekday) => ({ receptionistId: 'receptionist-emma', weekday, businessId: HURSTVILLE })),
  ...['Mon', 'Tue', 'Wed', 'Thu', 'Fri'].map((weekday) => ({ receptionistId: 'receptionist-liam', weekday, businessId: CBD })),
  ...['Mon', 'Wed', 'Fri'].map((weekday) => ({ receptionistId: 'receptionist-sophie', weekday, businessId: HURSTVILLE })),
  ...['Tue', 'Thu'].map((weekday) => ({ receptionistId: 'receptionist-sophie', weekday, businessId: CBD })),
  ...['Tue', 'Wed'].map((weekday) => ({ receptionistId: 'receptionist-tracey', weekday, businessId: CBD })),
].map((s) => ({ _id: `${s.receptionistId}_${s.weekday}`, ...s }));

const client = new MongoClient(uri, { serverSelectionTimeoutMS: 10000 });
try {
  await client.connect();
  const db = client.db();

  await Promise.all(receptionists.map((r) =>
    db.collection('receptionists').replaceOne({ _id: r._id }, r, { upsert: true }),
  ));
  await Promise.all(shifts.map((s) =>
    db.collection('reception_schedule').replaceOne({ _id: s._id }, s, { upsert: true }),
  ));

  console.log(`Seeded ${receptionists.length} receptionists and ${shifts.length} recurring shifts across Hurstville and CBD.`);
} finally {
  await client.close();
}
