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
import { assertEquals } from 'https://deno.land/std@0.208.0/assert/mod.ts';
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

Deno.test('⛔ SLICE 1 IS ADDITIVE — the verdict is byte-identical with and without the all-out set', () => {
  for (const intent of ['base', 'build', 'peak', 'taper', 'recovery']) {
    const withOut = computeStrength([deadlift()], intent).per_lift[0];
    const withAll = computeStrength([deadlift({ last_all_out: ALL_OUT })], intent).per_lift[0];
    assertEquals(withAll.verdict_label, withOut.verdict_label, `verdict moved on ${intent}`);
    assertEquals(withAll.verdict_tone, withOut.verdict_tone, `tone moved on ${intent}`);
    assertEquals(withAll.suggested_weight, withOut.suggested_weight, `suggestion moved on ${intent}`);
    assertEquals(withAll.e1rm_trend, withOut.e1rm_trend, `trend moved on ${intent}`);
  }
});

Deno.test('⛔ a rep record does not silence the RIR verdict — slice 1 changes nothing it reads', () => {
  // RIR 4 against a target of 2 is "add weight" today. A rep record on the same lift must not
  // rewrite it: that reasoning change is slice 2, and it is a separate decision.
  const row = computeStrength(
    [deadlift({ current_avg_rir: 4, target_rir: 2, last_all_out: ALL_OUT })],
    'build',
  ).per_lift[0];
  assertEquals(row.verdict_label, 'add weight');
  assertEquals(row.all_out?.is_rep_record, true);
});
