// The practices the dashboard can be switched between. Ids are Cliniko business ids (from the
// `businesses` collection); labels are how the dashboard — and the highlighted-patient data — name
// each one. Home Visit Services and Injury & Rehab aren't front-desk practices, so aren't offered.
// `postcode` places the clinic's marker on the patient map.
export const PRACTICES = [
  { id: "74938", label: "Hurstville", postcode: "2220" },
  { id: "73038", label: "CBD", postcode: "2000" },
] as const;

export const ALL_PRACTICES = "All practices";

export type PracticeChoice = (typeof PRACTICES)[number]["label"] | typeof ALL_PRACTICES;

export const PRACTICE_CHOICES: readonly PracticeChoice[] = [...PRACTICES.map((p) => p.label), ALL_PRACTICES];

// Remembers the last practice picked on this browser, so the dashboard reopens on it when the user
// isn't rostered anywhere today. A plain (non-httpOnly) cookie: the client writes it on switch and the
// server reads it to render the right practice on first paint, with no flash of "All practices".
export const PRACTICE_COOKIE = "shp_practice";

export function isPracticeChoice(value: unknown): value is PracticeChoice {
  return PRACTICE_CHOICES.includes(value as PracticeChoice);
}

export function businessIdFor(choice: PracticeChoice): string | null {
  return PRACTICES.find((p) => p.label === choice)?.id ?? null;
}

export function practiceForBusinessId(businessId: string | null | undefined): PracticeChoice | null {
  return PRACTICES.find((p) => p.id === businessId)?.label ?? null;
}
