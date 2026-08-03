/**
 * Q-254 SLICE 1 — the all-out set reaches `per_lift`, AND THE VERDICT DOES NOT MOVE.
 *
 *   ~/.deno/bin/deno test supabase/functions/_shared/response-model/weekly-strength-allout.test.ts --no-check
 *
 * ⛔ THE SECOND HALF IS THE POINT. Slice 1 is additive: it puts the measurement on the contract so
 * State can RENDER it. `computeLiftVerdict` still reads RIR, and changing what it reads is slice 2
 * (Q-254 Gap 2, Michael's ruling: *"rir arent valid anymore — 5-3-1 uses amrap"*). These fixtures
 * pin that the rendering shipped without the reasoning quietly moving underneath it.
 */
import { assert, assertEquals } from 'https://deno.land/std@0.208.0/assert/mod.ts';
import { computeStrength } from './weekly.ts';
import type { LiftAllOut, StrengthLiftSnapshot } from './types.ts';

const ALL_OUT: LiftAllOut = {
  name: 'Deadlift',
  date: '2026-07-28',
  weight: 225,
  reps: 6,
  prior_best_reps_at_weight: 5,
  is_rep_record: true,
  rep_record_window_sessions: 40,
  estimated_1rm: 270,
  estimate_trusted: false,
  estimate_trusted_max_reps: 5,
};

function deadlift(overrides: Partial<StrengthLiftSnapshot> = {}): StrengthLiftSnapshot {
  return {
    canonical_name: 'deadlift',
    display_name: 'Deadlift',
    current_e1rm: 225,
    previous_e1rm: null,
    current_avg_rir: 2,
    baseline_avg_rir: 2,
    target_rir: 2,
    sessions_in_window: 6,
    best_weight: 120,
    anchor_1rm: 150,
    last_session_date: '2026-08-01',
    spine_e1rm_direction: 'stable',
    ...overrides,
  } as StrengthLiftSnapshot;
}

Deno.test('the all-out set is carried onto per_lift verbatim', () => {
  const row = computeStrength([deadlift({ last_all_out: ALL_OUT })], 'build').per_lift[0];
  assertEquals(row.all_out, ALL_OUT);
});

Deno.test('no all-out set in the window → null, never a substitute', () => {
  const row = computeStrength([deadlift()], 'build').per_lift[0];
  assertEquals(row.all_out, null);
  // ⛔ The working weight is still on the row and it is a DIFFERENT fact. Nothing may promote it
  // into the measurement slot — that is Q-254 Gap 1 returning wearing a different hat.
  assertEquals(row.best_weight, 120);
});

// ⛔ THESE TWO TESTS WERE INVERTED BY SLICE 2 (2026-08-03), AND THAT IS THE POINT OF THEM.
//
// As written for slice 1 they asserted the verdict was BYTE-IDENTICAL with and without the all-out
// set — a deliberate guard so the rendering could ship and be seen on a device before the reasoning
// moved under it. Slice 2 is that reasoning move: `computeLiftVerdict` now reads the all-out set
// through `verdictFrom95Set`. So the guard fired exactly when it was supposed to, and the
// assertions flip rather than being deleted — the pair below now pins the NEW rule and the one
// invariant that survives both slices (no weight is written either way).
//
// Full slice-2 coverage lives in `weekly-strength-amrap-verdict.test.ts`.

Deno.test('⛔ SLICE 2 — the all-out set MOVES the verdict, and moves nothing else', () => {
  for (const intent of ['base', 'build']) {
    const withOut = computeStrength([deadlift()], intent).per_lift[0];
    const withAll = computeStrength([deadlift({ last_all_out: ALL_OUT })], intent).per_lift[0];
    // The words change — that is slice 2.
    assertEquals(withAll.verdict_label, 'top set met', `the AMRAP should decide on ${intent}`);
    assert(withAll.verdict_label !== withOut.verdict_label, `slice 2 did not fire on ${intent}`);
    // ⛔ AND NOTHING NUMERIC MOVES. The trend, the working weight and — critically — the weight
    // suggestion are untouched, so nothing can be written from this path.
    assertEquals(withAll.e1rm_trend, withOut.e1rm_trend, `trend moved on ${intent}`);
    assertEquals(withAll.best_weight, withOut.best_weight, `working weight moved on ${intent}`);
    assertEquals(withAll.suggested_weight, null, `a weight suggestion appeared on ${intent}`);
  }
  // ⚠️ THE PLAN-STATE WEEKS ARE STILL IMMUNE. Recovery / taper / peak describe the WEEK, and a stale
  // all-out set must not overwrite them — unchanged from slice 1.
  for (const intent of ['peak', 'taper', 'recovery']) {
    const withOut = computeStrength([deadlift()], intent).per_lift[0];
    const withAll = computeStrength([deadlift({ last_all_out: ALL_OUT })], intent).per_lift[0];
    assertEquals(withAll.verdict_label, withOut.verdict_label, `verdict moved on ${intent}`);
    assertEquals(withAll.suggested_weight, withOut.suggested_weight, `suggestion moved on ${intent}`);
  }
});

Deno.test('⛔ SLICE 2 — a rep record now OUTRANKS the RIR verdict', () => {
  // Inverted from slice 1, where this asserted 'add weight'. RIR 4 against a target of 2 used to
  // read "add weight" and carry a tappable weight; the all-out set is the measurement 5/3/1 is
  // built on, so it decides instead — and it carries no weight.
  const row = computeStrength(
    [deadlift({ current_avg_rir: 4, target_rir: 2, last_all_out: ALL_OUT })],
    'build',
  ).per_lift[0];
  assertEquals(row.verdict_label, 'top set met');
  assertEquals(row.suggested_weight, null, 'the RIR path used to attach a weight here');
  assertEquals(row.all_out?.is_rep_record, true);
});
