import { getDb } from '@/lib/mongodb';
import { clinikoFetch } from '@/lib/cliniko';

export async function GET() {
  try {
    const db = await getDb();

    // Find all patients whose referringDoctorId does NOT exist in the doctors collection
    const unknownDoctorPatients = await db.collection('patients').aggregate([
      { $match: { referringDoctorId: { $ne: null }, isDeleted: false } },
      {
        $lookup: {
          from: 'doctors',
          localField: 'referringDoctorId',
          foreignField: '_id',
          as: 'doctorDoc',
        },
      },
      // Keep only patients where the lookup found nothing (missing doctor record)
      { $match: { doctorDoc: { $size: 0 } } },
      {
        $group: {
          _id: '$referringDoctorId',
          patientCount: { $sum: 1 },
          samplePatients: { $push: { id: '$_id', name: { $concat: ['$firstName', ' ', '$lastName'] } } },
        },
      },
      { $sort: { patientCount: -1 } },
      { $project: { contactId: '$_id', patientCount: 1, samplePatients: { $slice: ['$samplePatients', 3] } } },
    ]).toArray();

    if (unknownDoctorPatients.length === 0) {
      return Response.json({ message: 'No unknown doctors found — all contact IDs resolved correctly.' });
    }

    // For each unknown contact ID, try fetching it directly from Cliniko
    const results = await Promise.all(
      unknownDoctorPatients.map(async (entry) => {
        let clinikoData = null;
        let clinikoError = null;
        try {
          clinikoData = await clinikoFetch(`/contacts/${entry.contactId}`);
        } catch (e) {
          clinikoError = e instanceof Error ? e.message : 'Unknown error';
        }
        return {
          contactId: entry.contactId,
          patientCount: entry.patientCount,
          samplePatients: entry.samplePatients,
          clinikoContact: clinikoData,
          clinikoError,
        };
      })
    );

    return Response.json({ unknownDoctors: results });

  } catch (error) {
    return Response.json({
      error: error instanceof Error ? error.message : 'Unknown error',
    }, { status: 500 });
  }
}
