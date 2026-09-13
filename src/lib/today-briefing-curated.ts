import type { JudgedSummary } from './today-briefing';

// Hand-written example of what a genuine (not keyword-matched) summary looks like, read and
// judged directly against the real notes for this one real shift rather than computed by rules —
// still shipped as static/mock data, not a live model call. mockSummarize() below is the fallback
// for every other date, since this can't generalize without an actual model doing the reading.
//
// Kept deliberately short: admins can always pull up the full record in Cliniko, so each item is
// the headline action/advice only, not a restatement of everything on file. Routine health-fund
// reference lines (a lone "W/Bupa Ref: 00", "CRN 303328029Z", etc. — 5 of today's 30 patients had
// nothing else) are dropped entirely per instruction. Danielle Reddy is booked twice today but
// appears once, not twice.
//
// A patient only earns an entry if there's something to act on or be aware of today — an
// approved NDIS funding balance with a support-coordinator email (Raymond Wong, dropped) is pure
// reference info with nothing attached, no different in kind from a health-fund ref number.
//
// A patient never appears twice: a risky point is just a point marked `risk: true` inside that
// patient's one entry (highlighted, not duplicated into a separate section) — Danielle Reddy's
// mental-health flag lives alongside her other notes, and Rhiannan Lopez (who used to exist only
// in the now-removed patientsAtRisk list) is a normal patientNotes entry whose points happen to
// both be risk flags.
//
// Same bar applies to trends: an aggregate stat with no actual next step (e.g. "5 patients have
// nothing on file beyond a reference number — nothing to action") is noise, not a trend. Checked
// Cliniko's patient_forms for all 30 of today's attendees and cross-referenced patient creation
// dates for this one instead — real signal: 6 patients registered in the last 2 weeks (new), 2 of
// whom (David Hood, Maria Sardon) have a genuinely outstanding online Patient Consent Form. No
// separate "health form" shows up in the real data, so it isn't invented here.
export const CURATED_SUMMARIES: Record<string, JudgedSummary> = {
  '2026-09-15_73038': {
    patientNotes: [
      {
        patientName: 'Danielle Reddy',
        practitionerName: 'Jin Park / Joshua Lui',
        time: '9:00 AM',
        points: [
          { text: 'Dentist requested dry needling focus: temporalis + masseter, for her migraines.', risk: false },
          { text: 'Awaiting a repeat MRI — possible trigeminal neuralgia.', risk: false },
          { text: 'Booked with both Jin Park and Joshua Lui today.', risk: false },
          { text: 'WorkCover file notes a history of suicidal thoughts and panic disorder — check in sensitively, not just for the physical complaint.', risk: true },
        ],
      },
      {
        patientName: 'Hyeyeon Kim',
        practitionerName: 'Jin Park',
        time: '9:30 AM',
        points: [
          { text: 'Remind her to bring her Certificate of Capacity (COC).', risk: false },
          { text: 'Speaks Korean / basic English — allow extra time.', risk: false },
        ],
      },
      {
        patientName: 'Michael Pritchard',
        practitionerName: 'Joshua Lui',
        time: '12:00 PM',
        points: [{ text: "CC today's progress report to imogen.j@eml.com.au (WorkCover requirement).", risk: false }],
      },
      {
        patientName: 'Nicola Kim',
        practitionerName: 'Jin Park',
        time: '12:30 PM',
        points: [{ text: 'Health fund form still needs completing (ongoing knee issue).', risk: false }],
      },
      {
        patientName: 'Yinrui Deng',
        practitionerName: 'Matthew Matsuura',
        time: '2:00 PM',
        points: [
          { text: 'NDIS billing: swap practitioner code, invoice, then move the appointment back to Matthew.', risk: false },
          { text: 'Away from 15 Jan for about a month — speaks Mandarin.', risk: false },
        ],
      },
      {
        patientName: 'Zhi Yuan Zhang',
        practitionerName: 'Matthew Matsuura',
        time: '4:00 PM',
        points: [
          { text: 'Wants future appointments capped at 30 minutes.', risk: false },
          { text: 'Aged Care invoices now go to 2 recipients — old homecare@ address retired.', risk: false },
        ],
      },
      {
        patientName: 'Louisa Ho',
        practitionerName: 'Matthew Matsuura',
        time: '4:30 PM',
        points: [
          { text: 'Only available Wed/Fri (insurer-approved).', risk: false },
          { text: 'Pre-approval required before billing progress/case-conference notes.', risk: false },
        ],
      },
      {
        patientName: 'Rhiannan Lopez',
        practitionerName: 'Joshua Lui',
        time: '4:00 PM',
        points: [
          { text: 'No-showed last visit, uncontactable by phone.', risk: true },
          { text: 'EPC referral capped at 4 sessions — today is only #2.', risk: true },
        ],
      },
    ],
    trends: [
      "6 new patients today, David Hood and Maria Sardon still haven't completed their online Consent Form; have them fill it in when they arrive.",
    ],
  },
};
