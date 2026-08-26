/**
 * THE WIDER CATALOGUE'S GEAR TAGS (2026-08-26) — fixtures.
 *
 *   ~/.deno/bin/deno test -A --no-check --sloppy-imports src/lib/strength-gear-catalogue.test.ts
 *
 * ⛔ WHAT THIS PINS, AND WHY IT IS NOT THE SAME TEST AS `strength-equipment-tier.test.ts`. That one
 * guards the VOCABULARY — every key must be produceable by some chip. This one guards COVERAGE: that
 * the 211 movements `strength-grid` classifies out of `EXERCISE_CONFIG` actually carry tags, so the
 * gate reads a tag rather than a name regex.
 *
 * Measured before the pass: 160 of 211 untagged, of which 148 reached a declared home gym anyway.
 */
import { assert, assertEquals } from 'https://deno.land/std@0.208.0/assert/mod.ts';
import { ASSISTANCE_GEAR, athleteEquipmentToKeys, canPerform, equipmentFitRank } from './strength-gear.ts';
import { foldExerciseName } from './exercise-config.ts';
import {
  allGridMovements,
  isGearTagged,
  isPrescribable,
  PRESCRIPTION_EXCLUDED,
  readsAsMachineBraced,
} from '../../supabase/functions/_shared/strength-grid/taxonomy.ts';

const HOME_GYM = ['Barbell + plates', 'Squat rack / Power cage', 'Bench (flat/adjustable)',
                  'Dumbbells', 'Pull-up bar', 'Resistance bands'];

/** The grid's own reachability rule, copied from `grid.ts:reachable` — see the note there. */
const reaches = (name: string, equipment: string[]) =>
  canPerform(name, equipment) && (isGearTagged(name) || !readsAsMachineBraced(name));

Deno.test('every movement the engine can prescribe carries a gear tag', () => {
  // ⛔ NO EXCEPTIONS LEFT (Michael's ruling, 2026-08-26). The thirteen this list once held were split
  // in two: three earned chips (`trx fallout`, `stir the pot`, `stability ball rollout`) and ten were
  // dropped from the prescribable pool. Nothing the engine can offer is untagged any more, so a new
  // untagged movement is a failure rather than a silent addition to a backlog.
  const untagged = allGridMovements().filter((m) => !isGearTagged(m.name)).map((m) => m.name).sort();
  assertEquals(untagged, [],
    'a prescribable movement has no gear tag — tag it in strength-gear.ts, or bring the kit gap to Michael');
});

Deno.test('⛔ THE DROPPED TEN ARE OUT OF THE POOL, BY NAME', () => {
  /**
   * ⛔ PINNED SO NOBODY QUIETLY RE-OFFERS ONE. Each needs kit `GearKey` cannot express — a GHD, a
   * roman chair, a captain's chair, a sled, a landmine, a sandbag, a ruck, gymnastic rings — and
   * Slice 7's rule is *"gate only on gear that is BOTH required AND commonly declarable"*. Not
   * declarable means not gateable means never prescribed.
   *
   * ⚠️ AND THEY ARE STILL IN THE LIBRARY. This asserts the ENGINE will not choose them; an athlete
   * who picks a sled push may still log one.
   */
  assertEquals([...PRESCRIPTION_EXCLUDED].sort(), [
    'backpack carry', 'captain s chair knee raise', "captain's chair knee raise", 'ghd sit up',
    'landmine twist', 'ring dips', 'roman chair sit up', 'sandbag lunge', 'sled pull', 'sled push',
  ].sort(), 'the drop list changed — Michael ruled on exactly these ten, 2026-08-26');

  const pool = new Set(allGridMovements().map((m) => foldExerciseName(m.name)));
  for (const name of PRESCRIPTION_EXCLUDED) {
    assert(!pool.has(foldExerciseName(name)), `"${name}" is back in the prescribable pool`);
    assert(!isPrescribable(name), `"${name}" reads as prescribable`);
  }
  // ⚠️ AND THE EXCLUSION IS NARROW — a name that merely LOOKS like one of them is untouched.
  assert(isPrescribable('farmers carry'), 'the carry family was dropped along with the backpack');
  assert(isPrescribable('walking lunge'), 'the lunge family was dropped along with the sandbag');
});

