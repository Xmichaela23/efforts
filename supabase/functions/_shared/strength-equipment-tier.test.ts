// F-8 phase 1 — the gear-need map (exerciseRequiredGearKeys) is the single source of truth for
// "what equipment does this exercise need". F-6 fixes: barbell compounds detected from the unprefixed
// names protocols actually emit, and rings/step-ups no longer over-required. Plus no DB/band regression.
// Run: ~/.deno/bin/deno test --no-check supabase/functions/_shared/strength-equipment-tier.test.ts
import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import {
  exerciseRequiredGearKeys,
  buildStrengthEquipmentLine,
  hasInclineBench,
  hasDeclineBench,
  hasAbWheel,
  athleteEquipmentToKeys,
  STRENGTH_GEAR_LABEL,
} from './strength-equipment-tier.ts';
// ⚠️ ONE DEFINITION NOW. Slice 3 kept a duplicate key union on the client and pinned it here with a
// contract test; slice 4 moved the whole vocabulary to `src/lib/strength-gear.ts`, which BOTH sides
// import — this file re-exports it. The test below is kept because the "every key is reachable from
// a chip" half is still a real invariant that types cannot express.
import { ASSISTANCE_GEAR, gearRoutesFor, canPerform } from '../../../src/lib/strength-gear.ts';

Deno.test('exerciseRequiredGearKeys — F-6: unprefixed barbell compounds detected', () => {
  // 5×5 names the lifts WITHOUT a "Barbell" prefix — these were silently undetected before.
  assertEquals(exerciseRequiredGearKeys('Back Squat'), ['barbell', 'rack']);
  assertEquals(exerciseRequiredGearKeys('Overhead Press'), ['barbell', 'rack']);
  assertEquals(exerciseRequiredGearKeys('Deadlift'), ['barbell']);
  // already worked — guard against regression
  assertEquals(exerciseRequiredGearKeys('Bench Press'), ['barbell', 'rack', 'bench']);
  assertEquals(exerciseRequiredGearKeys('Barbell Row'), ['barbell']);
  assertEquals(exerciseRequiredGearKeys('Conventional Deadlift'), ['barbell']);
  assertEquals(exerciseRequiredGearKeys('Standing Barbell Overhead Press'), ['barbell', 'rack']);
  assertEquals(exerciseRequiredGearKeys('Push Press'), ['barbell', 'rack']);
});

Deno.test('exerciseRequiredGearKeys — F-6: rings / step-ups no longer over-required', () => {
  assertEquals(exerciseRequiredGearKeys('Inverted Rows'), []);                       // was ['rings']
  assertEquals(exerciseRequiredGearKeys('Step ups'), []);                            // was ['bench']
  assertEquals(exerciseRequiredGearKeys('Ring Rows'), ['rings']);                    // explicit rings still required
});

Deno.test('exerciseRequiredGearKeys — F-6: "X or Y" choice names require nothing (athlete picks)', () => {
  assertEquals(exerciseRequiredGearKeys('Inverted Ring Row or Band Row'), []);
  assertEquals(exerciseRequiredGearKeys('Box Jumps or Broad Jumps'), []);
  assertEquals(exerciseRequiredGearKeys('Goblet Squat or Bodyweight Squat'), []);
  // single-variant names still resolve normally
  assertEquals(exerciseRequiredGearKeys('Box Jumps'), ['box']);
  assertEquals(exerciseRequiredGearKeys('Goblet Squat'), ['dumbbells']);
});

Deno.test('exerciseRequiredGearKeys — no DB/band/bodyweight regression (guards hold)', () => {
  assertEquals(exerciseRequiredGearKeys('DB Bench Press'), ['dumbbells', 'bench']);
  assertEquals(exerciseRequiredGearKeys('DB Shoulder Press'), ['dumbbells']);
  assertEquals(exerciseRequiredGearKeys('DB Romanian Deadlift'), ['dumbbells']);
  assertEquals(exerciseRequiredGearKeys('Band Overhead Press'), ['bands']);
  assertEquals(exerciseRequiredGearKeys('Goblet Squat'), ['dumbbells']);
  assertEquals(exerciseRequiredGearKeys('Pull ups'), ['pull_up_bar']);
  assertEquals(exerciseRequiredGearKeys('Box Jumps'), ['box']);
  assertEquals(exerciseRequiredGearKeys('Glute Bridges'), []);                       // bodyweight
});

