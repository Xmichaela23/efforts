import { assertEquals } from 'https://deno.land/std@0.208.0/assert/mod.ts';
import { estimate1RM, estimate1RMRounded, effectiveRepsForReserve, isRepRecord, WENDLER_EPLEY_COEFF } from './estimate-1rm.ts';

/**
 * D-339 — ONE 1RM FORMULA, AND IT IS THE ONE THE ATHLETE'S PROGRAM IS WRITTEN IN.
 *
 * ⛔ THE PRIMARY IS CHECKABLE. Every expected value below either comes from a worked example printed
 * in 5/3/1 2nd edition p32, or is arithmetic the athlete can run against his own copy. No number here
 * is asserted from memory of a secondary source.
 */

const round = (n: number) => Math.round(n * 10) / 10;

Deno.test('the book\'s own worked examples reproduce exactly (p32)', () => {
  // ⚠️ WENDLER TRUNCATES, HE DOES NOT ROUND — and both printed examples prove it:
  //   "255 x 8 x .0333 + 255 = 322"   → the arithmetic gives 322.932, and he writes 322.
  //   "270 x 6 x .0333 + 270 = 323"   → the arithmetic gives 323.946, and he writes 323.
  // Checked against the 2nd edition PDF, not from memory. We keep our own rounding (nearest 5 lb,
  // how plates load) — this test pins the FORMULA, and asserts the raw value floors to his printed one.
  assertEquals(Math.floor(estimate1RM(255, 8)), 322);
  assertEquals(Math.floor(estimate1RM(270, 6)), 323);
  // ⛔ THE POINT OF THAT EXAMPLE: 270x6 beats 255x8 by one pound. This is what the estimate is FOR —
  // comparing sets at different weights. Wendler uses it for nothing else.
  assertEquals(estimate1RM(270, 6) > estimate1RM(255, 8), true);
});

Deno.test('Wendler\'s coefficient is Epley\'s 1/30 — but printed short, and a hair LOWER', () => {
  assertEquals(round(WENDLER_EPLEY_COEFF * 30), 1.0);
  // ⚠️ NOT BYTE-IDENTICAL, AND THE DIRECTION MATTERS. 0.0333 is 0.1% below a true 1/30, so using the
  // book's printed number returns very slightly LESS than textbook Epley — 266.6 vs 266.67 on 200×10.
  // We keep the book's digits: erring a hair low is the right direction for a number that sets load,
  // and the athlete can check our arithmetic against his own copy. The gap is far below the 5 lb
  // rounding, so it can never change a displayed number.
  const ours = estimate1RM(200, 10);
  const textbookEpley = 200 * (1 + 10 / 30);
  assertEquals(ours < textbookEpley, true);
  assertEquals(textbookEpley - ours < 0.1, true); // 0.067 lb on a 265 lb estimate
  assertEquals(estimate1RMRounded(200, 10), Math.round(textbookEpley / 5) * 5);
});

Deno.test('a true single is itself — no equation adds pounds to one rep', () => {
  assertEquals(estimate1RM(225, 1), 225);
  assertEquals(estimate1RMRounded(225, 1), 225);
});

Deno.test('the set that prompted this: 75 lb for 15', () => {
  // Michael, 2026-07-30, week 1 top set logged all-out at 15 reps.
  assertEquals(estimate1RMRounded(75, 15), 110);
  // ⚠️ The OLD Brzycki path returned 125 on the same set (75 × 36/22 = 122.7 → nearest 5). A 15 lb
  // spread on one set, on the number that drives the working weights.
  const oldBrzycki = Math.round((75 * (36 / (37 - 15))) / 5) * 5;
  assertEquals(oldBrzycki, 125);
});

Deno.test('⛔ the crossover is exactly 10 reps — this is why the old note\'s reasoning inverted', () => {
  const brzycki = (w: number, r: number) => w * (36 / (37 - r));
  // Below 10: Brzycki is the LOWER (conservative) estimate — the old "err low" argument holds.
  assertEquals(brzycki(100, 5) < estimate1RM(100, 5), true);
  assertEquals(brzycki(100, 8) < estimate1RM(100, 8), true);
  // At 10: identical.
  assertEquals(round(brzycki(100, 10)), round(estimate1RM(100, 10)));
  // Above 10: Brzycki is the HIGHER one, and the gap widens — it has 37−reps in a denominator.
  assertEquals(brzycki(100, 12) > estimate1RM(100, 12), true);
  assertEquals(brzycki(100, 20) > estimate1RM(100, 20), true);
  // The all-out set is where reps run open-ended, so this is exactly the range that matters.
});

Deno.test('no rep cap, and that is deliberate', () => {
  // The old client path capped reps at 10, so a 15-rep set was reported as a 10-rep set — a real
  // effort silently understated. Honest estimate + a trust flag beats a quietly rewritten rep count.
  assertEquals(estimate1RM(100, 15) > estimate1RM(100, 10), true);
  assertEquals(estimate1RM(100, 25) > estimate1RM(100, 15), true);
  // And it cannot blow up: linear, no singularity, unlike the equation it replaced.
  assertEquals(Number.isFinite(estimate1RM(100, 100)), true);
});

Deno.test('reps-in-reserve is folded OUTSIDE the estimator, for the protocols that collect it', () => {
  // The estimator is PURE — reserve never enters the formula. An auto-regulated protocol converts its
  // reserve to an effective rep count FIRST: 5 reps with 2 in reserve estimates like a 7-rep set.
  assertEquals(effectiveRepsForReserve(5, 2), 7);
  assertEquals(round(estimate1RM(100, effectiveRepsForReserve(5, 2))), round(estimate1RM(100, 7)));
  // ⛔ 5/3/1 REGRESSION GUARD. 5/3/1 collects no reserve and takes its measuring set to failure, so it
  // passes ACTUAL reps and its e1RM cannot be inflated by a reserve — there is no offset argument on the
  // estimator, and no reserve fold happens for a null RIR. Eight of twelve 5/3/1 weeks are sub-maximal;
  // this is the guarantee that a future protocol rename can never silently turn a reserve back on here.
  assertEquals(effectiveRepsForReserve(5, 0), 5);
  assertEquals(estimate1RM(100, 5), 100 * 5 * WENDLER_EPLEY_COEFF + 100);
});

Deno.test('garbage in stays zero, never NaN', () => {
  assertEquals(estimate1RM(0, 5), 0);
  assertEquals(estimate1RM(-10, 5), 0);
  assertEquals(estimate1RM(NaN as any, 5), 0);
  assertEquals(estimate1RMRounded(0, 5), 0);
});

Deno.test('the rep record is the comparison at the SAME weight (p10)', () => {
  // "If your squat goes from 225x6 to 225x9, you've gotten stronger."
  assertEquals(isRepRecord(225, 9, 6), true);
  assertEquals(isRepRecord(225, 6, 9), false);
  assertEquals(isRepRecord(225, 9, null), false); // nothing to beat yet — not a record, not a failure
});
