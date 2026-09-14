// Human-facing name for a login's username. Usernames today are just role placeholders
// ('admin'/'owner'/'physio' — see auth.ts), so this is the one place that maps a login to how
// it's actually shown: the dashboard greeting, and each task/message's "From ..." attribution.
// Kept free of server-only imports (unlike auth.ts) so client components can use it too.
const DISPLAY_NAMES: Record<string, string> = {
  admin: 'Charlene',
};

export function displayName(username: string): string {
  return DISPLAY_NAMES[username] ?? username;
}

const DOCTOR_PSEUDONYMS = ['Alex', 'Jordan', 'Taylor', 'Morgan', 'Casey', 'Riley', 'Avery', 'Jamie'];

// Replaces the whole personal name with a stable pseudonym while preserving an optional practice
// suffix. Stability matters because the same doctor should still look like the same person across
// panels, without clinic + real given name making them identifiable.
export function maskedDoctorName(value: string): string {
  if (!value || value === 'Not recorded') return value;
  const match = value.match(/^(.*?)\s*(\([^)]*\))\s*$/);
  const name = (match ? match[1] : value).trim();
  const practice = match?.[2] ?? '';
  let hash = 0;
  for (const character of name.toLowerCase()) hash = (hash * 31 + character.charCodeAt(0)) >>> 0;
  const pseudonym = DOCTOR_PSEUDONYMS[hash % DOCTOR_PSEUDONYMS.length];
  return `Dr ${pseudonym} Doc${practice ? ` ${practice}` : ''}`;
}

// Which receptionists._id a login corresponds to, for features scoped to "the practice I'm in
// today" (e.g. the today briefing). Only logins tied to an actual receptionist record resolve.
const RECEPTIONIST_IDS: Record<string, string> = {
  admin: 'receptionist-tracey',
};

export function receptionistIdFor(username: string): string | null {
  return RECEPTIONIST_IDS[username] ?? null;
}
