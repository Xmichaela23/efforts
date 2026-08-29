/**
 * ⛔ THE BARS — one table, read by the plate calculator and by the load pricer (2026-08-29).
 *
 * Michael: *"we actually see the bar weight that people use so it shouldn't default to 45. We have
 * all that data, people can choose different bar weights."* He is right: the logger has offered this
 * choice since it shipped and stores it on the set (`StrengthSet.barType`), and the first cut of the
 * blank-weight rule priced every barbell movement at 45 anyway — inventing 20 lb on an EZ curl and
 * losing 15 on a trap bar.
 *
 * ⚠️ THIS TABLE WAS INSIDE `StrengthLogger.tsx` and is moved here whole, values unchanged, because a
 * second copy on the server is how the plate calculator and the volume number come to disagree about
 * the same bar.
 * ⚠️ POUNDS. Every bar figure in this app is lb; the logger converts for display, never for storage.
 */
export type BarType = {
  weight: number;
  name: string;
};

export const BAR_TYPES: Record<string, BarType> = {
  'standard': { weight: 45, name: 'Barbell (45lb)' },
  'womens': { weight: 33, name: 'Light (33lb)' },
  'safety': { weight: 45, name: 'Safety Squat (45lb)' },
  'ez': { weight: 25, name: 'EZ Curl (25lb)' },
  'trap': { weight: 60, name: 'Trap/Hex (60lb)' },
  'cambered': { weight: 55, name: 'Cambered (55lb)' },
  'swiss': { weight: 35, name: 'Swiss/Football (35lb)' },
  'technique': { weight: 15, name: 'Technique (15lb)' },
};

/** The standard Olympic bar — the app's own default, and Strong's and Hevy's. */
export const DEFAULT_BAR_LB = BAR_TYPES.standard.weight;

/**
 * ⛔ WHAT THE ATHLETE SAID THEY LIFTED, OR NULL. Null means the set never named a bar — the CALLER
 * decides what that is worth, because "no bar recorded on a barbell lift" and "this movement has no
 * bar" are different facts and only the caller knows which it is holding.
 */
export function barWeightForType(barType: string | null | undefined): number | null {
  const key = String(barType ?? '').trim().toLowerCase();
  if (!key) return null;
  const bar = BAR_TYPES[key];
  return bar ? bar.weight : null;
}
