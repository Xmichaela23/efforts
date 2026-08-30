/**
 * THE INTENSITY-TIER GATE (2026-08-03) — fixtures.
 *
 *   ~/.deno/bin/deno test --allow-read src/lib/strength-intensity-tier.test.ts --no-check
 *
 * Pins the classifier, the gate it feeds, and the exact offers the audit measured as unsound.
 * Source: docs/AUDIT-accessory-swaps-2026-08-03.md.
 */
import { assert, assertEquals } from 'https://deno.land/std@0.208.0/assert/mod.ts';
import { EXERCISE_CONFIG } from './exercise-config.ts';
import { getInSlotAlternatives } from './exercise-alternatives.ts';
import { isMainBarbellLift } from './exercise-role.ts';
import { intensityTierForExercise, sameIntensityTier } from './strength-intensity-tier.ts';

const FULL_GYM = ['Full commercial gym access'];
const offers = (slot: string) => getInSlotAlternatives(slot, FULL_GYM).map((o) => o.name.toLowerCase());

Deno.test('the classifier — LIGHT is band, held, or unloaded core work', () => {
  for (const n of ['clamshell', 'lateral band walk', 'band lateral walk', 'band pull apart',
                   'band face pull', 'band row', 'band pull down', 'band overhead press',
                   'band lateral raise', 'plank', 'plank hold', 'side plank', 'dead hang',
                   'wall sit', 'wall angel', 'foot doming', 'bird dog', 'dead bug']) {
    assertEquals(intensityTierForExercise(n), 'light', `${n} should be light`);
  }
});

Deno.test('⛔ THE CLASSIFIER CORRECTION — a bodyweight COMPOUND is loaded, not prehab', () => {
  // An earlier rule keyed on `primaryRef`, which is null on every one of these because the config
  // has no barbell to derive them from. That called pull-ups prehab and produced ~80 false unsound
  // rows in the audit. The discriminator is the PATTERN bucket, not the reference.
  for (const n of ['pull up', 'chin up', 'push up', 'inverted row', 'pike push up',
                   'archer push up', 'diamond push up', 'dips']) {
    assertEquals(intensityTierForExercise(n), 'loaded', `${n} is a working set`);
  }
  // …and the core-bucket bodyweight work stays light, which is what makes the rule work at all.
  assertEquals(intensityTierForExercise('bird dog'), 'light');
  assertEquals(intensityTierForExercise('plank'), 'light');
});

Deno.test('the classifier — LOADED is an implement, or a small explicit ratio marks it light', () => {
  for (const n of ['barbell row', 'dumbbell row', 'lat pulldown', 'hip thrust', 'barbell hip thrust',
                   'lateral raise', 'walking lunge', 'step up', 'leg press']) {
    assertEquals(intensityTierForExercise(n), 'loaded', `${n} is a working load`);
  }
  // Postural / cuff work carries an explicit ratio at or below the ceiling.
  for (const n of ['ytw raise', 'external rotation', 'cable face pull', 'prone y t w raise']) {
    assertEquals(intensityTierForExercise(n), 'light', `${n} is postural work`);
  }
});

Deno.test('⛔ RATIO 0 ON A LOADED FORMAT IS "NO NUMBER", NOT "LIGHT"', () => {
  // Reading it as light split `weighted single leg calf raise` from the calf movements it should
  // swap with and left it with ZERO options — a false exclusion, which this file's sibling calls
  // worse than a false offer.
  assertEquals(EXERCISE_CONFIG['weighted single leg calf raise'].ratio, 0);
  assertEquals(intensityTierForExercise('weighted single leg calf raise'), 'loaded');
  assert(offers('weighted single leg calf raise').length > 0, 'must still have options');
});

Deno.test('POWER is its own tier — a jump is neither prehab nor a working hypertrophy set', () => {
  for (const n of ['box jump', 'broad jump', 'bench jump', 'bounding', 'skater hop',
                   'jump lunge', 'jump squat', 'squat jump']) {
    assertEquals(intensityTierForExercise(n), 'power', `${n} is power work`);
  }
});

Deno.test('⛔ THE 32 WORST OFFERS — a light slot is never handed a loaded lift', () => {
  // Every pair below is a real offer the engine made before this gate (audit, "Worst cases").
  const killed: Array<[string, string]> = [
    ['clamshell', 'hip thrust'],
    ['clamshell', 'barbell hip thrust'],
    ['clamshell', 'glute bridge'],
    ['clamshell', 'kb swing'],
    ['lateral band walk', 'hip thrust'],
    ['lateral band walk', 'barbell hip thrust'],
    ['band lateral walk', 'kb swing'],
    ['band lateral raise', 'lateral raise'],
    ['band overhead press', 'dumbbell press'],
    ['band overhead press', 'kettlebell press'],
    ['band pull down', 'explosive lat pull down'],
  ];
  for (const [slot, gone] of killed) {
    assertEquals(offers(slot).includes(gone), false, `${slot} must no longer offer ${gone}`);
  }
});

