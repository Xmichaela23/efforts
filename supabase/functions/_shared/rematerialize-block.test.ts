import { assertEquals } from 'https://deno.land/std@0.208.0/assert/mod.ts';
import {
  verdictFrom95Set,
  workingNumberForCycles,
  setsForWeek,
  weightForSet,
} from '../shared/strength-system/loading/wendler-531.ts';

/**
 * REMATERIALIZE — the all-out reps moving the weight (Q-226, 2026-07-30).
 *
 * ⛔ NOTHING NEW IS COMPUTED BY THAT FUNCTION. It wires together four pieces that were built, tested
 * and never called. What is pinned here is the BEHAVIOUR THE ATHLETE SEES: what a hit does, what a
 * miss does, and — most important — that a block with nothing logged does not move.
 */

Deno.test('the rule: five at 95% advances, short of it resets', () => {
  assertEquals(verdictFrom95Set(5, 'Back Squat'), 'advance');
  assertEquals(verdictFrom95Set(1, 'Back Squat'), 'advance');   // one rep IS the prescription met (p23)
  assertEquals(verdictFrom95Set(0, 'Back Squat'), 'reset');
  assertEquals(verdictFrom95Set(15, 'Back Squat'), 'advance_untrusted'); // earns the step; estimate is soft
  assertEquals(verdictFrom95Set(null), 'hold');                 // nothing logged is not a miss
});

Deno.test('a HIT walks the bar up the way Wendler says', () => {
  // Lower body, +10 a cycle, capped at 6% of the working number.
  const wn1 = workingNumberForCycles(90, 1, true, ['advance', 'advance'], { unknownMeans: 'hold' }).workingNumber;
  const wn2 = workingNumberForCycles(90, 2, true, ['advance', 'advance'], { unknownMeans: 'hold' }).workingNumber;
  const wn3 = workingNumberForCycles(90, 3, true, ['advance', 'advance'], { unknownMeans: 'hold' }).workingNumber;
  assertEquals(wn1, 90);
  assertEquals(wn2 > wn1, true);
  assertEquals(wn3 > wn2, true);
  // ⚠️ On a 90 lb bar Wendler's +10 is 11% a cycle, out of the range he wrote for, so the 6% cap binds.
  assertEquals(wn2, 95);
});

Deno.test('⛔ a MISS brings it down, and the next cycle starts from there', () => {
  const hit = workingNumberForCycles(90, 2, true, ['advance'], { unknownMeans: 'hold' }).workingNumber;
  const miss = workingNumberForCycles(90, 2, true, ['reset'], { unknownMeans: 'hold' }).workingNumber;
  assertEquals(hit, 95);
  assertEquals(miss, 80);   // −10%, rounded down to plate granularity
  assertEquals(miss < 90, true);
});

Deno.test('⛔ NOTHING LOGGED MEANS NOTHING MOVES — this is the one that must not be wrong', () => {
  // Michael, 2026-07-27: *"A missing signal is not evidence of progress."* An empty block must not
  // walk the bar up on the calendar, which is the entire bug this closes (Q-223).
  const noEvidence = workingNumberForCycles(90, 3, true, ['hold', 'hold'], { unknownMeans: 'hold' }).workingNumber;
  assertEquals(noEvidence, 90);
  // And an absent verdict array behaves the same, because `unknownMeans` is 'hold' on this path.
  assertEquals(workingNumberForCycles(90, 3, true, undefined, { unknownMeans: 'hold' }).workingNumber, 90);
});

Deno.test('the FORECAST exception belongs to a fresh block, not to this one', () => {
  // A brand-new twelve-week plan projects three cycles with no evidence possible; flattening it would
  // show identical weights in cycles 1, 2 and 3. That caller passes 'advance' explicitly.
  assertEquals(workingNumberForCycles(90, 3, true, undefined, { unknownMeans: 'advance' }).workingNumber > 90, true);
});

Deno.test('the ceiling binds — the bar cannot walk past 90% of the max on file', () => {
  // Working number 90 against a 106 lb max: the ceiling is 90% of 106 = 95.
  const capped = workingNumberForCycles(90, 3, true, ['advance', 'advance'], { oneRM: 106, unknownMeans: 'hold' }).workingNumber;
  assertEquals(capped, 95);
  // ⚠️ Without the ceiling the same input keeps climbing.
  assertEquals(workingNumberForCycles(90, 3, true, ['advance', 'advance'], { unknownMeans: 'hold' }).workingNumber, 100);
});

Deno.test('the rewritten weights are the composer\'s own arithmetic', () => {
  // Anchor week 3 at a 95 lb working number: 75/85/95% of it, rounded down to plates.
  const spec = setsForWeek('anchor', 3);
  const weights = spec.map((s) => weightForSet(95, s.pct));
  assertEquals(weights, [70, 80, 90]);
  assertEquals(spec[2].amrap, true);
  // ⛔ A rewrite that invented its own ramp would be a different programme. Same functions, always.
});

Deno.test('a deload week is rewritten as a deload, not as work', () => {
  const spec = setsForWeek('anchor', 4);
  assertEquals(spec.map((s) => s.pct), [0.40, 0.50, 0.60]);
  assertEquals(spec.some((s) => s.amrap), false);
});
