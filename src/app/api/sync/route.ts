import { syncAppointments, syncClinicalOthers } from '@/lib/sync-clinical';
import { rebuildReferralSourceDailyStats, rebuildVisits } from '@/lib/patient-mix';
import { rebuildReferralDailyStats } from '@/lib/referrals';
import { computeAndStoreAttendance } from '@/lib/attendance-stats';
import { getDb } from '@/lib/mongodb';
import { getSession, isCronRequest } from '@/lib/auth';
import { clinikoFetch } from '@/lib/cliniko';
import type { Patient, Doctor, ReferralStat, SyncJob, SyncScope, StatPeriod, ContactFailure } from '@/lib/models';
import type { Db } from 'mongodb';

const REQUEST_DELAY_MS = 50;
const SCOPES: SyncScope[] = ['patients', 'appointments', 'clinical'];

function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ── Cliniko API shapes ─────────────────────────────────────────────────────

interface ClinikoPhoneNumber {
  number?: string;
  normalized_number?: string;
  phone_type?: string;
}

interface ClinikoPatient {
  id: number;
  first_name?: string;
  last_name?: string;
  created_at?: string;
  updated_at?: string;
  referring_doctor?: { links?: { self?: string } };
  state?: string;
  post_code?: string;
  country?: string;
  email?: string;
  patient_phone_numbers?: ClinikoPhoneNumber[];
  appointment_notes?: string;
  referral_source?: string;
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

function pickPhone(numbers?: ClinikoPhoneNumber[]): string | null {
  if (!numbers?.length) return null;
  const preferred = numbers.find(n => n.phone_type === 'Mobile') ?? numbers[0];
  return preferred.number ?? preferred.normalized_number ?? null;
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

function emptyJobCounts() {
  return { patientsProcessed: 0, patientsUpserted: 0, doctorsUpserted: 0, appointmentsUpserted: 0, attendeesUpserted: 0, patientCasesUpserted: 0 };
}

// ── Compute and store referral stats from existing MongoDB data ────────────

async function computeAndStoreStats(db: Db) {
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

// ── Patients scope ──────────────────────────────────────────────────────────

async function runPatientsSync(db: Db, send: (data: object) => void, since: Date | null) {
  const patientsCol = db.collection<Patient>('patients');
  const doctorsCol = db.collection<Doctor>('doctors');
  const contactFailures: ContactFailure[] = [];
  const failedContacts = new Set<string>();

  send({ phase: 'fetching', message: 'Fetching patients from Cliniko...', current: 0, total: 0 });

  const allPatients: ClinikoPatient[] = [];
  let page = 1;
  let hasMore = true;
  let totalEntries = 0;

  while (hasMore) {
    await sleep(REQUEST_DELAY_MS);
    let endpoint = `/patients?page=${page}&per_page=100`;
    if (since) endpoint += `&updated_since=${since.toISOString()}`;

    const data = (await clinikoFetch(endpoint)) as ClinikioPatientsResponse;
    allPatients.push(...data.patients);
    totalEntries = data.total_entries;

    send({ phase: 'fetching', message: 'Fetching patients from Cliniko...', current: allPatients.length, total: totalEntries });

    hasMore = !!data.links?.next;
    page++;
    if (page > 200) break;
  }

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
        if (!doctorCache.has(contactId) && !failedContacts.has(contactId)) {
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
            } catch (error) {
              const detail = error instanceof Error ? error.message : '';
              const status = detail.match(/Cliniko API error (\d{3})/)?.[1];
              const message = status
                ? `Cliniko returned HTTP ${status}. Check contact availability and API access.`
                : 'Contact could not be fetched or saved. Check the connection and retry the sync.';
              const failure = { contactId, message };
              failedContacts.add(contactId);
              contactFailures.push(failure);
              console.error(`Failed to fetch/save contact ${contactId}: ${message}`);
              send({ phase: 'warning', ...failure });
            }
          }
        }
        referringDoctorId = contactId;
      }
    }

    await patientsCol.updateOne(
      { _id: String(p.id) },
      { $set: {
        _id: String(p.id), firstName: p.first_name ?? '', lastName: p.last_name ?? '',
        clinikoCreatedAt: p.created_at ? new Date(p.created_at) : new Date(),
        clinikoUpdatedAt: p.updated_at ? new Date(p.updated_at) : new Date(),
        referringDoctorId, syncedAt: new Date(), isDeleted: false,
        state: p.state ?? null, postCode: p.post_code ?? null, country: p.country ?? null,
        email: p.email ?? null, phone: pickPhone(p.patient_phone_numbers), appointmentNotes: p.appointment_notes ?? null,
        referralSource: p.referral_source ?? null,
      } },
      { upsert: true }
    );

    patientsUpserted++;
    if (patientsUpserted % 100 === 0 || patientsUpserted === allPatients.length) {
      send({ phase: 'processing', message: 'Saving to database...', current: patientsUpserted, total: allPatients.length });
    }
  }

  send({ phase: 'computing', message: 'Computing referral statistics...' });
  await computeAndStoreStats(db);

  return { patientsProcessed: allPatients.length, patientsUpserted, doctorsUpserted, contactFailures };
}

