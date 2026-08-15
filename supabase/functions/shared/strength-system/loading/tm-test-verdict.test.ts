/**
 * ⛔ THE TM-TEST WEEK'S VERDICT, AND THE BLOCK-TO-BLOCK TRANSITION GATE. Work order §1d, 2026-08-15.
 *
 *   ~/.deno/bin/deno test --no-check supabase/functions/shared/strength-system/loading/tm-test-verdict.test.ts
 *
 * ⛔ WHY THIS IS A SEPARATE FILE FROM `wendler-531.test.ts`. There are now TWO measured sets in a
 * block and they answer different questions off different prescriptions:
 *
 *   `verdictFrom95Set`     week 3 of a cycle · a set at **95%** of the training max · minimum ONE rep
 *                          (2nd ed. p.23) · "did the prescription hold this cycle"
 *   `verdictFromTmTestSet` a standalone test week · a set at **100%** of it · bar of FIVE
 *                          (Forever pp.20-21) · "is the training max still the right number"
 *
 * Collapsing them is the failure this file exists to prevent: running the 95% rule over a TM-test set
 * would advance an athlete who managed one rep at their training max, and running the TM-test rule
 * over a 95% set would hold an athlete who completed the session exactly as written.
 *
 * ⚠️ FIXTURE, NOT PRODUCTION. Round invented numbers; no decision is gated on Michael's own.
 */
import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import {
  applyVerdict,
  cycleIncrementLb,
  TM_TEST_MISS_MAX_REPS,
  TM_TEST_PASS_REPS,
  verdictFrom95Set,
  verdictFromTmTestSet,
  workingNumberForCycles,
} from './wendler-531.ts';
import {
  nextBlockTrainingMax,
  testWeeksFromStoredPhases,
  tmTestResultFor,
} from './cycle-verdicts.ts';
import { trainingMaxFromSet } from '../amrap-catch-up.ts';

// ── The rule ────────────────────────────────────────────────────────────────

Deno.test('⛔ THE THREE BANDS: 5+ advances · 3-4 holds · 2 or fewer recalibrates', () => {
  assertEquals(TM_TEST_PASS_REPS, 5);
  assertEquals(TM_TEST_MISS_MAX_REPS, 2);
  assertEquals(verdictFromTmTestSet(5, 'Bench Press'), 'advance');
  assertEquals(verdictFromTmTestSet(6, 'Bench Press'), 'advance');
  assertEquals(verdictFromTmTestSet(4, 'Bench Press'), 'hold');
  assertEquals(verdictFromTmTestSet(3, 'Bench Press'), 'hold');
  assertEquals(verdictFromTmTestSet(2, 'Bench Press'), 'recalibrate');
  assertEquals(verdictFromTmTestSet(0, 'Bench Press'), 'recalibrate');
  // ⛔ A SKIPPED TEST WEEK HOLDS. No evidence is not evidence of failure (§0h) — and it must never
  // recalibrate, because there is no set to compute a new number from.
  assertEquals(verdictFromTmTestSet(null, 'Bench Press'), 'hold');
  assertEquals(verdictFromTmTestSet(undefined, 'Bench Press'), 'hold');
});

Deno.test('⛔ THE 3-REP BAR IS HIS AND IT DOES NOT APPLY HERE — ours is five, because our TM is 85%', () => {
  // Forever pp.20-21 gives two bars for the same test: 3 reps at a 90% training max, or 5 at an 85%
  // one. `WORKING_NUMBER_PCT_OF_1RM` is 0.85, so 5 is the one that governs. An athlete who hits 3 has
  // met his 90% bar against a number that is not 90% — which is exactly why 3-4 HOLDS rather than
  // advancing, and why the copy explains the difference instead of leaving it as a silent shortfall.
  assertEquals(verdictFromTmTestSet(3), 'hold');
  assertEquals(verdictFromTmTestSet(TM_TEST_PASS_REPS), 'advance');
});

Deno.test('⛔ THE TWO RULES MUST NOT BE COLLAPSED — same rep count, opposite verdicts', () => {
  // One rep: the prescription MET on a 95% set (p.23), and a wrong training max on a TM-test set.
  assertEquals(verdictFrom95Set(1, 'Bench Press'), 'advance');
  assertEquals(verdictFromTmTestSet(1, 'Bench Press'), 'recalibrate');
  // Four reps: comfortably past the 95% prescription, short of the test week's bar.
  assertEquals(verdictFrom95Set(4, 'Bench Press'), 'advance');
  assertEquals(verdictFromTmTestSet(4, 'Bench Press'), 'hold');
});