Deno.test('⛔ THE TWO NEW CHIPS REACH THE THREE MOVEMENTS THEY WERE ADDED FOR', () => {
  /**
   * ⛔ MICHAEL'S RULING, 2026-08-26. Suspension trainer and stability ball clear Slice 7's bar —
   * required, and a garage-gym owner knows whether they have one. Without the chips these three were
   * prescribed to athletes who owned neither.
   *
   * ⚠️ EVERY KEY MUST BE PRODUCEABLE BY SOME CHIP (`strength-gear.ts` header), so the chip strings
   * are asserted here as well as the routes — a key no chip produces is a movement nobody can do.
   */
  const trx = athleteEquipmentToKeys(['TRX / suspension trainer']);
  assert(trx.has('suspension_trainer'), 'the TRX chip produces no key');
  const ball = athleteEquipmentToKeys(['Stability ball']);
  assert(ball.has('stability_ball'), 'the stability-ball chip produces no key');
  const gym = athleteEquipmentToKeys(['Commercial gym']);
  assert(gym.has('suspension_trainer') && gym.has('stability_ball'), 'a commercial gym has neither');

  for (const name of ['trx fallout', 'stir the pot', 'stability ball rollout']) {
    assert(isGearTagged(name), `"${name}" is still untagged`);
    assert(!canPerform(name, HOME_GYM), `"${name}" still reaches a gym that declared neither`);
  }
  assert(canPerform('trx fallout', ['TRX / suspension trainer']));
  assert(canPerform('stability ball rollout', ['Stability ball']));
  // ⚠️ EITHER IMPLEMENT DOES FOR THE STIR — straps or a ball, not both.
  assert(canPerform('stir the pot', ['Stability ball']));
  assert(canPerform('stir the pot', ['TRX / suspension trainer']));
});

Deno.test('⛔ A PLURAL AND ITS SINGULAR AGREE — a gate must not flip on spelling', () => {
  // The grid dedupes plurals and may offer either spelling. Two spellings with different routes is a
  // movement the athlete can or cannot do depending on which name the catalogue happened to keep.
  const dedupe = (n: string) => n.replace(/(\w)s\b/g, '$1').replace(/\s+/g, ' ').trim();
  const byStem = new Map<string, { key: string; routes: string }[]>();
  for (const [key, routes] of Object.entries(ASSISTANCE_GEAR)) {
    const stem = dedupe(key);
    if (!byStem.has(stem)) byStem.set(stem, []);
    byStem.get(stem)!.push({ key, routes: JSON.stringify(routes) });
  }
  for (const [stem, rows] of byStem) {
    if (rows.length < 2) continue;
    const distinct = new Set(rows.map((r) => r.routes));
    assertEquals(distinct.size, 1,
      `"${stem}" is tagged two ways: ${rows.map((r) => `${r.key}=${r.routes}`).join('  vs  ')}`);
  }
});

Deno.test('the kit an athlete never declared does not reach them', () => {
  // ⛔ THE REPORTED DEFECT, AS A FIXTURE. Michael, 2026-08-26: *"we need to add to equipment list for
  // home gym, should never be just prescribed."* Every one of these needs a station or an implement
  // this home gym has not got.
  // ⚠️ THE OMISSIONS ARE THE POINT, and each was caught writing this fixture rather than assumed.
  // `cable crunch`, `cable crossover` and `pallof press` carry a BAND route as well as a cable one,
  // and this gym declared bands. `goblet squat` routes through dumbbells as well as a kettlebell.
  // A cable- or kettlebell-NAMED movement the athlete can genuinely do is not a false offer — the
  // name is not the requirement, the route is.
  for (const name of ['leg press', 'ab machine crunch', 'cable row', 'cable face pull',
                      'chest supported row', 'kettlebell swing',
                      'kettlebell press', 'kettlebell rows', 'ab rollout']) {
    assert(!reaches(name, HOME_GYM), `"${name}" reached a home gym that declared none of its kit`);
  }
});

