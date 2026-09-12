import { MongoClient } from 'mongodb';

let client: MongoClient | undefined;

export async function getShowcaseDb() {
  const uri = process.env.SHOWCASE_MONGODB_URI || process.env.MONGODB_URI;
  const name = process.env.SHOWCASE_DB_NAME;
  if (!uri || !name || !name.startsWith('shp_showcase')) {
    throw new Error('Showcase database is not configured');
  }
  // Never use the production database, even if configuration is accidentally copied.
  const liveUri = process.env.MONGODB_URI;
  if (liveUri && new MongoClient(liveUri).db().databaseName === name) {
    throw new Error('Showcase must use a separate database name');
  }
  client ??= new MongoClient(uri, { serverSelectionTimeoutMS: 10000 });
  await client.connect();
  const db = client.db(name);
  const marker = await db.collection('showcase_metadata').findOne({ kind: 'synthetic-only-v1' });
  if (!marker) throw new Error('Showcase has not been seeded');
  return db;
}
