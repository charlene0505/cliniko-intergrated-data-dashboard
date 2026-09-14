import { cookies } from 'next/headers';
import { getDb } from './mongodb';
import { resolveShiftsForDate } from './reception';
import { receptionistIdFor } from './display-name';
import { practiceDay } from './date-range';
import { ALL_PRACTICES, PRACTICE_COOKIE, isPracticeChoice, practiceForBusinessId, type PracticeChoice } from './practices';

// The practice the dashboard opens on: wherever this login is rostered today, otherwise the last
// practice picked on this browser, otherwise all practices.
export async function defaultPracticeFor(username: string | null, now = new Date()): Promise<PracticeChoice> {
  const receptionistId = username ? receptionistIdFor(username) : null;
  if (receptionistId) {
    try {
      const shifts = await resolveShiftsForDate(await getDb(), practiceDay(now));
      const rostered = practiceForBusinessId(shifts.find((s) => s.receptionistId === receptionistId)?.businessId);
      if (rostered) return rostered;
    } catch {
      // The roster only picks a sensible default here — if it can't be read, use the last-used practice.
    }
  }

  const raw = (await cookies()).get(PRACTICE_COOKIE)?.value;
  let lastUsed = raw;
  try {
    lastUsed = raw && decodeURIComponent(raw);
  } catch {
    // Malformed cookie: treated as unset below.
  }
  return isPracticeChoice(lastUsed) ? lastUsed : ALL_PRACTICES;
}
