import { MongoClient, Db } from 'mongodb';

const uri = process.env.MONGODB_URI!;

if (!uri) {
  throw new Error('MONGODB_URI environment variable is not set');
}

declare global {
  var _mongoClient: MongoClient | undefined;
}

let client: MongoClient;

if (process.env.NODE_ENV === 'development') {
  // In development, reuse the client across hot reloads to avoid
  // exhausting the MongoDB connection limit
  if (!global._mongoClient) {
    global._mongoClient = new MongoClient(uri);
  }
  client = global._mongoClient;
} else {
  client = new MongoClient(uri);
}

// Indexes the dashboard's date-range queries rely on. createIndex is a no-op for an index that already
// exists, so this only costs a round trip per collection once per server process. A failure is logged
// rather than thrown: every query still returns the right answer without them, just more slowly.
async function ensureIndexes(db: Db) {
  await Promise.all([
    db.collection('daily_stats').createIndex({ metric: 1, date: 1 }),
    db.collection('visits').createIndex({ date: 1 }),
    db.collection('visits').createIndex({ patientId: 1 }),
    db.collection('appointments').createIndex({ startsAt: 1 }),
    // The briefing looks up a single day's attendees by appointment; without this, that's a full scan.
    db.collection('attendees').createIndex({ appointmentId: 1 }),
    db.collection('patients').createIndex({ clinikoCreatedAt: 1 }),
  ]);
}

let indexesReady: Promise<void> | null = null;

export async function getDb(): Promise<Db> {
  await client.connect();
  const db = client.db();
  indexesReady ??= ensureIndexes(db).catch((error) => {
    console.error('Failed to ensure MongoDB indexes', error);
  });
  await indexesReady;
  return db;
}
