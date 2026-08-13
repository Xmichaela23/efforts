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

Deno.test('the rule: the prescribed rep advances, short of it is a miss', () => {
  // ⛔ RE-CUT 2026-08-12 (slice a): a logged zero is a `miss`, not a `reset` — one bad day never
  // drops the bar (p33). One rep at 95% still ADVANCES: it IS the prescription met (p23), and p24
  // calls the extra reps dominance rather than the entry fee.
  assertEquals(verdictFrom95Set(5, 'Back Squat'), 'advance');
  assertEquals(verdictFrom95Set(1, 'Back Squat'), 'advance');
  assertEquals(verdictFrom95Set(0, 'Back Squat'), 'miss');
  assertEquals(verdictFrom95Set(15, 'Back Squat'), 'advance_untrusted'); // earns the step; estimate is soft
  assertEquals(verdictFrom95Set(null), 'hold');                 // nothing logged is not a miss
});

Deno.test('a HIT walks the bar up the way Wendler says', () => {
  // Lower body, +10 a cycle. ⛔ THE 6% PERCENTAGE CAP IS GONE (2026-08-12) — Wendler gives every
  // lifter the same fixed jump regardless of training age (p90, p107).
  const wn1 = workingNumberForCycles(90, 1, true, ['advance', 'advance'], { unknownMeans: 'hold' }).workingNumber;
  const wn2 = workingNumberForCycles(90, 2, true, ['advance', 'advance'], { unknownMeans: 'hold' }).workingNumber;
  const wn3 = workingNumberForCycles(90, 3, true, ['advance', 'advance'], { unknownMeans: 'hold' }).workingNumber;
  assertEquals(wn1, 90);
  assertEquals(wn2 > wn1, true);
  assertEquals(wn3 > wn2, true);
  // ⚠️ 100, NOT 95. The cap used to shrink this light bar's step to +5; it takes the full +10 now.
  assertEquals(wn2, 100);
});

Deno.test('⛔ a CONFIRMED STALL brings it down, and the next cycle starts from there', () => {
  const hit = workingNumberForCycles(90, 2, true, ['advance'], { unknownMeans: 'hold' }).workingNumber;
  assertEquals(hit, 100);
  // ⛔ ONE MISS HOLDS (p33) — this is the half the athlete feels, and it used to drop them 10%.
  assertEquals(workingNumberForCycles(90, 2, true, ['miss'], { unknownMeans: 'hold' }).workingNumber, 90);
  // The SECOND consecutive miss is the stall (p31), and the rebuild starts from the lower number.
  const stalled = workingNumberForCycles(90, 3, true, ['miss', 'miss'], { unknownMeans: 'hold' }).workingNumber;
  assertEquals(stalled, 80);   // −10%, rounded down to plate granularity
  assertEquals(stalled < 90, true);
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

Deno.test('⛔ THERE IS NO CEILING — the bar walks past 90% of the max on file, and must', () => {
  // ⛔ INVERTS 'the ceiling binds' (2026-07-28). A working number of 90 against a 106 lb max was
  // clamped to 95 — one +5 step and then nothing, which is exactly the freeze. Wendler's brake is a
  // missed prescription (p30), not the record, so two clean advances now reach 110.
  assertEquals(
    workingNumberForCycles(90, 3, true, ['advance', 'advance'], { unknownMeans: 'hold' }).workingNumber,
    110,
  );
  // ⚠️ AND THE `oneRM` OPTION IS GONE FROM THE SIGNATURE, not merely ignored — passing it is a type
  // error, so no caller can quietly re-enable a bound that no longer exists.
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
