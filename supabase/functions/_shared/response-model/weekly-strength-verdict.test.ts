/**
 * Strength verdict / suggested-weight fixtures — the "125→115 · back off" acceptance-fail (2026-07-02).
 *
 * Run from repo root:
 *   deno test supabase/functions/_shared/response-model/weekly-strength-verdict.test.ts --no-check
 *
 * REGRESSION intent (Q-107 H1, D-231): the coach's per-lift row rendered "Bench 125 → 115 · back off".
 * That pair is `best_weight (125) → suggested_weight (best×0.9 = 115)` with a PURELY RIR-driven verdict
 * (`rir − targetRir ≤ -1`), and the athlete's TYPED 1RM (150) never entered the math — baseline-blind.
 * The first test below CAPTURES that repro (current behavior with no anchor). The anchor-aware tests
 * assert the D-231 minimal fix: when a typed anchor exists and the working weight sits well under it,
 * the row consults the anchor (de-alarmed tone) and carries `anchor_1rm` so the client can render a
 * self-explanatory row. Accessories (no typed anchor) keep the current behavior unchanged.
 */

import { assert, assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { computeStrength } from './weekly.ts';
import type { StrengthLiftSnapshot } from './types.ts';

// A bench snapshot that triggers a RIR-driven "back off" (deviation = 1 - 3 = -2 ≤ -1), best set 125.
function benchBackOff(anchor?: number | null): StrengthLiftSnapshot {
  return {
    canonical_name: 'bench_press',
    display_name: 'Bench Press',
    current_e1rm: 125,
    previous_e1rm: null,
    current_avg_rir: 1,
    baseline_avg_rir: 3,
    target_rir: 3,
    sessions_in_window: 4,
    best_weight: 125,
    ...(anchor !== undefined ? { anchor_1rm: anchor } : {}),
  } as StrengthLiftSnapshot;
}

// ── REPRO — current behavior, NO typed anchor (also the accessory / gap-fill case) ────────────────
Deno.test('REPRO[125→115]: RIR-only back-off, suggested = best×0.9, no anchor consulted', () => {
  const res = computeStrength([benchBackOff(null)], 'build');
  const bench = res.per_lift[0];
  assertEquals(bench.verdict_label, 'back off weight');
  assertEquals(bench.verdict_tone, 'caution');
  assertEquals(bench.best_weight, 125);
  assertEquals(bench.suggested_weight, 115); // 125 * 0.9 = 112.5 → /5 round → 115
  assertEquals(bench.anchor_1rm ?? null, null); // baseline-blind: the typed 150 never entered
});

// ── FIXED — accessory / gap-fill (no typed anchor) keeps CURRENT behavior exactly ─────────────────
Deno.test('accessory (no anchor): behavior unchanged — still RIR back-off to 115, anchor null', () => {
  const hipThrust: StrengthLiftSnapshot = {
    canonical_name: 'hip_thrust', display_name: 'Hip Thrust',
    current_e1rm: 225, previous_e1rm: null,
    current_avg_rir: 1, baseline_avg_rir: 3, target_rir: 3,
    sessions_in_window: 4, best_weight: 225, anchor_1rm: null,
  } as StrengthLiftSnapshot;
  const res = computeStrength([hipThrust], 'build');
  const l = res.per_lift[0];
  assertEquals(l.verdict_label, 'back off weight');
  assertEquals(l.verdict_tone, 'caution');
  assertEquals(l.suggested_weight, 205); // 225*0.9=202.5 → /5 round → 205
  assertEquals(l.anchor_1rm ?? null, null);
});

// ── FIXED — typed anchor 150 present: the repro FLIPPED to expected output ─────────────────────────
Deno.test('FLIPPED[anchor 150]: working 125 vs 150 baseline → de-alarmed, anchor carried, still suggests 115', () => {
  const res = computeStrength([benchBackOff(150)], 'build');
  const bench = res.per_lift[0];
  // The typed anchor is now CARRIED on the row so the client can render a self-explanatory string.
  assertEquals(bench.anchor_1rm, 150);
  // Working 125 is ≤90% of the 150 anchor → clear headroom → the RIR back-off is NOT an alarm.
  assertEquals(bench.verdict_tone, 'neutral');
  // The suggested working weight is still a sane target (unchanged number), bounded below the anchor.
  assertEquals(bench.suggested_weight, 115);
  assert(bench.suggested_weight! < bench.anchor_1rm!, 'suggestion must stay below the tested 1RM');
});

// ── FIXED — near-max working weight vs anchor keeps the alarm (headroom guard is not a blanket mute) ─
Deno.test('near-max[anchor 150]: working 145 vs 150 → little headroom → back-off alarm preserved', () => {
  const nearMax = { ...benchBackOff(150), best_weight: 145, current_e1rm: 145 } as StrengthLiftSnapshot;
  const res = computeStrength([nearMax], 'build');
  const bench = res.per_lift[0];
  assertEquals(bench.anchor_1rm, 150);
  assertEquals(bench.verdict_tone, 'caution'); // 145 > 90% of 150 → genuinely near max → still cautioned
});
