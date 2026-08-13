// F-8 phase 1 — the gear-need map (exerciseRequiredGearKeys) is the single source of truth for
// "what equipment does this exercise need". F-6 fixes: barbell compounds detected from the unprefixed
// names protocols actually emit, and rings/step-ups no longer over-required. Plus no DB/band regression.
// Run: ~/.deno/bin/deno test --no-check supabase/functions/_shared/strength-equipment-tier.test.ts
import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import {
  exerciseRequiredGearKeys,
  buildStrengthEquipmentLine,
  hasInclineBench,
  hasAbWheel,
  athleteEquipmentToKeys,
  STRENGTH_GEAR_LABEL,
} from './strength-equipment-tier.ts';
// ⚠️ ONE DEFINITION NOW. Slice 3 kept a duplicate key union on the client and pinned it here with a
// contract test; slice 4 moved the whole vocabulary to `src/lib/strength-gear.ts`, which BOTH sides
// import — this file re-exports it. The test below is kept because the "every key is reachable from
// a chip" half is still a real invariant that types cannot express.
import { ASSISTANCE_GEAR, gearRoutesFor, canPerform } from '../../../src/lib/strength-gear.ts';
import { BALANCED_WEEK } from '../../../src/lib/assistance-catalog.ts';

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
  assertEquals(hasInclineBench(['Bench (flat/adjustable)', 'Incline bench']), true);
  // A commercial gym has adjustable benches; that inference stands.
  assertEquals(hasInclineBench(['Commercial gym']), true);
  // ⚠️ `hasDeclineBench` was deleted with its chip in Slice 7 — see the note where it stood.
});

Deno.test('⛔ A COMMERCIAL GYM DOES NOT IMPLY AN AB WHEEL — it is a ten-dollar accessory, not fixtures', () => {
  assertEquals(hasAbWheel(['Commercial gym']), false);
  assertEquals(hasAbWheel(['Ab wheel']), true);
  assertEquals(hasAbWheel(['Ab roller']), true);
  assertEquals(hasAbWheel([]), false);
  // Same asymmetry through the key map the gear line reads.
  const gymKeys = athleteEquipmentToKeys(['Commercial gym']);
  assertEquals(gymKeys.has('incline_bench'), true);
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
  ]);
  assertEquals([...used].filter((k) => !reachable.has(k)), [],
    'these keys cannot be produced by any equipment chip at all');
});

Deno.test('⛔ THE KNEEL-AND-LOWER FAMILY ROUTES ON THE BARBELL — the ankle-anchor chips are gone', () => {
  // ⚠️ THIS TEST ASSERTED THE OPPOSITE UNTIL SLICE 7, and the reversal is about the PICKER, not the
  // movement. It pinned three routes — `ghd`, `decline_bench`, `barbell` — because a decline bench's
  // rollers genuinely are the standard home GHD substitute. Still true of the world; no longer true
  // of anything the athlete can declare, because both chips were cut as unrecognisable. A route
  // nobody can satisfy is a movement nobody is offered, so the two went together.
  for (const m of ['Nordic Curl', 'Glute-Ham Raise', 'Back Extension']) {
    assertEquals(gearRoutesFor(m), [['barbell']], m);
  }
  // Feet under a loaded bar is the surviving anchor — and it is what most people actually use.
  assertEquals(canPerform('Nordic Curl', ['Barbell + plates']), true);
  assertEquals(canPerform('Nordic Curl', ['Dumbbells', 'Bench (flat/adjustable)']), false);
});

Deno.test('the tags the old advisory field got wrong', () => {
  // One token, four pieces of equipment: dips, pull-ups, inverted rows and front squats were all 'bar'.
  // ⚠️ The dips ROUTE has since been loosened (Slice 7); what this pins is that the four no longer
  // share one answer, which is what "incomplete" meant.
  assertEquals(gearRoutesFor('Dips'), [['rack'], ['bench']]);
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
  // ⛔ THE PICKER'S LIST VERBATIM (`TrainingBaselines.tsx`). Slice 7 cut six niche chips from it;
  // if a chip is renamed there and not here, this test still passes while every athlete who ticked it
  // silently loses the capability. Keep the two in step.
  const PICKER = [
    'Barbell + plates', 'Dumbbells', 'Squat rack / Power cage', 'Bench (flat/adjustable)',
    'Incline bench', 'Pull-up bar', 'Kettlebells', 'Cable machine', 'Resistance bands', 'Ab wheel',
  ];
  const dead = PICKER.filter((chip) => athleteEquipmentToKeys([chip]).size === 0);
  assertEquals(dead, [], 'these chips produce no gear key — ticking them does nothing');

  // ⛔ EVERY KEY THAT *GATES* MUST COME FROM A CHIP. Scoped to `ASSISTANCE_GEAR`'s routes rather than
  // the whole label map, and the distinction is Slice 7's rule: a key that decides whether a movement
  // is OFFERED has to be declarable, or it deletes the movement for everyone. A key that merely
  // appears on a session card's Equipment line does not — `box` and `rings` still name real gear on
  // the card for box jumps and ring rows, and naming gear the athlete has not declared is
  // informative, not a gate.
  const fromChips = new Set<string>();
  for (const chip of PICKER) for (const k of athleteEquipmentToKeys([chip])) fromChips.add(k);
  const gateKeys = new Set<string>();
  for (const routes of Object.values(ASSISTANCE_GEAR)) {
    for (const route of routes) for (const k of route) gateKeys.add(k);
  }
  assertEquals([...gateKeys].filter((k) => !fromChips.has(k)), [],
    'these keys GATE a movement but no home-gym chip produces them');
});