Deno.test('a big test set still advances, and the ESTIMATE is what gets the flag', () => {
  // The distrust is about the equation, never about the load — same rule as the 95% set.
  assertEquals(verdictFromTmTestSet(12, 'Bench Press'), 'advance_untrusted');
  // Deadlift's ceiling is tighter (LeSuer 1997 — the bias there has a direction).
  assertEquals(verdictFromTmTestSet(7, 'Deadlift'), 'advance_untrusted');
  assertEquals(verdictFromTmTestSet(7, 'Bench Press'), 'advance');
});

// ── What `recalibrate` does to the walker ───────────────────────────────────

Deno.test('⛔ `recalibrate` HOLDS IN `applyVerdict` — the new number is an absolute, not a delta', () => {
  assertEquals(applyVerdict(200, 'recalibrate', false), 200);
  // And it is NOT a miss: it must not count toward the two-consecutive-miss stall, or the freshly
  // computed number would be dropped another 10% on the next shortfall.
  assertEquals(
    workingNumberForCycles(200, 3, false, ['recalibrate', 'miss'], { unknownMeans: 'hold' }).workingNumber,
    200,
  );
  assertEquals(
    workingNumberForCycles(200, 3, false, ['recalibrate', 'miss'], { unknownMeans: 'hold' }).resetAtCycle,
    null,
  );
  // ⚠️ AND A REAL RUN OF MISSES STILL STALLS. The stall counter survives §1d untouched; what changed
  // is that its only supplier is now the anchor's in-cycle AMRAP.
  assertEquals(
    workingNumberForCycles(200, 3, false, ['miss', 'miss'], { unknownMeans: 'hold' }).workingNumber,
    180,
  );
});

// ── The number a recalibration produces ─────────────────────────────────────

Deno.test('⛔ THE RECOMPUTED TRAINING MAX IS 85% OF THE ESTIMATE OFF THAT SET (Forever p.21)', () => {
  // Wendler's own estimator: 200 × 2 × 0.0333 + 200 = 213.3 → 85% = 181.3 → 180 on the plate grid.
  assertEquals(trainingMaxFromSet(200, 2), 180);
  // ⛔ IT ROUNDS DOWN, like every other weight this engine writes. An overshoot authors a set the
  // athlete cannot complete; an undershoot is absorbed. The error is not symmetric.
  // ⚠️ A SINGLE IS NOT ESTIMATED — `estimate1RM` returns the weight itself for one rep ("a true
  // single IS the max"), so 200×1 gives 85% of 200 = 170, not 85% of an inflated 206.
  assertEquals(trainingMaxFromSet(200, 1), 170);
  // Junk in is 0 out — a malformed log must never break a transition.
  assertEquals(trainingMaxFromSet(0, 5), 0);
  assertEquals(trainingMaxFromSet(200, 0), 0);
  assertEquals(trainingMaxFromSet(NaN as never, 5), 0);
});

Deno.test('⛔ A RECALIBRATION COMES DOWN FAR ENOUGH TO BE LIFTABLE, in one step', () => {
  // The case the band exists for: a 200 lb training max the athlete can only double. The old
  // machinery would hold it, then drop it 10% two months later, then again. This lands in one week
  // on the number the set actually showed.
  const tm = trainingMaxFromSet(200, 2);
  assertEquals(tm < 200, true, `a recalibration must come down: ${tm}`);
  assertEquals(tm >= 170, true, `and not overshoot into a different programme: ${tm}`);
});

// ── The transition gate ─────────────────────────────────────────────────────

const FOREVER_12_CONFIG = {
  phase_structure: {
    phases: [
      { name: 'TM Test', start_week: 1, end_week: 1 },
      { name: 'Leader', start_week: 2, end_week: 4 },
      { name: 'Leader', start_week: 5, end_week: 7 },
      { name: 'Deload', start_week: 8, end_week: 8 },
      { name: 'Anchor', start_week: 9, end_week: 11 },
      { name: 'TM Test', start_week: 12, end_week: 12 },
    ],
  },
};

const loggedTest = (week: number, name: string, weight: number, reps: number) => ({
  week_number: week,
  strength_exercises: [{ name, sets: [{ weight, reps, amrap: true, completed: true }] }],
});

