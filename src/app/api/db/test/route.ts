import { getDb } from '@/lib/mongodb';

export async function GET() {
  try {
    const db = await getDb();

    // Ping the database to confirm connection
    await db.command({ ping: 1 });

    const dbName = db.databaseName;
    const collections = await db.listCollections().toArray();

    return Response.json({
      success: true,
      database: dbName,
      collections: collections.map(c => c.name),
      message: collections.length === 0
        ? 'Connected successfully. No collections yet — they will be created on first sync.'
        : `Connected successfully.`,
    });
  } catch (error) {
    return Response.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    }, { status: 500 });
  }
}