Deno.test('buildStrengthEquipmentLine — a 5×5 barbell session now reports its real gear (F-6 under-report fixed)', () => {
  const line = buildStrengthEquipmentLine({
    exerciseNames: ['Back Squat', 'Bench Press', 'Barbell Row'],
    athleteEquipment: ['Commercial gym'],
  });
  assertEquals(line, 'Equipment — Required: Barbell, Rack, Bench.');
});

// ── Incline bench / decline bench / ab wheel (added 2026-08-13, Forever assistance catalog) ────────

Deno.test('⛔ INCLINE PRESSING REQUIRES THE INCLINE BENCH, not merely a bench', () => {
  // The whole point: this used to fall through to ['dumbbells', 'bench'] and tell an athlete with a
  // flat bench that they had everything they needed for a movement they cannot set up.
  assertEquals(exerciseRequiredGearKeys('DB Incline Press'), ['dumbbells', 'incline_bench']);
  assertEquals(exerciseRequiredGearKeys('Dumbbell Incline Press'), ['dumbbells', 'incline_bench']);
  assertEquals(exerciseRequiredGearKeys('Incline Bench Press'), ['barbell', 'incline_bench']);
  // …and the flat press is untouched.
  assertEquals(exerciseRequiredGearKeys('DB Bench Press'), ['dumbbells', 'bench']);
  assertEquals(exerciseRequiredGearKeys('Bench Press'), ['barbell', 'rack', 'bench']);
});

Deno.test('the ab wheel is required kit, and the rest of the abs list is not', () => {
  assertEquals(exerciseRequiredGearKeys('Ab Wheel Rollout'), ['ab_wheel']);
  assertEquals(exerciseRequiredGearKeys('Ab Rollout'), ['ab_wheel']);
  assertEquals(exerciseRequiredGearKeys('Hanging Leg Raise'), []);
  assertEquals(exerciseRequiredGearKeys('Sit Up'), []);
});

Deno.test('⛔ "Bench (flat/adjustable)" IS NOT INCLINE CAPABILITY — the label is an OR', () => {
  assertEquals(hasInclineBench(['Bench (flat/adjustable)']), false);
  assertEquals(hasDeclineBench(['Bench (flat/adjustable)']), false);
  assertEquals(hasInclineBench(['Bench (flat/adjustable)', 'Incline bench']), true);
  assertEquals(hasDeclineBench(['Decline bench']), true);
  // A commercial gym has adjustable benches; that inference stands.
  assertEquals(hasInclineBench(['Commercial gym']), true);
  assertEquals(hasDeclineBench(['Commercial gym']), true);
});

Deno.test('⛔ A COMMERCIAL GYM DOES NOT IMPLY AN AB WHEEL — it is a ten-dollar accessory, not fixtures', () => {
  assertEquals(hasAbWheel(['Commercial gym']), false);
  assertEquals(hasAbWheel(['Ab wheel']), true);
  assertEquals(hasAbWheel(['Ab roller']), true);
  assertEquals(hasAbWheel([]), false);
  // Same asymmetry through the key map the gear line reads.
  const gymKeys = athleteEquipmentToKeys(['Commercial gym']);
  assertEquals(gymKeys.has('incline_bench'), true);
  assertEquals(gymKeys.has('decline_bench'), true);
  assertEquals(gymKeys.has('ab_wheel'), false);
});

// ── Slice 3: the assistance gear map ──────────────────────────────────────────────────────────────

