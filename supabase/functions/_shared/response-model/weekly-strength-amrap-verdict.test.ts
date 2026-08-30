/**
 * Q-254 SLICE 2 — THE VERDICT READS THE ALL-OUT SET, AND NO WEIGHT MOVES.
 *
 *   ~/.deno/bin/deno test supabase/functions/_shared/response-model/weekly-strength-amrap-verdict.test.ts --no-check
 *
 * Two changes, one fixture file, because they are two halves of one bug:
 *
 *   2a  A the previous program lift was judged against a RIR target its own protocol says does not exist
 *       (`strength_primary` is `usesRir: false`), and the RIR it was compared to was often the
 *       SESSION-WIDE average — which is to say, the accessories'. That produced "add weight" /
 *       "back off weight" with a tappable weight suggestion behind it.
 *   2b  The signal the previous program actually uses — reps on the all-out top set — reaches this function now
 *       (slice 1 put it on `per_lift`) and decides the words instead.
 *
 * ⛔ THE LAST TEST IN THIS FILE IS THE ONE THAT MATTERS. A verdict label is not cosmetic: it feeds
 * `computeSuggestedWeight`, whose number makes the State row tappable, and that tap writes a
 * `plan_adjustments` row and re-materializes the plan. Any label this file can emit must therefore
 * be one that yields NO suggestion, or slice 2 would move a live prescribed weight.
 */
import { assert, assertEquals } from 'https://deno.land/std@0.208.0/assert/mod.ts';
import { computeLiftVerdict, computeStrength, computeSuggestedWeight } from './weekly.ts';
import type { LiftAllOut, StrengthLiftSnapshot } from './types.ts';
import { protocolUsesRir, resolveProfile, getTargetRir } from '../strength-profiles.ts';

function allOut(reps: number, name = 'Bench Press'): LiftAllOut {
  return {
    name, date: '2026-08-03', weight: 190, reps,
    prior_best_reps_at_weight: 5, is_rep_record: reps > 5,
    rep_record_window_sessions: 40, estimated_1rm: 240,
    estimate_trusted: reps <= 8, estimate_trusted_max_reps: 8,
  };
}

function lift(over: Partial<StrengthLiftSnapshot> = {}): StrengthLiftSnapshot {
  return {
    canonical_name: 'bench_press', display_name: 'Bench Press',
    current_e1rm: 200, previous_e1rm: null,
    current_avg_rir: 2, baseline_avg_rir: 2, target_rir: 2,
    sessions_in_window: 6, best_weight: 185, anchor_1rm: 225,
    last_session_date: '2026-08-03', spine_e1rm_direction: 'stable',
    ...over,
  } as StrengthLiftSnapshot;
}

// ── 2a ────────────────────────────────────────────────────────────────────────────────────────

Deno.test('⛔ 2a — a protocol that does not use RIR gets no RIR target', () => {
  const fiveThreeOne = resolveProfile('strength_primary');
  assertEquals(protocolUsesRir(fiveThreeOne), false, 'strength_primary declares usesRir: false');

  // ⚠️ `getTargetRir` STILL RETURNS A NUMBER — deliberately unchanged. Its own docblock forbids
  // making it nullable: ~a dozen callers, and one that forgot the null check would read 0, which
  // means "grind to failure". The gate lives at the STAMP SEAM (`coach/index.ts`), which is where
  // `protocolUsesRir` was built to be asked.
  assertEquals(typeof getTargetRir(fiveThreeOne, 'bench_press'), 'number');

  // What the coach now stamps, transcribed:
  const stamped = protocolUsesRir(fiveThreeOne) ? getTargetRir(fiveThreeOne, 'bench_press') : null;
  assertEquals(stamped, null);
});

Deno.test('⛔ 2a — a main lift carrying only ACCESSORY RIR shows no command', () => {
  // The live shape: the lift logged no reserve of its own, so `current_avg_rir` fell back to the
  // session-wide average (the accessories'), and target_rir was the profile default of 2. A
  // deviation of -1.5 cleared the BACK_OFF band and printed a red command with a weight behind it.
  const before = computeLiftVerdict(0.5, 2, 'stable', 'build', 'bench_press', 225, 185);
  assertEquals(before.label, 'back off weight', 'this is what shipped — the bug, pinned');
  assert(computeSuggestedWeight(before.label, 185, 'bench_press', 225) != null, 'and it carried a weight');

  // After 2a the target is null, so the same accessory RIR reaches the no-reserve branch.
  const after = computeLiftVerdict(0.5, null, 'stable', 'build', 'bench_press', 225, 185);
  assertEquals(after.label, 'holding steady');
  assertEquals(computeSuggestedWeight(after.label, 185, 'bench_press', 225), null, 'and no weight');
});

Deno.test('2a — a protocol that DOES use RIR is untouched', () => {
  // The gate is one protocol. Durability and the rest keep their targets and their commands.
  const durability = resolveProfile('durability');
  assertEquals(protocolUsesRir(durability), true);
  const v = computeLiftVerdict(3.5, 2, 'stable', 'build', 'bench_press', 225, 185);
  assertEquals(v.label, 'add weight', 'RIR protocols still coach off RIR');
});

