import { MongoClient } from 'mongodb';
import { loadEnvFile } from 'node:process';

try { loadEnvFile('.env.local'); } catch (error) { if (error.code !== 'ENOENT') throw error; }
const name = process.env.SHOWCASE_DB_NAME;
const uri = process.env.SHOWCASE_MONGODB_URI || process.env.MONGODB_URI;
if (!uri || !name?.startsWith('shp_showcase')) throw new Error('Set SHOWCASE_DB_NAME (starting with shp_showcase) and a MongoDB URI.');
if (process.env.MONGODB_URI && new MongoClient(process.env.MONGODB_URI).db().databaseName === name) throw new Error('Refusing to seed the live database.');
const client = new MongoClient(uri, { serverSelectionTimeoutMS: 10000 });
try {
  await client.connect();
  const db = client.db(name);
  const collections = await db.listCollections({}, { nameOnly: true }).toArray();
  if (collections.length) throw new Error('Refusing to overwrite an existing database. Choose a new SHOWCASE_DB_NAME.');
  const now = new Date();
  const ago = days => new Date(now.getTime() - days * 86400000);
  const firstNames = ['Avery', 'Morgan', 'Riley', 'Casey', 'Taylor', 'Jordan', 'Alex', 'Jamie'];
  const lastNames = ['Example', 'Sample', 'Demo', 'Fiction', 'Testwell', 'Mockford'];
  const doctors = ['Harper Example', 'Rowan Sample', 'Quinn Demo', 'Sage Fiction'].map((name, i) => ({
    _id: `demo-doctor-${i}`, firstName: name.split(' ')[0], lastName: name.split(' ')[1],
    companyName: ['Harbour Demo Medical', 'Grove Demo Practice'][i % 2],
    displayName: `Dr ${name}`, clinikoUrl: `https://example.invalid/contacts/demo-doctor-${i}`, syncedAt: now,
  }));
  const patients = Array.from({ length: 48 }, (_, i) => ({
    _id: `demo-patient-${String(i + 1).padStart(3, '0')}`,
    firstName: firstNames[i % 8], lastName: lastNames[Math.floor(i / 8)],
    clinikoCreatedAt: ago(i * 8), clinikoUpdatedAt: now,
    referringDoctorId: i % 7 === 0 ? null : doctors[i % 4]._id,
    syncedAt: now, isDeleted: false,
    clinical: {
      phone: 'Not dialable — demo only', email: `patient${i + 1}@example.invalid`,
      practitioner: ['Sam Example', 'Lee Sample', 'Robin Demo'][i % 3], practice: ['Harbour Clinic', 'Grove Clinic'][i % 2],
      reason: ['Initial assessment', 'Mobility review', 'Post-operative rehabilitation', 'Persistent back pain review'][i % 4],
      lastVisit: ago(i % 25 + 1).toISOString(), nextAppointment: i % 3 === 0 ? ago(-(i % 7 + 1)).toISOString() : null,
      funding: ['Private', 'EPC', 'WorkCover', 'CTP'][i % 4], sessionsUsed: i % 5,
      sessionsApproved: 5, expiry: ago(-(i % 30 + 3)).toISOString(),
      followUp: i % 3 === 0 ? 'Up to date' : i % 2 ? 'Overdue' : 'Due this week',
      task: i % 3 === 0 ? '' : ['Confirm next appointment', 'Review plan expiry', 'Prepare treatment request'][i % 3],
      claim: i % 4 >= 2 ? `DEMO-CLAIM-${i + 1}` : null,
    },
  }));
  await db.collection('doctors').insertMany(doctors);
  await db.collection('patients').insertMany(patients);
  const cutoffs = { alltime: null, ytd: new Date(now.getFullYear(), 0, 1), mtd: new Date(now.getFullYear(), now.getMonth(), 1), '365d': ago(365), '90d': ago(90), '30d': ago(30), '7d': ago(7) };
  const stats = Object.entries(cutoffs).map(([period, cutoff]) => {
    const selected = patients.filter(p => !cutoff || p.clinikoCreatedAt >= cutoff);
    return { _id: period, computedAt: now, totalPatients: selected.length,
      patientsWithReferrer: selected.filter(p => p.referringDoctorId).length,
      topReferrers: doctors.map(d => ({ doctorId: d._id, displayName: d.displayName, count: selected.filter(p => p.referringDoctorId === d._id).length })).filter(d => d.count).sort((a,b) => b.count - a.count),
    };
  });
  await db.collection('referral_stats').insertMany(stats);
  await db.collection('sync_jobs').insertOne({ type: 'full', status: 'complete', startedAt: now, completedAt: now, patientsProcessed: patients.length, patientsUpserted: patients.length, doctorsUpserted: doctors.length, lastSyncedAt: null, error: null, contactFailures: [] });
  // Publish only after all records are ready. Public endpoints require this marker.
  await db.collection('showcase_metadata').insertOne({ kind: 'synthetic-only-v1', createdAt: now });
  console.log(`Created ${name}: ${patients.length} fictional patients, ${doctors.length} doctors, ${stats.length} referral periods.`);
} catch (error) {
  // Do not print connection strings or database driver diagnostics containing credentials.
  console.error(error.message?.startsWith('Refusing') ? error.message : 'Showcase seed failed. Check MongoDB access and configuration.');
  process.exitCode = 1;
} finally { await client.close(); }
