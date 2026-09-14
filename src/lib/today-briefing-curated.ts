import type { JudgedSummary, ReceptionNote, TodayBriefing } from './today-briefing';
import { practiceDay } from './date-range';

// Hand-written examples of what a genuine (not keyword-matched) summary looks like, each read and
// judged directly against the real notes for one real CBD shift rather than computed by rules —
// still shipped as static data, not a live model call. mockSummarize() in today-briefing.ts is the
// fallback for every other date, since this can't generalize without an actual model doing the reading.
//
// The same bar applies to every entry:
// - Kept deliberately short: admins can always pull up the full record in Cliniko, so each item is the
//   headline action/advice only, not a restatement of everything on file.
// - Routine health-fund reference lines (a lone "W/Bupa Ref: 00", "CRN 303328029Z", etc.) are dropped
//   entirely, as is pure reference info with nothing attached (an approved NDIS balance plus a
//   support-coordinator email).
// - A patient never appears twice: booked twice in a day is one entry, and a risky point is just a point
//   marked `risk: true` inside that patient's one entry (highlighted, not duplicated elsewhere).
// - A trend needs an actual next step — an aggregate stat with nothing to do about it is noise.
// - Surnames are masked to "P" and practitioners to a last initial, as everywhere else in the fixtures.
//
// 2026-09-15 (Tue): 30 attendees. Checked Cliniko's patient_forms and patient creation dates — 6
// patients registered in the last 2 weeks, 2 of whom (David Hood, Maria Sardon) had a genuinely
// outstanding online Patient Consent Form. No separate "health form" shows up in the real data, so it
// isn't invented here.
//
// 2026-09-16 (Wed): 20 appointments for 19 patients (Prakash Krishnan is booked back to back). Nine
// patients earn an entry; the rest have nothing beyond a health-fund reference, or a blank WorkCover/CTP
// template (Ezra Otuk, Ruihua Krcelj — the same kind of line David Hood's blank template was dropped for).
// Two readings go beyond restating a note: Peta Walker's billing instructions still say to claim massage
// under 506, but her physio limit for 2026 is reached, so that claim would be rejected; and Hector
// Chunga's health-fund waiting period ended on 2 Sep, so he can claim again. patient_forms: all 4 patients
// registered in the last 2 weeks (Eric Baer, Giuseppe Ciulla, Jacob Tan, Tina Gong) lack a completed
// consent form — Eric's and Jacob's online forms are still open, and Giuseppe and Tina were never sent one.
export const CURATED_SUMMARIES: Record<string, JudgedSummary> = {
  "2026-09-15_73038": {
    patientNotes: [
      {
        patientName: "Danielle P",
        practitionerName: "Jin P / Joshua L",
        time: "9:00 AM",
        points: [
          {
            text: "Dentist requested dry needling focus: temporalis + masseter, for her migraines.",
            risk: false,
          },
          {
            text: "Awaiting a repeat MRI — possible trigeminal neuralgia.",
            risk: false,
          },
          {
            text: "Booked with both Jin Park and Joshua Lui today.",
            risk: false,
          },
          {
            text: "WorkCover file notes a history of suicidal thoughts and panic disorder — check in sensitively, not just for the physical complaint.",
            risk: true,
          },
        ],
      },
      {
        patientName: "Hyeyeon P",
        practitionerName: "Jin P",
        time: "9:30 AM",
        points: [
          {
            text: "Remind her to bring her Certificate of Capacity (COC).",
            risk: false,
          },
          {
            text: "Speaks Korean / basic English — allow extra time.",
            risk: false,
          },
        ],
      },
      {
        patientName: "Michael P",
        practitionerName: "Joshua L",
        time: "12:00 PM",
        points: [
          {
            text: "CC today's progress report to imogen.j@eml.com.au (WorkCover requirement).",
            risk: false,
          },
        ],
      },
      {
        patientName: "Nicola P",
        practitionerName: "Jin P",
        time: "12:30 PM",
        points: [
          {
            text: "Health fund form still needs completing (ongoing knee issue).",
            risk: false,
          },
        ],
      },
      {
        patientName: "Yinrui P",
        practitionerName: "Matthew M",
        time: "2:00 PM",
        points: [
          {
            text: "NDIS billing: swap practitioner code, invoice, then move the appointment back to Matthew.",
            risk: false,
          },
          {
            text: "Away from 15 Jan for about a month — speaks Mandarin.",
            risk: false,
          },
        ],
      },
      {
        patientName: "Zhi Yuan P",
        practitionerName: "Matthew M",
        time: "4:00 PM",
        points: [
          {
            text: "Wants future appointments capped at 30 minutes.",
            risk: false,
          },
          {
            text: "Aged Care invoices now go to 2 recipients — old homecare@ address retired.",
            risk: false,
          },
        ],
      },
      {
        patientName: "Louisa P",
        practitionerName: "Matthew M",
        time: "4:30 PM",
        points: [
          { text: "Only available Wed/Fri (insurer-approved).", risk: false },
          {
            text: "Pre-approval required before billing progress/case-conference notes.",
            risk: false,
          },
        ],
      },
      {
        patientName: "Rhiannan P",
        practitionerName: "Joshua L",
        time: "4:00 PM",
        points: [
          { text: "No-showed last visit, uncontactable by phone.", risk: true },
          {
            text: "EPC referral capped at 4 sessions — today is only #2.",
            risk: true,
          },
        ],
      },
    ],
    trends: [
      "6 new patients today, David and Maria still haven't completed their online Consent Form; have them fill it in when they arrive.",
    ],
  },
  "2026-09-16_73038": {
    patientNotes: [
      {
        patientName: "Hironori P",
        practitionerName: "Matthew M",
        time: "9:00 AM",
        points: [
          {
            text: "Hair Planet staff — apply the 5% discount; usually pays in cash.",
            risk: false,
          },
        ],
      },
      {
        patientName: "Prakash P",
        practitionerName: "Jin P / Matthew M",
        time: "11:00 AM",
        points: [
          {
            text: "Back to back: physio with Jin at 11:00, then a 55-min massage with Matthew at 11:30.",
            risk: false,
          },
          {
            text: "Told about the new massage price on 8 Sep — bill the 55-min massage as item 105.",
            risk: false,
          },
          {
            text: "Email him his invoices rather than printing them.",
            risk: false,
          },
        ],
      },
      {
        patientName: "Giuseppe P",
        practitionerName: "Matthew M",
        time: "11:00 AM",
        points: [
          {
            text: "New patient — needs to fill in a consent form on arrival; none has been sent to him in Cliniko.",
            risk: false,
          },
        ],
      },
      {
        patientName: "Yumi P",
        practitionerName: "Matthew M",
        time: "2:00 PM",
        points: [
          {
            text: "Massage can be claimed under code 506 (NIB).",
            risk: false,
          },
          {
            text: "When rebooking, keep her at 2 PM — never in Matthew's lunch break.",
            risk: false,
          },
        ],
      },
      {
        patientName: "David P",
        practitionerName: "Jin P",
        time: "2:00 PM",
        points: [
          {
            text: "Stockland staff — apply the 5% discount (until Peter says to stop).",
            risk: false,
          },
        ],
      },
      {
        patientName: "Hector P",
        practitionerName: "Max M",
        time: "2:30 PM",
        points: [
          {
            text: "AHM waiting period ended 2 Sep — he should be able to claim again today.",
            risk: false,
          },
          {
            text: "Notes still say he was moving to Hobart (Feb 2025) — confirm his contact details are current.",
            risk: false,
          },
          {
            text: "Screening form marked \"must complete before session\" has been outstanding since 2020.",
            risk: false,
          },
        ],
      },
      {
        patientName: "Tina P",
        practitionerName: "Jin P",
        time: "3:00 PM",
        points: [
          {
            text: "New patient — speaks Mandarin / basic English, allow extra time.",
            risk: false,
          },
        ],
      },
      {
        patientName: "Peta P",
        practitionerName: "Matthew M",
        time: "4:00 PM",
        points: [
          {
            text: "Physio limit for 2026 is reached — the usual 506 massage claim will be rejected, so let her know there's no rebate before the session.",
            risk: false,
          },
          {
            text: "Stockland staff — apply the 5% discount.",
            risk: false,
          },
        ],
      },
      {
        patientName: "Hiroko P",
        practitionerName: "Matthew M",
        time: "5:00 PM",
        points: [
          {
            text: "ZIM member — apply the 5% discount.",
            risk: false,
          },
        ],
      },
      {
        patientName: "Garry P",
        practitionerName: "Jin P",
        time: "5:30 PM",
        points: [
          {
            text: "Bupa limit reached for 2026 — he's paying out of pocket, so don't claim.",
            risk: false,
          },
        ],
      },
    ],
    trends: [
      "4 new patients tomorrow and none has completed a Consent Form — Eric and Jacob's online forms are still open, and Giuseppe and Tina were never sent one; have all four fill it in when they arrive.",
    ],
  },
};