/** The guardrail's athlete: a normal home gym, nothing niche. */
const HOME_GYM = ['Barbell + plates', 'Dumbbells', 'Squat rack / Power cage',
  'Bench (flat/adjustable)', 'Pull-up bar'];

Deno.test('⛔ A NORMAL HOME GYM CAN DIP — Slice 7 reverses the gate that said otherwise', () => {
  // The concrete symptom Slice 7 was written for: `[['dip_bars'], ['rings']]` gated a barbell/rack/
  // bench gym out of Dips and the composer swapped it to a Push-Up. Dips worked before Slice 3/4
  // invented that gate.
  assertEquals(canPerform('Dips', HOME_GYM), true);
  // Either route alone is enough — a rack with safety arms, or two benches.
  assertEquals(canPerform('Dips', ['Squat rack / Power cage']), true);
  assertEquals(canPerform('Dips', ['Bench (flat/adjustable)']), true);
  // ⚠️ AND IT IS STILL A GATE, not a free pass: bands alone cannot dip.
  assertEquals(canPerform('Dips', ['Resistance bands']), false);
});

Deno.test('⛔ THE GATE STILL BITES where the gear is required AND declarable', () => {
  // The rule Slice 7 leaves behind. Both of these are gated on chips that survived the cut, and both
  // are genuinely impossible without them.
  assertEquals(canPerform('Ab Wheel Rollout', HOME_GYM), false);
  assertEquals(canPerform('Ab Wheel Rollout', [...HOME_GYM, 'Ab wheel']), true);
  assertEquals(canPerform('DB Incline Press', HOME_GYM), false);
  assertEquals(canPerform('DB Incline Press', [...HOME_GYM, 'Incline bench']), true);
  assertEquals(canPerform('Lat Pulldown', HOME_GYM), false);
  assertEquals(canPerform('Lat Pulldown', [...HOME_GYM, 'Cable machine']), true);
  // Bodyweight is never gated.
  assertEquals(canPerform('Push-Up', HOME_GYM), true);
  assertEquals(canPerform('Reverse Lunge', HOME_GYM), true);
  // ⛔ AN EMPTY INVENTORY MEANS "WE DO NOT KNOW", NOT "OWNS NOTHING". Every athlete who never opened
  // the picker has an empty list, and a strict reading would hand them four days of push-ups.
  assertEquals(canPerform('Ab Wheel Rollout', []), true);
  assertEquals(canPerform('Ab Wheel Rollout', null), true);
});

Deno.test('⛔ SUBSTITUTION, NOT A GATE, FOR GEAR NOBODY CAN DECLARE', () => {
  // A leg-curl machine is required and not declarable, so `canPerform` waves it through and
  // `substituteExerciseForEquipment` swaps it to Nordic / Band Leg Curls. A gate here would DELETE
  // Wendler's hamstring work; a swap keeps it. Same for the kneel-and-lower family, which now routes
  // on the barbell — feet under a loaded bar, which is what most people actually do.
  assertEquals(canPerform('Leg Curl', HOME_GYM), true);
  assertEquals(canPerform('Glute-Ham Raise', HOME_GYM), true);
  assertEquals(canPerform('Nordic Curl', HOME_GYM), true);
  assertEquals(canPerform('Back Extension', HOME_GYM), true);
  // No barbell → the kneel-and-lower family has no anchor and is correctly off the menu.
  assertEquals(canPerform('Glute-Ham Raise', ['Dumbbells']), false);
});

Deno.test('⛔ THE GUARDRAIL — a normal home gym performs the ENTIRE default block, nothing swapped', () => {
  // Slice 7's own guardrail, asserted rather than asserted-about. Every movement in the balanced
  // default week must be performable by barbell/dumbbells/rack/bench/pull-up bar, or the app hands a
  // typical athlete a block it then has to degrade.
  const blocked = Object.values(BALANCED_WEEK)
    .flatMap((day) => Object.values(day))
    .filter((name) => !canPerform(name, HOME_GYM));
  assertEquals(blocked, [], 'the default block gates a normal home gym out of these');
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
