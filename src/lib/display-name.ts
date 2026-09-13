// Human-facing name for a login's username. Usernames today are just role placeholders
// ('admin'/'owner'/'physio' — see auth.ts), so this is the one place that maps a login to how
// it's actually shown: the dashboard greeting, and each task/message's "From ..." attribution.
// Kept free of server-only imports (unlike auth.ts) so client components can use it too.
const DISPLAY_NAMES: Record<string, string> = {
  admin: 'Tracey',
};

export function displayName(username: string): string {
  return DISPLAY_NAMES[username] ?? username;
}

// Which receptionists._id a login corresponds to, for features scoped to "the practice I'm in
// today" (e.g. the today briefing). Only logins tied to an actual receptionist record resolve.
const RECEPTIONIST_IDS: Record<string, string> = {
  admin: 'receptionist-tracey',
};

export function receptionistIdFor(username: string): string | null {
  return RECEPTIONIST_IDS[username] ?? null;
}
