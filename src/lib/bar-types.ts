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
 *
 * ⛔ TWO SETS OF BARS, ONE PER UNIT (2026-09-16, Stage 4 session 4). A metric account's bar is a
 * kilogram bar — 20 kg is not 45 lb (it is 44.09) — so it gets its own keys, and the pricer still
 * reads pounds for every key: `barWeightForType` converts a kilogram bar by the definition constant.
 * The logger lists the bars of the exercise's unit and prints `load` with that unit.
 */
export type BarType = {
  /** POUNDS, for the load pricer (`_shared/workload.ts`). Every stored figure in this app is lb. */
  weight: number;
  /** What the athlete reads, in `unit`. */
  load: number;
  unit: 'lb' | 'kg';
  name: string;
};

/**
 * Pounds in a kilogram, by definition (1 lb = 0.45359237 kg exactly, NIST). Not a chosen number.
 * ⛔ DEFINED HERE because this file imports nothing: the phone's write-side conversion and the kilogram
 * bars below both need it, and `_shared/strength/session-volume.ts` (which re-exports it for the server)
 * imports `workload.ts`, which imports this table — defining it there made a cycle.
 */
export const KG_PER_LB = 0.45359237;
// FIELD — definition (1 lb = 0.45359237 kg, international pound)

const lbBar = (weight: number, name: string): BarType => ({ weight, load: weight, unit: 'lb', name });
const kgBar = (load: number, name: string): BarType => ({ weight: load / KG_PER_LB, load, unit: 'kg', name });

export const BAR_TYPES: Record<string, BarType> = {
  // 45 lb: the Olympic bar, "20 kg or 45 lbs" — Strong Help Center, "About Plate Calculator",
  // https://help.strongapp.io/article/169-plate-calculator (read 2026-09-16). The other seven: no source, kept as found.
  'standard': lbBar(45, 'Barbell (45lb)'),
  'womens': lbBar(33, 'Light (33lb)'),
  'safety': lbBar(45, 'Safety Squat (45lb)'),
  'ez': lbBar(25, 'EZ Curl (25lb)'),
  'trap': lbBar(60, 'Trap/Hex (60lb)'),
  'cambered': lbBar(55, 'Cambered (55lb)'),
  'swiss': lbBar(35, 'Swiss/Football (35lb)'),
  'technique': lbBar(15, 'Technique (15lb)'),
  // 20 kg and 15 kg: IWF Technical & Competition Rules & Regulations 2020, barbell — "20kg (men's) bar
  // weighs twenty (20.00) kg, and a 15kg (women's) bar weighs fifteen (15.00)kg"
  // (https://iwf.sport/wp-content/uploads/downloads/2020/01/IWF_TCRR_2020.pdf); 20 kg is also Strong's default (above).
  'standard_kg': kgBar(20, 'Barbell (20kg)'),
  'womens_kg': kgBar(15, 'Light (15kg)'),
  // OURS — the six specialty bars in kilograms are the imperial table's figures above in whole kilograms
  // (45 lb → 20, 25 → 11, 60 → 27, 55 → 25, 35 → 16, 15 → 7); no kilogram source was found and the pound
  // figures themselves carry none. Ledger row in docs/STATE-SOURCES.md.
  'safety_kg': kgBar(20, 'Safety Squat (20kg)'),
  'ez_kg': kgBar(11, 'EZ Curl (11kg)'),
  'trap_kg': kgBar(27, 'Trap/Hex (27kg)'),
  'cambered_kg': kgBar(25, 'Cambered (25kg)'),
  'swiss_kg': kgBar(16, 'Swiss/Football (16kg)'),
  'technique_kg': kgBar(7, 'Technique (7kg)'),
};

/** The standard Olympic bar — the app's own default, and Strong's and Hevy's. */
export const DEFAULT_BAR_LB = BAR_TYPES.standard.weight;

/** The bars the logger offers for an exercise in `unit`, in table order; the first is the default. */
export function barKeysForUnit(unit: 'lb' | 'kg'): string[] {
  return Object.keys(BAR_TYPES).filter((k) => BAR_TYPES[k].unit === unit);
}

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