Deno.test('⛔ AND IT CUTS BOTH WAYS — a loaded slot is never handed a band movement', () => {
  assertEquals(offers('hip thrust').includes('clamshell'), false);
  assertEquals(offers('hip thrust').includes('lateral band walk'), false);
  assertEquals(offers('lateral raise').includes('band lateral raise'), false);
  assertEquals(offers('barbell row').includes('band row'), false);
});

Deno.test('⛔ SILENCE IS NOT BLANKET — same-tier swaps still flow', () => {
  // The gate must not empty the lists. A band movement still swaps for other band movements, and a
  // loaded movement for other loaded ones.
  const bandRow = offers('band row');
  assert(bandRow.length > 0, 'band row lost every option');
  for (const o of bandRow) assert(sameIntensityTier('band row', o), `band row → ${o} crossed tiers`);

  const dbRow = offers('dumbbell row');
  assert(dbRow.length > 0, 'dumbbell row lost every option');
  assert(dbRow.includes('barbell row'), 'a pure equipment change must survive');

  // The named field-standard case: barbell → dumbbell at the same muscle and tier is SOUND.
  assert(offers('barbell row').includes('dumbbell row'));
  assert(offers('barbell row').includes('chest supported row'));
  // ⚠️ `cable row` is deliberately NOT asserted here. Its config is byte-identical to `row`, so the
  // PRE-EXISTING config-identity dedup in `exercise-alternatives.ts` collapses the two and offers
  // `Row`. That is not the tier gate hiding it — it is the same-exercise-two-keys rule, and asserting
  // otherwise would have pinned a behaviour this change never touched.
  assert(offers('barbell row').includes('row'));
});

Deno.test('⛔ NO OFFER ANYWHERE IN THE LIBRARY CROSSES A TIER', () => {
  // The invariant, swept over every accessory the engine will answer for.
  // ⚠️ MAIN LIFTS ARE EXCLUDED FROM THE SWEEP, matching the engine's own exemption exactly: a
  // main-lift slot may swap DOWN (documented, one-directional, pre-dates this gate). Anything else
  // — including curated-family members like a Romanian Deadlift or a Leg Press — IS swept.
  const crossings: string[] = [];
  for (const slot of Object.keys(EXERCISE_CONFIG)) {
    if (isMainBarbellLift(slot)) continue;
    for (const o of offers(slot)) {
      if (!sameIntensityTier(slot, o)) {
        crossings.push(`${slot} → ${o} (${intensityTierForExercise(slot)} → ${intensityTierForExercise(o)})`);
      }
    }
  }
  assertEquals(crossings, [], `tier crossings remain:\n  ${crossings.join('\n  ')}`);
});

Deno.test('⛔ THE MUSCLE AXIS STAYS LOOSE — this is a ruling, not an oversight', () => {
  // Michael's call, and the previous program's: posterior-chain assistance is interchangeable. A Single Leg RDL
  // (hamstrings) offering a Hip Thrust (glutes) is ACCEPTED. If a future change adds a same-muscle
  // gate, this fails and forces the decision to be re-made deliberately.
  assert(offers('single leg rdl').includes('hip thrust'),
    'the muscle axis was tightened — that reverses a deliberate ruling');
});

Deno.test('⛔ THE PATTERN DEFECT — every Y-T-W spelling lands in ONE pool', () => {
  // `ytw raise` sat at vertical_push while `prone y t w raise` (the same movement, spelled out) and
  // `external rotation` were added at horizontal_pull. Same exercise, two swap pools.
  // ⛔ RESOLVED BY MOVING `ytw raise`, because it was the wrong one: a Y-T-W is scapular retraction,
  // and every other movement of its class in this file is already horizontal_pull.
  for (const k of ['ytw raise', 'ytw raises', 'prone y t w raise', 'external rotation']) {
    assertEquals(EXERCISE_CONFIG[k].pattern, 'horizontal_pull', `${k} is scapular/rear-delt PULL work`);
  }
  // The family it now sits with, which is the evidence the choice was read off and not invented.
  for (const k of ['face pull', 'band face pull', 'cable face pull', 'rear delt fly', 'band pull apart']) {
    assertEquals(EXERCISE_CONFIG[k].pattern, 'horizontal_pull');
  }
  // And the consequence: it is no longer offered a press, nor offered as one.
  assertEquals(offers('ytw raise').includes('overhead press'), false);
  assertEquals(offers('dumbbell press').includes('ytw raise'), false);
});

