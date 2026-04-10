import { getDb } from '@/lib/mongodb';
import { clinikoFetch } from '@/lib/cliniko';
import type { Patient, Doctor, ReferralStat, SyncJob, StatPeriod } from '@/lib/models';

const REQUEST_DELAY_MS = 50;

function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ── Cliniko API shapes ─────────────────────────────────────────────────────

interface ClinikoPatient {
  id: number;
  first_name?: string;
  last_name?: string;
  created_at?: string;
  updated_at?: string;
  referring_doctor?: { links?: { self?: string } };
}

interface ClinikioPatientsResponse {
  patients: ClinikoPatient[];
  total_entries: number;
  links: { next?: string };
}

interface ClinikoContact {
  id: number;
  first_name?: string;
  last_name?: string;
  company_name?: string;
}

// ── Helpers ────────────────────────────────────────────────────────────────

function extractContactId(url: string): string | null {
  const match = url.match(/\/contacts\/(\d+)/);
  return match ? match[1] : null;
}

function buildDisplayName(contact: ClinikoContact): string {
  const fullName = [contact.first_name, contact.last_name].filter(Boolean).join(' ');
  if (fullName && contact.company_name) return `${fullName} (${contact.company_name})`;
  if (fullName) return fullName;
  if (contact.company_name) return contact.company_name;
  return 'Unknown';
}

function daysAgo(n: number): Date {
  return new Date(Date.now() - n * 86400 * 1000);
}

function startOfThisYear(): Date {
  const d = new Date();
  return new Date(d.getFullYear(), 0, 1); // Jan 1st, 00:00:00
}

function startOfThisMonth(): Date {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), 1); // 1st of current month, 00:00:00
}

// ── Compute and store referral stats from existing MongoDB data ────────────

async function computeAndStoreStats(db: Awaited<ReturnType<typeof getDb>>) {
  const patientsCol = db.collection('patients');
  const statsCol = db.collection<ReferralStat>('referral_stats');

  const periods: { id: StatPeriod; cutoff: Date | null }[] = [
    { id: 'alltime', cutoff: null },
    { id: 'ytd',     cutoff: startOfThisYear() },
    { id: 'mtd',     cutoff: startOfThisMonth() },
    { id: '365d',    cutoff: daysAgo(365) },
    { id: '90d',     cutoff: daysAgo(90) },
    { id: '30d',     cutoff: daysAgo(30) },
    { id: '7d',      cutoff: daysAgo(7) },
  ];

  for (const { id, cutoff } of periods) {
    const matchStage: Record<string, unknown> = { isDeleted: false };
    if (cutoff) matchStage.clinikoCreatedAt = { $gte: cutoff };

    const [totals, referrers] = await Promise.all([
      // total patients + patients with referrer
      patientsCol.aggregate([
        { $match: matchStage },
        { $group: {
          _id: null,
          totalPatients: { $sum: 1 },
          patientsWithReferrer: { $sum: { $cond: [{ $ne: ['$referringDoctorId', null] }, 1, 0] } },
        }},
      ]).toArray(),

      // top 20 referrers with doctor name lookup
      patientsCol.aggregate([
        { $match: { ...matchStage, referringDoctorId: { $ne: null } } },
        { $group: { _id: '$referringDoctorId', count: { $sum: 1 } } },
        { $lookup: { from: 'doctors', localField: '_id', foreignField: '_id', as: 'doctor' } },
        // Exclude patients whose doctor was deleted from Cliniko (no matching doctor record)
        { $match: { doctor: { $not: { $size: 0 } } } },
        { $sort: { count: -1 } },
        { $limit: 20 },
        { $unwind: '$doctor' },
        { $project: { doctorId: '$_id', displayName: '$doctor.displayName', count: 1 } },
      ]).toArray(),
    ]);

    const stat: ReferralStat = {
      _id: id,
      computedAt: new Date(),
      totalPatients: totals[0]?.totalPatients ?? 0,
      patientsWithReferrer: totals[0]?.patientsWithReferrer ?? 0,
      topReferrers: referrers.map(r => ({
        doctorId: r.doctorId,
        displayName: r.displayName,
        count: r.count,
      })),
    };

    await statsCol.replaceOne({ _id: id }, stat, { upsert: true });
  }
}