// ── Scoped job runner ────────────────────────────────────────────────────────

async function runScope(db: Db, send: (data: object) => void, scope: SyncScope, type: 'full' | 'incremental') {
  const syncJobsCol = db.collection<SyncJob>('sync_jobs');

  const alreadyRunning = await syncJobsCol.findOne({ status: 'running', scope });
  if (alreadyRunning) {
    send({ phase: 'warning', message: `${scope} sync is already in progress — skipping.` });
    return;
  }

  let since: Date | null = null;
  if (type === 'incremental') {
    const lastJob = await syncJobsCol.findOne({ status: 'complete', scope }, { sort: { completedAt: -1 } });
    since = lastJob?.completedAt ?? null;
  }

  const job: SyncJob = { scope, type, status: 'running', startedAt: new Date(), completedAt: null, lastSyncedAt: null, error: null, ...emptyJobCounts() };
  const { insertedId } = await syncJobsCol.insertOne(job);

  try {
    let counts: Partial<ReturnType<typeof emptyJobCounts>> & { contactFailures?: ContactFailure[] } = {};
    if (scope === 'patients') counts = await runPatientsSync(db, send, since);
    else if (scope === 'appointments') counts = await syncAppointments(db, send, since);
    else counts = await syncClinicalOthers(db, send, since);

    // The date-range collections are rebuilt from whatever this scope just changed, so dashboard
    // requests only ever run indexed range queries: patients feed the daily referral rollups, while
    // bookings, attendees and appointment types (split across the other two scopes) feed `visits`.
    send({ phase: 'computing', message: 'Computing patient mix and attendance stats...' });
    if (scope === 'patients') {
      await rebuildReferralDailyStats(db);
      await rebuildReferralSourceDailyStats(db);
    } else {
      await rebuildVisits(db);
    }
    await computeAndStoreAttendance(db);

    await syncJobsCol.updateOne(
      { _id: insertedId },
      { $set: { status: 'complete', completedAt: new Date(), lastSyncedAt: since, ...emptyJobCounts(), ...counts } }
    );
    send({ phase: 'scope_complete', scope, ...counts });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    await syncJobsCol.updateOne({ _id: insertedId }, { $set: { status: 'failed', completedAt: new Date(), error: message } });
    send({ phase: 'error', scope, error: message });
    throw error;
  }
}

// ── Main sync handler ──────────────────────────────────────────────────────

export async function GET(request: Request) {
  if (!isCronRequest(request) && !(await getSession())) {
    return Response.json({ error: 'Authentication required' }, { status: 401 });
  }
  const { searchParams } = new URL(request.url);
  const type = searchParams.get('type') === 'full' ? 'full' : 'incremental';
  const scopeParam = searchParams.get('scope');
  const scopes: SyncScope[] = scopeParam && (SCOPES as string[]).includes(scopeParam) ? [scopeParam as SyncScope] : SCOPES;

  const db = await getDb();
  const syncJobsCol = db.collection<SyncJob>('sync_jobs');

  const runningAny = await syncJobsCol.findOne({ status: 'running', scope: { $in: scopes } });
  if (runningAny) {
    return Response.json({ error: `Sync already in progress for scope "${runningAny.scope}"` }, { status: 409 });
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

      let anyFailed = false;
      for (const scope of scopes) {
        try {
          await runScope(db, send, scope, type);
        } catch {
          anyFailed = true; // already reported via 'error' event; keep going to the next scope
        }
      }

      send({ phase: 'complete', success: !anyFailed, scopes });
      if (!streamClosed) controller.close();
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
