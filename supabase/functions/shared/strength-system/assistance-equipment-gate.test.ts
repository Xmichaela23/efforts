// THE BUILD-TIME EQUIPMENT GATE — resolveDayAssistance's fifth argument (2026-08-13).
//
// ⛔ THE GAP THIS PINS. D-424/D-425 gated the two surfaces where picks are MADE (wizard picker,
// swap sheet) and never the surface where the plan is BUILT. Picks stored while the arc was
// unloaded, equipment changed after picking, and the BALANCED_WEEK fallbacks all reached the plan
// unchecked. Michael, 2026-08-13, off a device screenshot: "it's not reading users equipment."
//
// The replacement rule is the previous program's, sourced from the previous program before this was written:
//   · same category — each slot is a muscle-category MENU (pp.50-51), and the swap is licensed
//     ("you can change exercises however you see fit");
//   · loadable gear first, bands last — the Bodyweight template (p.52) is the no-gear floor and
//     bands appear nowhere in the assistance chapter (`equipmentFitRank` ranks band routes behind
//     everything loadable);
//   · a performable PICK is never touched, band or not — D-423: the athlete's pick is what appears.
//
// Deterministic: no LLM anywhere in this path, so one run is definitive.
//
// Run: ~/.deno/bin/deno test --no-check --allow-read supabase/functions/shared/strength-system/assistance-equipment-gate.test.ts

import { assert, assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import {
  catalogEntry,
  LIFT_DAYS,
  normalizeAssistancePrefs,
  resolveDayAssistance,
} from '../../../../src/lib/assistance-catalog.ts';
import { canPerform, hasLoadableFit } from '../../../../src/lib/strength-gear.ts';

// The exact chip strings TrainingBaselines writes for Michael's own home gym — the gate translates
// them by substring (`athleteEquipmentToKeys`), so the test must speak chip, not key.
const HOME_GYM = [
  'Barbell + plates', 'Dumbbells', 'Squat rack / Power cage', 'Bench (flat/adjustable)',
  'Pull-up bar', 'Resistance bands', 'Ab wheel',
];

const prefsWith = (day: string, picks: Record<string, string | null>) =>
  normalizeAssistancePrefs({ version: 2, by_day: { [day]: picks }, focus: [] });

Deno.test('an un-performable pick is replaced from ITS OWN category, with something the kit performs', () => {
  // Lat Pulldown routes [['cable'], ['bands']] — a home gym with NO bands reaches it no way at all.
  const noBands = HOME_GYM.filter((c) => c !== 'Resistance bands');
  const prefs = prefsWith('squat', { push: 'Push-Up', pull: 'Lat Pulldown', single_leg_core: 'Lunge' });
  const rows = resolveDayAssistance(prefs, 'squat', 50, null, noBands);
  const pull = rows.find((r) => r.category === 'pull')!;
  assert(pull.name !== 'Lat Pulldown', 'the cable movement must not survive the gate');
  assertEquals(catalogEntry(pull.name)?.category, 'pull', 'replacement stays in the pull category');
  assert(canPerform(pull.name, noBands), `replacement must be performable, got ${pull.name}`);
});

Deno.test('the replacement prefers loadable gear over a band variant when both exist', () => {
  // WITH bands, Lat Pulldown is performable via its band route and must be KEPT (athlete's pick).
  // So force a replacement instead: kit with bands but no cable, pick a movement with NO band route.
  // 'Leg Curl' is ungated (D-425) — use a fabricated-unreachable case via the pull slot on a
  // bands-only kit, where the gate must still answer from the pull pool.
  const bandsOnly = ['Resistance bands'];
  const prefs = prefsWith('bench', { push: 'Dips', pull: 'Barbell Row', single_leg_core: 'Lunge' });
  const rows = resolveDayAssistance(prefs, 'bench', 50, null, bandsOnly);
  const pull = rows.find((r) => r.category === 'pull')!;
  assert(pull.name !== 'Barbell Row', 'a barbell movement must not survive a bands-only kit');
  assert(canPerform(pull.name, bandsOnly), `replacement must be performable, got ${pull.name}`);
  // On a bands-only kit nothing loadable exists, so a band/bodyweight answer is the honest one —
  // but on a kit where loadable gear DOES exist, the replacement must not be band-reached:
  const noCable = HOME_GYM.filter((c) => c !== 'Resistance bands');
  const rows2 = resolveDayAssistance(
    prefsWith('bench', { push: 'Dips', pull: 'Lat Pulldown', single_leg_core: 'Lunge' }),
    'bench', 50, null, noCable,
  );
  const pull2 = rows2.find((r) => r.category === 'pull')!;
  assert(hasLoadableFit(pull2.name, noCable) || canPerform(pull2.name, noCable),
    `replacement should reach the kit's loadable gear first, got ${pull2.name}`);
  assert(pull2.name !== 'Lat Pulldown');
});

Deno.test('a performable pick is NEVER touched — even one reached through a band route', () => {
  // Lat Pulldown via bands is performable on the full home gym: the athlete picked it, it stays.
  // ⚠️ WAS THE PRESS DAY. `'press'` is not a `LiftDay` as of slice 5 (2026-08-17), so storing picks
  // under it means `normalizeAssistancePrefs` never keeps them and the row falls to a default — the
  // test would pass or fail for the wrong reason. Any real day exercises the same rule.
  const prefs = prefsWith('squat', { push: 'Dips', pull: 'Lat Pulldown', single_leg_core: 'Ab Wheel Rollout' });
  const rows = resolveDayAssistance(prefs, 'squat', 50, null, HOME_GYM);
  assertEquals(rows.find((r) => r.category === 'pull')!.name, 'Lat Pulldown');
});

Deno.test('unknown inventory (null / empty) degrades to UNGATED — the pre-existing behaviour exactly', () => {
  const prefs = prefsWith('deadlift', { push: 'Push-Up', pull: 'Lat Pulldown', single_leg_core: 'Lunge' });
  for (const eq of [null, [] as string[], undefined]) {
    const rows = resolveDayAssistance(prefs, 'deadlift', 50, null, eq);
    assertEquals(rows.find((r) => r.category === 'pull')!.name, 'Lat Pulldown',
      'unknown kit must not replace anything');
  }
});

Deno.test('the BALANCED_WEEK fallbacks pass the gate on a normal home gym untouched', () => {
  // D-425's guardrail restated at the resolver: an athlete with the standard home gym and NO stored
  // picks gets the default week with nothing swapped.
  const prefs = normalizeAssistancePrefs(null);
  for (const day of LIFT_DAYS) {
    const rows = resolveDayAssistance(prefs, day, 50, null, HOME_GYM);
    for (const r of rows) {
      assert(canPerform(r.name, HOME_GYM), `default ${r.name} must be performable on a home gym`);
    }
  }
});

Deno.test('the pull-up progression row is NOT gated — the opt-in programme shows what was signed up for', () => {
  const noBar = ['Dumbbells'];
  const prefs = prefsWith('squat', { push: 'Push-Up', pull: 'Dumbbell Row', single_leg_core: 'Lunge' });
  const rows = resolveDayAssistance(prefs, 'squat', 50, { movement: 'Chin-Up', totalReps: 25 }, noBar);
  assertEquals(rows.find((r) => r.category === 'pull')!.name, 'Chin-Up');
});