// ── Main sync handler ──────────────────────────────────────────────────────

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const type = searchParams.get('type') === 'full' ? 'full' : 'incremental';

  const db = await getDb();
  const patientsCol = db.collection<Patient>('patients');
  const doctorsCol = db.collection<Doctor>('doctors');
  const syncJobsCol = db.collection<SyncJob>('sync_jobs');

  // Block concurrent syncs
  const alreadyRunning = await syncJobsCol.findOne({ status: 'running' });
  if (alreadyRunning) {
    return Response.json({ error: 'Sync already in progress' }, { status: 409 });
  }

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      // Safe send — if the client disconnects the controller closes;
      // we still want the sync to finish and MongoDB to be updated correctly.
      let streamClosed = false;
      const send = (data: object) => {
        if (streamClosed) return;
        try {
          controller.enqueue(encoder.encode('data: ' + JSON.stringify(data) + '\n\n'));
        } catch {
          streamClosed = true;
        }
      };

      // insertedId declared outside try so the catch block can reference it
      let insertedId: import('mongodb').ObjectId | null = null;

      try {
        // ── Create sync job record ───────────────────────────────────────
        const job: SyncJob = {
          type,
          status: 'running',
          startedAt: new Date(),
          completedAt: null,
          patientsProcessed: 0,
          patientsUpserted: 0,
          doctorsUpserted: 0,
          lastSyncedAt: null,
          error: null,
        };
        ({ insertedId } = await syncJobsCol.insertOne(job));

        // ── Determine incremental cutoff ─────────────────────────────────
        let updatedSince: Date | null = null;
        if (type === 'incremental') {
          const lastJob = await syncJobsCol.findOne(
            { status: 'complete' },
            { sort: { completedAt: -1 } }
          );
          updatedSince = lastJob?.completedAt ?? null;
        }

        // ── Phase 1: Fetch patients from Cliniko ─────────────────────────
        send({ phase: 'fetching', message: 'Fetching patients from Cliniko...', current: 0, total: 0 });

        const allPatients: ClinikoPatient[] = [];
        let page = 1;
        let hasMore = true;
        let totalEntries = 0;

        while (hasMore) {
          await sleep(REQUEST_DELAY_MS);
          let endpoint = `/patients?page=${page}&per_page=100`;
          if (updatedSince) endpoint += `&updated_since=${updatedSince.toISOString()}`;

          const data = (await clinikoFetch(endpoint)) as ClinikioPatientsResponse;
          allPatients.push(...data.patients);
          totalEntries = data.total_entries;

          send({ phase: 'fetching', message: 'Fetching patients from Cliniko...', current: allPatients.length, total: totalEntries });

          hasMore = !!data.links?.next;
          page++;
          if (page > 200) break;
        }

        // ── Phase 2: Upsert patients + doctors into MongoDB ──────────────
        send({ phase: 'processing', message: 'Saving to database...', current: 0, total: allPatients.length });

        const doctorCache = new Map<string, string>();
        let patientsUpserted = 0;
        let doctorsUpserted = 0;

        for (const p of allPatients) {
          let referringDoctorId: string | null = null;

          const doctorUrl = p.referring_doctor?.links?.self;
          if (doctorUrl) {
            const contactId = extractContactId(doctorUrl);
            if (contactId) {
              if (!doctorCache.has(contactId)) {
                // Check MongoDB before hitting Cliniko
                const existing = await doctorsCol.findOne({ _id: contactId });
                if (existing) {
                  doctorCache.set(contactId, existing.displayName);
                } else {
                  try {
                    await sleep(REQUEST_DELAY_MS);
                    const contact = (await clinikoFetch(`/contacts/${contactId}`)) as ClinikoContact;
                    const displayName = buildDisplayName(contact);

                    await doctorsCol.updateOne(
                      { _id: contactId },
                      { $set: { _id: contactId, firstName: contact.first_name ?? null, lastName: contact.last_name ?? null, companyName: contact.company_name ?? null, displayName, clinikoUrl: doctorUrl, syncedAt: new Date() } },
                      { upsert: true }
                    );

                    doctorCache.set(contactId, displayName);
                    doctorsUpserted++;
                  } catch {
                    console.error(`Failed to fetch contact ${contactId}`);
                  }
                }
              }
              referringDoctorId = contactId;
            }
          }

          await patientsCol.updateOne(
            { _id: String(p.id) },
            { $set: { _id: String(p.id), firstName: p.first_name ?? '', lastName: p.last_name ?? '', clinikoCreatedAt: p.created_at ? new Date(p.created_at) : new Date(), clinikoUpdatedAt: p.updated_at ? new Date(p.updated_at) : new Date(), referringDoctorId, syncedAt: new Date(), isDeleted: false } },
            { upsert: true }
          );

          patientsUpserted++;
          if (patientsUpserted % 100 === 0 || patientsUpserted === allPatients.length) {
            send({ phase: 'processing', message: 'Saving to database...', current: patientsUpserted, total: allPatients.length });
          }
        }

        // ── Phase 3: Compute and store referral stats ────────────────────
        send({ phase: 'computing', message: 'Computing referral statistics...' });
        await computeAndStoreStats(db);

        // ── Mark job complete ────────────────────────────────────────────
        await syncJobsCol.updateOne(
          { _id: insertedId },
          { $set: { status: 'complete', completedAt: new Date(), patientsProcessed: allPatients.length, patientsUpserted, doctorsUpserted, lastSyncedAt: updatedSince } }
        );

        send({ phase: 'complete', success: true, patientsProcessed: allPatients.length, patientsUpserted, doctorsUpserted });

      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        if (insertedId) {
          await syncJobsCol.updateOne(
            { _id: insertedId },
            { $set: { status: 'failed', completedAt: new Date(), error: message } }
          );
        }
        send({ phase: 'error', success: false, error: message });
      } finally {
        if (!streamClosed) controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    },
  });
}
