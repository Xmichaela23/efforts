import { assertEquals } from 'https://deno.land/std@0.208.0/assert/mod.ts';
import { estimate1RM, estimate1RMRounded, effectiveRepsForReserve, isRepRecord, EPLEY_COEFF } from './estimate-1rm.ts';

/**
 * D-339 — ONE 1RM FORMULA, AND IT IS THE ONE THE ATHLETE'S PROGRAM IS WRITTEN IN.
 *
 * ⛔ THE PRIMARY IS CHECKABLE. Every expected value below either comes from a worked example printed
 * in the previous program, or is arithmetic the athlete can run against his own copy. No number here
 * is asserted from memory of a secondary source.
 */

const round = (n: number) => Math.round(n * 10) / 10;

Deno.test('⛔ VIADA p215: Epley and Brzycki, AVERAGED — the two are between the halves', () => {
  /**
   * ⚠️ THIS TEST PINNED THE PREVIOUS PROGRAM'S p32 EXAMPLES UNTIL 2026-08-29 and is rewritten, not deleted, so the
   * source change is visible. Michael: *"the previous program is a ghost in the machine, use viada's math."*
   * p215: the set's load and reps go through BOTH equations and the two are AVERAGED, because they
   * diverge as the rep count changes.
   */
  const epley = (w: number, r: number) => w * r * EPLEY_COEFF + w;
  const brzycki = (w: number, r: number) => w * 36 / (37 - r);
  for (const [w, r] of [[255, 8], [270, 6], [135, 10], [105, 5]] as Array<[number, number]>) {
    const got = estimate1RM(w, r);
    const lo = Math.min(epley(w, r), brzycki(w, r));
    const hi = Math.max(epley(w, r), brzycki(w, r));
    assertEquals(got >= lo && got <= hi, true, `${w}x${r}: ${got} outside [${lo}, ${hi}]`);
    assertEquals(round(got), round((epley(w, r) + brzycki(w, r)) / 2));
  }
  /**
   * ⛔⛔ AND THE PREVIOUS PROGRAM'S OWN WORKED POINT INVERTS UNDER THE AVERAGE — recorded, not hidden.
   * p32 makes 270×6 (323.9) beat 255×8 (322.9) by a pound under Epley. Brzycki reads them the other
   * way: 313.6 against 316.6. Averaged, 255×8 wins by one pound instead of losing by one.
   * ⚠️ A ONE-POUND FLIP AT THE FOURTH SIGNIFICANT FIGURE IS THE DIVERGENCE VIADA IS DESCRIBING, not
   * a defect in either equation — and it is invisible after the app's 5 lb rounding, which is the
   * only form an athlete ever sees. Pinned so nobody "restores" the old assertion as a regression.
   */
  assertEquals(estimate1RMRounded(270, 6), estimate1RMRounded(255, 8));
});

Deno.test('⛔ BRZYCKI IS DROPPED PAST 30 REPS — a singularity is not a large number', () => {
  // 36/(37 − r) runs to infinity at 37 and goes negative beyond. Above the guard the average falls
  // back to Epley alone. ⚠️ Arithmetic only — whether a long set may set a record is `trustedMaxReps`.
  const epley = (w: number, r: number) => w * r * EPLEY_COEFF + w;
  assertEquals(estimate1RM(100, 31), epley(100, 31));
  assertEquals(estimate1RM(100, 40) > 0, true);
});

Deno.test('the previous program\'s coefficient is Epley\'s 1/30 — but printed short, and a hair LOWER', () => {
  assertEquals(round(EPLEY_COEFF * 30), 1.0);
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
  // ⚠️ UPDATED 2026-08-29 FOR VIADA'S AVERAGE. Epley alone returned 110; Brzycki alone 123; the
  // average is 117.6 → 120 on the nearest five. THE ORIGINAL POINT IS UNCHANGED and is why he
  // averages: at 15 reps the two equations are 13 lb apart on one set, and picking either is a
  // choice about which way to be wrong.
  assertEquals(estimate1RMRounded(75, 15), 120);
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
  // ⛔ the previous program REGRESSION GUARD. the previous program collects no reserve and takes its measuring set to failure, so it
  // passes ACTUAL reps and its e1RM cannot be inflated by a reserve — there is no offset argument on the
  // estimator, and no reserve fold happens for a null RIR. Eight of twelve the previous program weeks are sub-maximal;
  // this is the guarantee that a future protocol rename can never silently turn a reserve back on here.
  assertEquals(effectiveRepsForReserve(5, 0), 5);
  // ⚠️ The right-hand side is now the AVERAGE (Viada p215), not Epley alone — the guarantee being
  // pinned is that no reserve reaches the estimator, which is unchanged by which equations it uses.
  assertEquals(estimate1RM(100, 5), ((100 * 5 * EPLEY_COEFF + 100) + (100 * 36 / 32)) / 2);
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
