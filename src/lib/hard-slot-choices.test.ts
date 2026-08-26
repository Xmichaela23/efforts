// ============================================================================
// THE TWO HARD CARDS NEVER OFFER ONE SHAPE TWICE — the client half of Michael's 2026-08-26 ruling.
//
// ⛔ THE ENGINE HALF IS `sport-slots.ts` `applyVariantPicks`, tested in `standing-plan-sports.test.ts`.
// Two halves on purpose: the card stops it being ASKED for, the engine stops it being BUILT when a
// payload arrives from a client that never greyed anything.
//
// Run: deno test --no-check -A src/lib/hard-slot-choices.test.ts
// ============================================================================

import { assert, assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { slotFamilyFor, slotVariantOptions, variantsTakenBy } from './hard-slot-choices.ts';

Deno.test('⛔ ON THE BIKE BOTH HARD SLOTS ARE ONE FAMILY — which is why the rule has to exist', () => {
  /**
   * ⛔ p246 gives the two hard slots different RUN families, and `RIDE_EQUIVALENT` collapses both to
   * `ride_sweet_spot`. So the two cards offer an identical list on the bike and can build the same
   * session twice; on the run they cannot. This is the fact the whole feature turns on, asserted
   * rather than assumed — if a future frame splits the ride families, the greying becomes a no-op
   * there too and this test says so first.
   */
  assertEquals(slotFamilyFor('hard1', 'run'), 'run_mlss');
  assertEquals(slotFamilyFor('hard2', 'run'), 'run_near_threshold');
  assertEquals(slotFamilyFor('hard1', 'ride'), slotFamilyFor('hard2', 'ride'));
});

Deno.test('a shape held by the other card is reported as taken — on the bike, and only there', () => {
  const takenOnBike = variantsTakenBy('hard2', 'ride', { key: 'hard1', sport: 'ride', archetype: 'long' });
  assertEquals(takenOnBike, ['long']);

  // ⚠️ DIFFERENT FAMILIES CANNOT COLLIDE. Two run slots share no archetype ids, and a family-blind
  // version of this rule would grey out a row that was never in conflict.
  assertEquals(variantsTakenBy('hard2', 'run', { key: 'hard1', sport: 'run', archetype: 'surge_float' }), []);
  // ⚠️ MIXED SPORTS ARE ALSO DIFFERENT FAMILIES.
  assertEquals(variantsTakenBy('hard2', 'ride', { key: 'hard1', sport: 'run', archetype: 'descending' }), []);
  // ⚠️ NOTHING TO TAKE: no sport answered, no shape picked, or the slot asked about itself.
  assertEquals(variantsTakenBy('hard2', 'ride', { key: 'hard1', sport: null, archetype: 'long' }), []);
  assertEquals(variantsTakenBy('hard2', 'ride', { key: 'hard1', sport: 'ride' }), []);
  assertEquals(variantsTakenBy('hard1', 'ride', { key: 'hard1', sport: 'ride', archetype: 'long' }), []);
  assertEquals(variantsTakenBy('hard2', 'ride', null), []);
});

Deno.test('⛔ A CARD IS NEVER LEFT WITH NOTHING TO PICK', () => {
  /**
   * ⛔ THE GREYING TAKES AT MOST ONE ROW, and the other card can only ever hold one shape — so a
   * list of four loses one and "Engine's pick" is never greyed at all (it is the absence of a shape,
   * not a shape). A card with no available answer would be a dead end the athlete cannot leave.
   */
  for (const sport of ['run', 'ride'] as const) {
    for (const key of ['hard1', 'hard2'] as const) {
      const all = slotVariantOptions(key, sport);
      const other = key === 'hard1' ? 'hard2' : 'hard1';
      for (const v of all) {
        const taken = variantsTakenBy(key, sport, { key: other, sport, archetype: v.id });
        const left = all.filter((x) => !taken.includes(x.id));
        assert(left.length >= 1, `${key}/${sport} left no shape when ${v.id} was taken`);
        assert(taken.length <= 1, `${key}/${sport} greyed more than one row: ${taken.join(',')}`);
      }
    }
  }
});
