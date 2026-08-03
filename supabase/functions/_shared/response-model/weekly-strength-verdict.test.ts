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
  assertEquals(bench.suggested_weight, null); // Q-111 fact-only: back-off no longer prescribes lighter
  assertEquals(bench.anchor_1rm ?? null, null); // baseline-blind: the typed 150 never entered
});

// ── [D-373] AN ACCESSORY IS NOT COACHED AT ALL. This test was REVERSED on 2026-08-02. ─────────────
//
// ⛔ It used to assert the OPPOSITE — that a Hip Thrust receives "back off weight" — under the title
// "behavior unchanged". It passed, and it was pinning the live bug: `computeLiftVerdict` ran EVERY
// movement through the same RIR-deviation logic and never consulted role, so a hard-feeling accessory
// printed a red command it has no business printing. Accessories carry no anchor, so the State row had
// nothing to build a sentence from and dumped the raw command on screen.
//
// The rule now (SPEC-strength-language Axis 1, grounded in Strong / Hevy): coaching language —
// commands, e1RM direction, AMRAP targets — appears ONLY on the four main lifts. Everything else shows
// numbers or nothing. **An empty label is the contract**, and the client reads it as "not coached".
Deno.test('D-373: an accessory gets NO verdict command, however hard the RIR says it was', () => {
  const hipThrust: StrengthLiftSnapshot = {
    canonical_name: 'hip_thrust', display_name: 'Hip Thrust',
    current_e1rm: 225, previous_e1rm: null,
    // Same numbers as the old repro: deviation = 1 − 3 = −2, deep into BACK_OFF territory.
    current_avg_rir: 1, baseline_avg_rir: 3, target_rir: 3,
    sessions_in_window: 4, best_weight: 225, anchor_1rm: null,
  } as StrengthLiftSnapshot;
  const res = computeStrength([hipThrust], 'build');
  const l = res.per_lift[0];
  assertEquals(l.verdict_label, '');            // no command — this is the fix
  assertEquals(l.suggested_weight, null);        // and therefore nothing to prescribe
  assertEquals(l.best_weight, 225);              // the NUMBER survives — the row still says what moved
  assertEquals(l.anchor_1rm ?? null, null);
});

// The bug was worst on light programs, where nearly every movement is an accessory — so the gate has
// to hold on a barbell accessory too, not just obviously-bodyweight ones.
Deno.test('D-373: a barbell ACCESSORY (Barbell Row) is still not coached — the gate is role, not equipment', () => {
  const row: StrengthLiftSnapshot = {
    canonical_name: 'barbell_row', display_name: 'Barbell Row',
    current_e1rm: 185, previous_e1rm: null,
    current_avg_rir: 1, baseline_avg_rir: 3, target_rir: 3,
    sessions_in_window: 4, best_weight: 185, anchor_1rm: null,
  } as StrengthLiftSnapshot;
  assertEquals(computeStrength([row], 'build').per_lift[0].verdict_label, '');
});

// ⛔ THE DEFAULT DIRECTION MATTERS. `roleForExercise` defaults an UNKNOWN move to 'primary'; the
// language gate uses `isMain531Lift`, which defaults to false. Silence is the safe failure — gating on
// the other classifier would coach every unrecognised movement and rebuild this bug one layer down.
Deno.test('D-373: an UNKNOWN movement is not coached — the language gate fails to silence', () => {
  const mystery: StrengthLiftSnapshot = {
    canonical_name: 'landmine_thruster_xyz', display_name: 'Landmine Thruster',
    current_e1rm: 95, previous_e1rm: null,
    current_avg_rir: 1, baseline_avg_rir: 3, target_rir: 3,
    sessions_in_window: 4, best_weight: 95, anchor_1rm: null,
  } as StrengthLiftSnapshot;
  assertEquals(computeStrength([mystery], 'build').per_lift[0].verdict_label, '');
});

// And the other half of the contract: a MAIN LIFT still gets everything it got before.
Deno.test('D-373: main lifts are UNCHANGED — squat still earns a progression command + suggestion', () => {
  const squat: StrengthLiftSnapshot = {
    canonical_name: 'squat', display_name: 'Squat',
    current_e1rm: 200, previous_e1rm: null,
    current_avg_rir: 4, baseline_avg_rir: 2, target_rir: 2,
    sessions_in_window: 4, best_weight: 180, anchor_1rm: null,
  } as StrengthLiftSnapshot;
  const l = computeStrength([squat], 'build').per_lift[0];
  assertEquals(l.verdict_label, 'add weight');
  assert(l.suggested_weight != null, 'a main lift must still carry its progression suggestion');
});

// ── FIXED — typed anchor 150 present: de-alarmed tone + anchor carried; NO lighter prescription ────
Deno.test('FLIPPED[anchor 150]: working 125 vs 150 baseline → de-alarmed, anchor carried, NO suggestion (fact-only)', () => {
  const res = computeStrength([benchBackOff(150)], 'build');
  const bench = res.per_lift[0];
  // The typed anchor is CARRIED on the row so the client renders "Working ~125 vs your 150 baseline".
  assertEquals(bench.anchor_1rm, 150);
  // Working 125 is ≤90% of the 150 anchor → clear headroom → the RIR back-off is NOT an alarm.
  assertEquals(bench.verdict_tone, 'neutral');
  // Q-111 fact-only: a decline/back-off no longer prescribes a lighter weight — state the fact only.
  assertEquals(bench.suggested_weight, null);
});

// ── Q-111: PROGRESSION ("add weight") suggestions are KEPT — only the "go lighter" is dropped ───────
Deno.test('add-weight KEPT: headroom on RIR → "add weight" verdict still carries a suggestion', () => {
  const readyToProgress: StrengthLiftSnapshot = {
    canonical_name: 'squat', display_name: 'Squat',
    current_e1rm: 200, previous_e1rm: null,
    current_avg_rir: 4, baseline_avg_rir: 2, target_rir: 2, // well above target → room to add
    sessions_in_window: 4, best_weight: 180, anchor_1rm: null,
  } as StrengthLiftSnapshot;
  const res = computeStrength([readyToProgress], 'build');
  const l = res.per_lift[0];
  assertEquals(l.verdict_label, 'add weight');
  assert(l.suggested_weight != null, 'progression suggestion must be kept');
});

// ── FIXED — near-max working weight vs anchor keeps the alarm (headroom guard is not a blanket mute) ─
Deno.test('near-max[anchor 150]: working 145 vs 150 → little headroom → back-off alarm preserved', () => {
  const nearMax = { ...benchBackOff(150), best_weight: 145, current_e1rm: 145 } as StrengthLiftSnapshot;
  const res = computeStrength([nearMax], 'build');
  const bench = res.per_lift[0];
  assertEquals(bench.anchor_1rm, 150);
  assertEquals(bench.verdict_tone, 'caution'); // 145 > 90% of 150 → genuinely near max → still cautioned
});