Deno.test('and the kit they DID declare still does', () => {
  // ⚠️ THE OTHER HALF, AND THE MORE EXPENSIVE FAILURE. A false exclusion is worse than a false offer
  // — the header of `strength-gear.ts` says so, and Slice 7 was a whole reversal caused by one.
  for (const name of ['back squat', 'bench press', 'overhead press', 'deadlift', 'pullup',
                      'bent over row', 'dumbbell curls', 'toes to bar', 'band row',
                      'dumbbell walking lunge', 'pushup', 'plank hold', 'calf raise']) {
    assert(reaches(name, HOME_GYM), `"${name}" was withheld from a home gym that owns its kit`);
  }
});

Deno.test('a bodyweight athlete keeps their whole bodyweight catalogue', () => {
  // ⛔ TAGGING MUST NOT COST THE ATHLETE WITH THE LEAST. Every one of these is `ALWAYS` on purpose —
  // an answer, not an absence — and a bodyweight athlete is the reason each one is.
  const bw = ['Pull-up bar'];
  for (const name of ['air squat', 'pushup', 'pike push up', 'plank hold', 'dead bug', 'bird dog',
                      'glute bridge', 'single leg squat', 'walking lunge', 'step up', 'calf raise',
                      'side plank', 'v up', 'reverse flyes (bodyweight)', 'pullup', 'toes to bar']) {
    assert(reaches(name, bw), `"${name}" was withheld from a bodyweight athlete`);
  }
});

Deno.test('⛔ A COMMERCIAL GYM HAS BANDS AND KETTLEBELLS', () => {
  // The expansion granted "most fixed equipment" and stopped there, so `band face pulls` — tagged
  // `[['bands']]` long before this pass — was ejected from every gym member's pool. Loose is not the
  // same question as absent.
  const keys = athleteEquipmentToKeys(['Commercial gym']);
  assert(keys.has('bands'), 'a commercial gym has no bands');
  assert(keys.has('kettlebell'), 'a commercial gym has no kettlebells');
  for (const name of ['band face pulls', 'kettlebell swing', 'goblet squat', 'turkish getup']) {
    assert(canPerform(name, ['Commercial gym']), `"${name}" was withheld from a commercial gym`);
  }
});

Deno.test('the tags rank as well as gate — an untagged rival no longer wins on key order', () => {
  // ⚠️ THE QUIETER HALF OF THE DEFECT. `equipmentFitRank` has no route to read for an untagged
  // movement, so before this pass every catalogue movement tied at zero and `EXERCISE_CONFIG`'s key
  // order decided — "not a decision, an accident" (`grid.ts`). A dumbbell owner must out-rank the
  // bodyweight fallback that used to beat it.
  const db = ['Dumbbells'];
  const loaded = equipmentFitRank('dumbbell lateral raise', db);
  const fallback = equipmentFitRank('reverse flyes (bodyweight)', db);
  assert(loaded != null && fallback != null, 'a movement in this pair is still untagged');
  assert(loaded <= fallback,
    `a dumbbell owner ranks the bodyweight fallback (${fallback}) at or above the dumbbell movement (${loaded})`);
});

Deno.test('every route is spelled with a real key', () => {
  // A typo'd key is a route nothing can satisfy — the movement disappears for everyone, silently.
  const vocabulary = new Set(Object.keys(ASSISTANCE_GEAR).length ? [
    'barbell', 'rack', 'bench', 'incline_bench', 'dumbbells', 'kettlebell', 'cable', 'pull_up_bar',
    'ab_wheel', 'bands', 'box', 'rings', 'machine', 'suspension_trainer', 'stability_ball',
  ] : []);
  for (const [name, routes] of Object.entries(ASSISTANCE_GEAR)) {
    assertEquals(foldExerciseName(name), name, `"${name}" is not stored in folded form`);
    for (const route of routes) {
      for (const key of route) {
        assert(vocabulary.has(key), `"${name}" routes through "${key}", which is not a GearKey`);
      }
    }
  }
});
