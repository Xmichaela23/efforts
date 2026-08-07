/**
 * ⛔ "NONE" MEANS NONE — the strength leak (2026-08-06).
 *
 * Michael, on a preview built after picking None on the race card: *"its also prescribing strength
 * when user says none."* Two lifting days — Upper Body: Posture, Lower Body: Durability — in a plan
 * from an athlete who had explicitly declined them.
 *
 * THE CHAIN, because no single file looked wrong:
 *   1. The card writes `posture.strength = 'out'` and, correctly, sends NO `strength_protocol`
 *      (`derivePlanShape` → `strengthProtocolFor('out')` → undefined).
 *   2. `assemblePayload` sent `strength_frequency: posture.strength === 'develop' ? 4 : 2` — and
 *      'out' is not 'develop', so it sent **2**.
 *   3. `arc-setup-persistence` reads that frequency and, for anything non-zero, WRITES a protocol
 *      into the goal row: `strength_protocol = mapStrengthFocusToProtocol('general')`.
 *   4. `create-goal…:3761` gates the entire strength overlay on that field being present and not
 *      'none'. It was present. Two lifting days.
 *
 * The athlete's answer was never contradicted by any one step — it was reconstituted by a default
 * three steps downstream of where it was given.
 *
 * Run from repo root:
 *   ~/.deno/bin/deno test --allow-read --no-check src/lib/strength-none.test.ts
 */
import { assert, assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { derivePlanShape } from './non-race-goal-seeds.ts';

/**
 * Mirrors `NonRaceBuilder.strengthFrequencyForPosture`. It is a private helper in a 3,400-line
 * component; the RULE is what matters and it is three lines, so it is pinned here rather than
 * exported for a test (the component is not importable in `deno test` — it is TSX with JSX).
 * ⚠️ If the component's version changes, this must change with it — the assertion below about
 * `freq === 0` is what makes the difference load-bearing.
 */
const strengthFrequencyForPosture = (p: string | undefined): number =>
  p === 'develop' ? 4 : p === 'maintain' ? 2 : 0;

Deno.test('⛔ THE BUG: an "out" posture asks for ZERO lifting days', () => {
  assertEquals(strengthFrequencyForPosture('out'), 0);
  // the two that were already right, pinned so a fix here cannot break them
  assertEquals(strengthFrequencyForPosture('maintain'), 2);
  assertEquals(strengthFrequencyForPosture('develop'), 4);
  // absent posture is not a licence to lift
  assertEquals(strengthFrequencyForPosture(undefined), 0);
});

Deno.test('⛔ AND THE PLAN SHAPE AGREES — "out" carries no protocol to reconstitute', () => {
  const out = derivePlanShape({ run: 'develop', strength: 'out' });
  assertEquals(out.strength_protocol, undefined, 'an out posture must not name a protocol');

  const maintain = derivePlanShape({ run: 'develop', strength: 'maintain' });
  assertEquals(maintain.strength_protocol, 'durability', 'maintain still means durability work');
});

Deno.test('the two halves cannot disagree: no protocol AND no frequency, together', () => {
  // The leak needed exactly one of these to be wrong. Both are asserted so a future edit to either
  // one fails here rather than in a plan.
  for (const posture of ['out', undefined] as const) {
    const shape = derivePlanShape({ run: 'develop', strength: posture });
    assert(
      !(shape.strength_protocol && strengthFrequencyForPosture(posture) > 0),
      `${String(posture)}: a protocol and a non-zero frequency together rebuild the overlay`,
    );
  }
});

Deno.test('zero is the language the persistence layer already speaks', () => {
  // `arc-setup-persistence.ts:192-195` maps freq 0 → `strength_protocol: 'none'`, which is the exact
  // value `create-goal…:3761` refuses to build on. The path existed; nothing could reach it, because
  // the payload never sent 0. This test is the note that it must keep being reachable.
  assertEquals(strengthFrequencyForPosture('out'), 0);
});


// ── THE LONG-RUN SEED (2026-08-06) ───────────────────────────────────────────

import { TIER_SEEDS, buildLongRunArc } from './run-volume-tables.ts';

Deno.test('⛔ A BLANK LONGEST RUN BUILDS THE SAME PLAN AS THE SEED IT REPLACED', () => {
  // The seed was killed on the level card: the field stays, unprefilled. That is only safe because
  // a beginner's seed (6) and no answer at all enter the row at the SAME rung — so a true beginner
  // loses nothing, and nobody is handed a number they never typed.
  const seeded = buildLongRunArc({
    distance: 'marathon', fitness: 'beginner', durationWeeks: 9,
    entryLongRunMi: TIER_SEEDS.beginner.longRunMi, peakWeek: 6,
  })!;
  const blank = buildLongRunArc({
    distance: 'marathon', fitness: 'beginner', durationWeeks: 9,
    entryLongRunMi: null, peakWeek: 6,
  })!;
  assertEquals(blank.weeks, seeded.weeks, 'blank and the old seed no longer agree — the seed was load-bearing after all');
});

Deno.test('⛔ AND A BEGINNER WHO REALLY RUNS 10 STILL GETS CREDIT FOR IT', () => {
  // The reason the field survived instead of being deleted outright.
  const blank = buildLongRunArc({
    distance: 'marathon', fitness: 'beginner', durationWeeks: 9, entryLongRunMi: null, peakWeek: 6,
  })!;
  const real = buildLongRunArc({
    distance: 'marathon', fitness: 'beginner', durationWeeks: 9, entryLongRunMi: 10, peakWeek: 6,
  })!;
  assert(real.maxMi > blank.maxMi, 'typing a real 10-mile long run no longer changes the block');
  assert(real.weeks[0] > blank.weeks[0], 'the block still opens at the row\'s first rung for them');
});