Deno.test('the test weeks are read off the stored structure, not assumed', () => {
  assertEquals(testWeeksFromStoredPhases(FOREVER_12_CONFIG), [1, 12]);
  // ⚠️ A BLOCK BUILT BEFORE 2026-08-15 HAS NONE, and that is the honest answer — the gate simply
  // does not fire for it and the next block derives from the 1RM on file, exactly as it did.
  assertEquals(testWeeksFromStoredPhases({ phase_structure: { phases: [{ name: 'Anchor', start_week: 1 }] } }), []);
  assertEquals(testWeeksFromStoredPhases(null), []);
});

Deno.test('⛔ WEEK 12 DECIDES WHERE THE NEXT BLOCK STARTS — SPEC §1b, paid', () => {
  const rows = [loggedTest(12, 'Bench Press', 200, 6)];
  const result = tmTestResultFor(rows, 12, 'Bench Press')!;
  assertEquals(result.verdict, 'advance');
  assertEquals(result.trainingMax, undefined, 'an advance is a step, not an absolute');
  // Upper body: one step is +5.
  assertEquals(nextBlockTrainingMax(200, false, result), 200 + cycleIncrementLb(false));
  // Lower body: +10.
  assertEquals(nextBlockTrainingMax(300, true, tmTestResultFor([loggedTest(12, 'Back Squat', 300, 5)], 12, 'Back Squat')),
    300 + cycleIncrementLb(true));
});

Deno.test('⛔ THREE OR FOUR REPS HOLDS THE NUMBER — it does not advance and it does not drop', () => {
  const result = tmTestResultFor([loggedTest(12, 'Bench Press', 200, 4)], 12, 'Bench Press')!;
  assertEquals(result.verdict, 'hold');
  assertEquals(nextBlockTrainingMax(200, false, result), 200);
});

Deno.test('⛔ TWO OR FEWER REPLACES THE NUMBER WITH ONE COMPUTED OFF THE SET', () => {
  const result = tmTestResultFor([loggedTest(12, 'Bench Press', 200, 2)], 12, 'Bench Press')!;
  assertEquals(result.verdict, 'recalibrate');
  assertEquals(result.trainingMax, trainingMaxFromSet(200, 2));
  assertEquals(nextBlockTrainingMax(200, false, result), trainingMaxFromSet(200, 2));
  // ⛔ AND IT REPLACES THE −10% STALL DROP FOR THIS EVENT. 200 × 0.9 = 180 happens to coincide here;
  // what matters is the MECHANISM — the number comes from the athlete's set, not from a percentage.
  assertEquals(nextBlockTrainingMax(200, false, result) !== 200, true);
});

Deno.test('⛔ A SKIPPED TEST WEEK HOLDS — no evidence, no move', () => {
  assertEquals(tmTestResultFor([], 12, 'Bench Press'), null);
  assertEquals(nextBlockTrainingMax(200, false, null), 200);
  // A logged session that never reached the all-out set is the same answer.
  assertEquals(
    tmTestResultFor([{ week_number: 12, strength_exercises: [{ name: 'Bench Press', sets: [{ weight: 140, reps: 5 }] }] }], 12, 'Bench Press'),
    null,
  );
});

Deno.test('⛔ A PREFILLED SET IS THE PRESCRIPTION, NOT A RESULT (D-204)', () => {
  // The logger prefills every prescribed set including the AMRAP. Reading a prefill would hand the
  // prescription back as the performance — the plan grading its own homework.
  const prefilled = [{
    week_number: 12,
    strength_exercises: [{ name: 'Bench Press', sets: [{ weight: 200, reps: 5, amrap: true, prefilled: true }] }],
  }];
  assertEquals(tmTestResultFor(prefilled as never, 12, 'Bench Press'), null);
});

Deno.test('a repeated test week resolves to the LAST performed set', () => {
  const rows = [
    loggedTest(12, 'Bench Press', 200, 2),   // a bad first attempt
    loggedTest(12, 'Bench Press', 200, 6),   // the redo
  ];
  assertEquals(tmTestResultFor(rows, 12, 'Bench Press')!.verdict, 'advance');
});

Deno.test('the gate refuses junk rather than writing a zero training max', () => {
  assertEquals(nextBlockTrainingMax(0, false, null), 0);
  assertEquals(nextBlockTrainingMax(NaN as never, false, null), 0);
  // A `recalibrate` whose computed number came out at 0 falls back to holding, never to zeroing.
  assertEquals(nextBlockTrainingMax(200, false, { week: 12, verdict: 'recalibrate', trainingMax: 0 }), 200);
});