Deno.test('⛔ ONE MOVEMENT, ONE POOL — the three name-collision defects the audit found', () => {
  // All three are the same bug: the same exercise under two names carried two different patterns, so
  // which substitutes the app offered depended on which spelling the plan happened to write.

  // 1. Y-T-W. `ytw raise` sat at vertical_push; `prone y t w raise` was added at horizontal_pull.
  for (const k of ['ytw raise', 'ytw raises', 'prone y t w raise', 'external rotation']) {
    assertEquals(EXERCISE_CONFIG[k].pattern, 'horizontal_pull', `${k} is scapular PULL work`);
  }

  // 2. Reverse fly IS a rear delt fly. `rear delt fly` was horizontal_pull all along.
  for (const k of ['reverse fly', 'reverse flye', 'rear delt fly', 'rear delt flye']) {
    assertEquals(EXERCISE_CONFIG[k].pattern, 'horizontal_pull', `${k} is a rear-delt fly`);
  }

  // 3. Squat jump IS a jump squat. `jump squat` was plyometric all along.
  for (const k of ['squat jump', 'squat jumps', 'jump squat', 'jump squats']) {
    assertEquals(EXERCISE_CONFIG[k].pattern, 'plyometric', `${k} is a jump`);
  }

  // The family each now sits with — the evidence the choices were read off, not invented.
  for (const k of ['face pull', 'band face pull', 'cable face pull', 'band pull apart']) {
    assertEquals(EXERCISE_CONFIG[k].pattern, 'horizontal_pull');
  }
  for (const k of ['box jump', 'broad jump', 'skater hop', 'bounding']) {
    assertEquals(EXERCISE_CONFIG[k].pattern, 'plyometric');
  }
});

Deno.test('⛔ AND THE CONSEQUENCE — each defect cost real, wrong offers', () => {
  // Y-T-W: was offered presses, and offered AS one.
  assertEquals(offers('ytw raise').includes('overhead press'), false);
  assertEquals(offers('dumbbell press').includes('ytw raise'), false);

  // Reverse fly: was in the push pool, so it never met the rear-delt family it belongs to.
  assert(offers('reverse fly').includes('face pull'), 'a reverse fly is rear-delt work');
  assert(offers('reverse fly').includes('ytw raise'));

  // ⛔ SQUAT JUMP IS THE ONE THE TIER GATE STRANDED. At knee_dominant it was `power` in a pool with
  // no other power movement, so the gate correctly removed six unsound offers (Bulgarian Split
  // Squat, Reverse Lunge, Step Up, Leg Extension, Lateral Lunge, Bodyweight Squat) and left it with
  // NOTHING. Filing it as plyometric gives it back the right peers instead.
  const sj = offers('squat jump');
  assert(sj.length > 0, 'squat jump must not be stranded');
  assert(sj.includes('skater hop'), 'a jump swaps for other jumps');
  for (const bad of ['bulgarian split squat', 'reverse lunge', 'step up', 'leg extension',
                     'lateral lunge', 'bodyweight squat']) {
    assertEquals(sj.includes(bad), false, `a jump is not swapped for ${bad}`);
  }
  // Its twin gets the same pool, which is the whole point of them agreeing.
  assert(offers('jump squat').includes('box jump'));
});

Deno.test('⛔ A MAIN-LIFT SLOT MAY STILL SWAP DOWN — the gate is for accessories', () => {
  // The one-directional rule pre-dates this gate and is documented in `exercise-alternatives.ts`:
  // *"A main-lift slot still offers everything it offered before … swapping DOWN from a squat to a
  // lunge is a legitimate call the athlete may need."* A first cut gated every slot and broke it.
  // ⛔ THE ASSERTION IS A GENUINE TIER CROSSING, or it proves nothing. A Conventional Deadlift is
  // `loaded` and a Clamshell is `light`: this offer exists ONLY because main-lift slots are exempt.
  // If someone later gates main lifts too, this fails and forces the call to be re-made.
  const dl = offers('conventional deadlift');
  assert(dl.includes('clamshell'), 'a main lift may still be swapped down across tiers');
  assert(dl.includes('lateral band walk'));

  // ⚠️ AND THE EXEMPTION IS NARROW. `isMainLift` in the alternatives file is a UNION that counts any
  // curated-family member — Romanian Deadlift, Barbell Row, Goblet Squat, Leg Press. Exempting on
  // THAT let `barbell row → ytw raise` and `romanian deadlift → clamshell` back through. Only the
  // four lifts the block is built on are exempt.
  assertEquals(offers('barbell row').includes('ytw raise'), false);
  assertEquals(offers('romanian deadlift').includes('clamshell'), false);
  assertEquals(offers('leg press').includes('squat jump'), false);
});

Deno.test('the curated assistance-slot path is NOT tier-gated, and that is deliberate', () => {
  // ⛔ THE PLAN'S FRAMEWORK OUTRANKS THE LIBRARY for rows the plan owns (the `assistanceRow` path
  // returns before this gate). Those peers were chosen at build time and are interchangeable by
  // construction; re-filtering them here would have the library overruling the plan.
  const peers = getInSlotAlternatives('Pull Up', FULL_GYM, { assistanceRow: true, mainLift: 'Bench Press' });
  assert(Array.isArray(peers), 'the assistance path still answers');
});