Deno.test('⛔ THE ASSISTANCE GEAR MAP SPEAKS THE SHARED VOCABULARY — no second equipment language', () => {
  // Every key `ASSISTANCE_GEAR` uses must be one the label map knows and one an inventory chip can
  // PRODUCE. A key no chip produces is a movement nobody can ever satisfy — and after slice 4 that
  // means it silently vanishes from every athlete's picker.
  const labelled = new Set(Object.keys(STRENGTH_GEAR_LABEL));
  const used = new Set<string>();
  for (const routes of Object.values(ASSISTANCE_GEAR)) {
    for (const route of routes) for (const k of route) used.add(k);
  }
  assertEquals([...used].filter((k) => !labelled.has(k)), [],
    'these keys are used by ASSISTANCE_GEAR but unknown to STRENGTH_GEAR_LABEL');

  // And every key must be reachable from SOME chip — otherwise the tag is unfalsifiable.
  const reachable = athleteEquipmentToKeys([
    'Commercial gym', 'Barbell + plates', 'Dumbbells', 'Squat rack / Power cage',
    'Bench (flat/adjustable)', 'Incline bench', 'Decline bench', 'Pull-up bar', 'Kettlebells',
    'Cable machine', 'Resistance bands', 'Ab wheel',
    // ⛔ THE FOUR SLICE 3 FOUND WITH NO CHIP BEHIND THEM. Slice 4 added chips rather than taking the
    // "ungate if unownable" shortcut, so this list is now the PICKER's list verbatim — if a chip is
    // renamed in `TrainingBaselines.tsx` and not here, this test still passes while every athlete
    // who ticked it silently loses the capability. Keep the two in step.
    'Dip bars', 'Leg curl machine', 'GHD', 'Gymnastic rings', 'Plyo box',
  ]);
  assertEquals([...used].filter((k) => !reachable.has(k)), [],
    'these keys cannot be produced by any equipment chip at all');
});

Deno.test('⛔ THE DECLINE BENCH IS AN ANKLE ANCHOR — it unlocks the kneel-and-lower family, incline does not', () => {
  for (const m of ['Nordic Curl', 'Glute-Ham Raise', 'Back Extension']) {
    const routes = gearRoutesFor(m);
    assertEquals(routes.some((r) => r.length === 1 && r[0] === 'decline_bench'), true, `${m}: decline route`);
    assertEquals(routes.some((r) => r.length === 1 && r[0] === 'ghd'), true, `${m}: GHD route`);
    assertEquals(routes.some((r) => r.length === 1 && r[0] === 'barbell'), true, `${m}: barbell route`);
    // The angle is not the qualifier. An incline-only bench hooks nothing.
    assertEquals(routes.flat().includes('incline_bench'), false, `${m}: incline must NOT qualify`);
  }
});

Deno.test('the tags the old advisory field got wrong', () => {
  // One token, four pieces of equipment: dips, pull-ups, inverted rows and front squats were all 'bar'.
  assertEquals(gearRoutesFor('Dips'), [['dip_bars'], ['rings']]);
  assertEquals(gearRoutesFor('Pull Up'), [['pull_up_bar']]);
  assertEquals(gearRoutesFor('Front Squat'), [['barbell']]);
  // A face pull was tagged `null` — "needs nothing". There is no bodyweight face pull.
  assertEquals(gearRoutesFor('Face Pull'), [['cable'], ['bands']]);
  // A DB bench press was tagged 'bench', losing the dumbbells.
  assertEquals(gearRoutesFor('Dumbbell Bench Press'), [['dumbbells', 'bench']]);
  // Incline was 'bench' — losing both the barbell and the incline.
  assertEquals(gearRoutesFor('Incline Bench Press'), [['barbell', 'incline_bench']]);
});