// ── The admin login's stored briefing ─────────────────────────────────────────
//
// The admin login always sees these two shifts — today's briefing and the next-shift preview — rather
// than a briefing computed from live data (see the today-briefing route); every other login stays on the
// live path until a real AI call replaces it. The Messages/To-dos were captured from the same shifts'
// reception-desk bookings, with the patient's surname masked the same way (16 Sep had none).

interface FixtureDay {
  date: string;
  businessId: string;
  businessName: string;
  receptionNotes: ReceptionNote[];
}

const CBD_NAME = 'Sydney Health Physiotherapy - Sydney CBD';

const FIXTURE_TODAY: FixtureDay = {
  date: '2026-09-15',
  businessId: '73038',
  businessName: CBD_NAME,
  receptionNotes: [
    {
      time: '12:00 pm',
      kind: 'To Do',
      text: 'Ask Raymond P if he would like to book in 18th of Nov because Matthew is away 19th Nov, currently 11:30/12 is reserved',
    },
  ],
};

const FIXTURE_NEXT_SHIFT: FixtureDay = {
  date: '2026-09-16',
  businessId: '73038',
  businessName: CBD_NAME,
  receptionNotes: [],
};

function shiftDay(day: string, days: number): string {
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

// Re-dated so the stored shift reads as today's and the preview keeps its real distance after it (one
// day) — the content is what's fixed, not the calendar date it was captured on.
export function fixtureBriefing(now = new Date()): TodayBriefing {
  const today = practiceDay(now);
  const gapDays = Math.round((Date.parse(FIXTURE_NEXT_SHIFT.date) - Date.parse(FIXTURE_TODAY.date)) / 86_400_000);
  const day = (fixture: FixtureDay, date: string) => ({
    date,
    businessName: fixture.businessName,
    entries: [],
    summary: { ...CURATED_SUMMARIES[`${fixture.date}_${fixture.businessId}`], receptionNotes: fixture.receptionNotes },
    mocked: true as const,
  });
  return { status: 'ok', ...day(FIXTURE_TODAY, today), nextShift: day(FIXTURE_NEXT_SHIFT, shiftDay(today, gapDays)) };
}