// ── 2b ────────────────────────────────────────────────────────────────────────────────────────

Deno.test('⛔ 2b — the all-out set decides, per the book', () => {
  // wendler-531.ts:454 — 0 reps is the book's reset trigger; 1+ meets "95% x 1 or more".
  assertEquals(computeLiftVerdict(null, null, 'stable', 'build', 'bench_press', null, null, allOut(0)).label,
    'top set missed');
  assertEquals(computeLiftVerdict(null, null, 'stable', 'build', 'bench_press', null, null, allOut(1)).label,
    'top set met', 'one rep IS the prescription met');
  assertEquals(computeLiftVerdict(null, null, 'stable', 'build', 'bench_press', null, null, allOut(6)).label,
    'top set met');

  // ⛔ A BIG SET DOES NOT WITHHOLD THE ADVANCE (wendler-531.ts:448-452). `advance_untrusted` is about
  // the e1RM estimate, not the training — it must read the same as `advance`.
  assertEquals(computeLiftVerdict(null, null, 'stable', 'build', 'bench_press', null, null, allOut(14)).label,
    'top set met');
});

Deno.test('2b — no all-out set falls through to the existing trend words', () => {
  // `hold` means no evidence, not a status. The row keeps saying what it said before.
  assertEquals(computeLiftVerdict(null, null, 'improving', 'build', 'bench_press', null, null, null).label,
    'getting stronger');
  assertEquals(computeLiftVerdict(null, null, 'declining', 'build', 'bench_press', null, null, null).label,
    'strength slipping');
});

Deno.test('⛔ 2b — the AMRAP outranks RIR, but never the WEEK', () => {
  // The whole of Q-254 Gap 2: reps at a known percentage beat a self-reported reserve.
  const amrapWins = computeLiftVerdict(0.5, 2, 'stable', 'build', 'bench_press', 225, 185, allOut(8));
  assertEquals(amrapWins.label, 'top set met', 'the measurement beats the proxy');

  // ⚠️ But a deload week is a statement about the WEEK. A stale all-out set from an earlier week
  // must not overwrite it.
  assertEquals(computeLiftVerdict(null, null, 'stable', 'recovery', 'bench_press', null, null, allOut(8)).label,
    'lighter this week');
  assertEquals(computeLiftVerdict(null, null, 'stable', 'taper', 'bench_press', null, null, allOut(0)).label,
    'maintain');
});

Deno.test('2b — an accessory is still silent, all-out set or not', () => {
  // The D-373 gate runs first. An accessory has no coached language in either direction.
  assertEquals(computeLiftVerdict(null, null, 'stable', 'build', 'hip_thrust', null, null, allOut(8)).label, '');
});

Deno.test('2b — it reaches per_lift end to end', () => {
  const row = computeStrength([lift({ target_rir: null, last_all_out: allOut(8) })], 'build').per_lift[0];
  assertEquals(row.verdict_label, 'top set met');
  assertEquals(row.all_out?.reps, 8, 'and the measurement itself is still carried for the card');
});

// ── THE SAFETY PROOF ──────────────────────────────────────────────────────────────────────────

Deno.test('⛔ NO LABEL SLICE 2 CAN EMIT WRITES A WEIGHT', () => {
  // The chain: verdict_label → computeSuggestedWeight → suggested_weight → the row becomes tappable
  // → StrengthAdjustmentModal inserts a `plan_adjustments` row and re-materializes the plan. If any
  // all-out label yielded a number, slice 2 would move a live prescribed weight. None may.
  for (const reps of [0, 1, 3, 5, 8, 9, 14, 25]) {
    const v = computeLiftVerdict(null, null, 'stable', 'build', 'bench_press', 225, 185, allOut(reps));
    assertEquals(
      computeSuggestedWeight(v.label, 185, 'bench_press', 225), null,
      `'${v.label}' (from ${reps} reps) produced a weight suggestion`,
    );
  }
  // And through the full contract, where `suggested_weight` is what the client actually reads.
  for (const reps of [0, 5, 14]) {
    const row = computeStrength([lift({ target_rir: null, last_all_out: allOut(reps) })], 'build').per_lift[0];
    assertEquals(row.suggested_weight, null, `${reps} reps made the row tappable`);
  }
});

Deno.test('⛔ THE WORKING NUMBER IS NOT RECOMPUTED FROM THE AMRAP', () => {
  // the previous program keeps the +5/+10 increment; reps are feedback, not an input (wendler-531.ts:206-208).
  // A 25-rep set and a 1-rep set produce the SAME row apart from the words — no number moves.
  const big = computeStrength([lift({ target_rir: null, last_all_out: allOut(25) })], 'build').per_lift[0];
  const small = computeStrength([lift({ target_rir: null, last_all_out: allOut(1) })], 'build').per_lift[0];
  assertEquals(big.verdict_label, small.verdict_label);
  assertEquals(big.best_weight, small.best_weight);
  assertEquals(big.suggested_weight, small.suggested_weight);
  assertEquals(big.e1rm_current, small.e1rm_current);
});