Deno.test('the gear map covers every movement the catalog and the live pools can produce', () => {
  const CATALOG = [
    'Dips', 'Push-Up', 'DB Bench Press', 'DB Incline Press', 'DB Shoulder Press', 'Plate Raise',
    'Triceps Pushdown', 'Triceps Extension', 'Chin-Up', 'Dumbbell Row', 'Barbell Row', 'Lat Pulldown',
    'Inverted Row', 'Face Pull', 'Dumbbell Curl', 'Reverse Lunge', 'Bulgarian Split Squat',
    'Front Squat', 'Glute-Ham Raise', 'Back Extension', 'Reverse Hyper', 'Hanging Leg Raise',
    'Ab Wheel Rollout', 'Weighted Sit-Up', 'DB Side Bend',
  ];
  // Still live until slice 5 retires them: the current menu + every ROLE_FALLBACK pool.
  const LIVE = [
    'Push Up', 'Dumbbell Bench Press', 'Incline Bench Press', 'Dumbbell Shoulder Press', 'Pull Up',
    'Single Leg Hip Thrust', 'Sit Up', 'Plank', 'Diamond Push Up', 'Tricep Pushdown',
    'Tricep Extension', 'Close Grip Bench Press', 'Hammer Curl', 'Leg Curl', 'Romanian Deadlift',
    'Good Morning', 'Hip Thrust', 'Nordic Curls', 'Band Leg Curls',
  ];
  const missing = [...CATALOG, ...LIVE].filter(
    (n) => !(n.toLowerCase().replace(/['’]/g, '').replace(/[-_]+/g, ' ').trim() in ASSISTANCE_GEAR),
  );
  assertEquals(missing, [], 'untagged movements — gearRoutesFor would silently return "needs nothing"');
});

Deno.test('⛔ THE PICKER LIST AND THE KEY MAP AGREE — a renamed chip is a silent capability loss', () => {
  // Every home-gym chip must produce at least one key, and every key must come from some chip. The
  // first half catches a chip nobody detects (dead tick-box); the second catches a movement nobody
  // can ever perform. Both are silent failures — nothing errors, options just quietly disappear.
  const PICKER = [
    'Barbell + plates', 'Dumbbells', 'Squat rack / Power cage', 'Bench (flat/adjustable)',
    'Incline bench', 'Decline bench', 'Pull-up bar', 'Kettlebells', 'Cable machine',
    'Resistance bands', 'Ab wheel', 'Dip bars', 'Leg curl machine', 'GHD', 'Gymnastic rings',
    'Plyo box',
  ];
  const dead = PICKER.filter((chip) => athleteEquipmentToKeys([chip]).size === 0);
  assertEquals(dead, [], 'these chips produce no gear key — ticking them does nothing');

  const fromChips = new Set<string>();
  for (const chip of PICKER) for (const k of athleteEquipmentToKeys([chip])) fromChips.add(k);
  const unreachable = (Object.keys(STRENGTH_GEAR_LABEL) as string[]).filter((k) => !fromChips.has(k));
  assertEquals(unreachable, [], 'no home-gym chip produces these keys');
});

Deno.test('⛔ THE GATE — a home gym without the kit does not get offered the movement', () => {
  const HOME = ['Barbell + plates', 'Dumbbells', 'Bench (flat/adjustable)', 'Pull-up bar'];
  // Owns none of the specific kit → these are off the menu.
  assertEquals(canPerform('Ab Wheel Rollout', HOME), false);
  assertEquals(canPerform('DB Incline Press', HOME), false);
  assertEquals(canPerform('Dips', HOME), false);
  assertEquals(canPerform('Leg Curl', HOME), false);
  assertEquals(canPerform('Glute-Ham Raise', HOME), true, 'barbell anchors the feet — a real route');
  // Owns the kit → back on.
  assertEquals(canPerform('Ab Wheel Rollout', [...HOME, 'Ab wheel']), true);
  assertEquals(canPerform('DB Incline Press', [...HOME, 'Incline bench']), true);
  assertEquals(canPerform('Dips', [...HOME, 'Dip bars']), true);
  assertEquals(canPerform('Leg Curl', [...HOME, 'Leg curl machine']), true);
  // Bodyweight is never gated.
  assertEquals(canPerform('Push-Up', HOME), true);
  assertEquals(canPerform('Reverse Lunge', HOME), true);
  // ⛔ AN EMPTY INVENTORY MEANS "WE DO NOT KNOW", NOT "OWNS NOTHING". Every athlete who never opened
  // the picker has an empty list, and a strict reading would hand them four days of push-ups.
  assertEquals(canPerform('Ab Wheel Rollout', []), true);
  assertEquals(canPerform('Ab Wheel Rollout', null), true);
});

Deno.test('the new keys reach the rendered line — an order-array omission would drop them silently', () => {
  assertEquals(
    buildStrengthEquipmentLine({
      exerciseNames: ['DB Incline Press', 'Ab Wheel Rollout'],
      athleteEquipment: ['Dumbbells', 'Incline bench', 'Ab wheel'],
    }),
    'Equipment — Required: Incline Bench, Dumbbells, Ab Wheel.',
  );
});
