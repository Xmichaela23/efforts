// D-316: the swap seed.
//
// THE INVARIANT under test, and the only one that matters:
//
//     swapping INTO a lift gives the weight the plan would have prescribed for that lift,
//     in that week, had it been the authored slot all along.
//
// One shared function serves the logger's swap sheet and materialize-plan's rest-of-plan
// path, so if this drifts the two surfaces start disagreeing again.
// Run: deno test src/lib/exercise-config.swap-seed.test.ts

import { assertEquals } from 'https://deno.land/std@0.224.0/assert/assert_equals.ts';
import {
  resolveSwapSeedWeight,
  calculatePrescribedWeight,
  normalizeLiftKey,
  getExerciseConfig,
} from './exercise-config.ts';

// ── THE BUG CASE, kept as a permanent regression ──────────────────────────────
// A strength-primary block, week 3, authored "78.5% 1RM" at 5 reps. Baselines are a
// generic set — nothing here is tuned to one athlete; the arithmetic is what's pinned.
//
// The slot held a Front Squat. Swapping it to a Back Squat produced 90 where the plan
// prescribes 85, because the old code rescaled off the DISPLAYED load:
//
//     front squat  1RM × 0.85 × 0.785 = 73.4  → displayed 75      (rounded UP 1.6)
//     rescaled     75 × (1.00 / 0.85) = 88.2  → 90                ✗
//     derived      1RM × 1.00 × 0.785 = 86.4  → 85                ✓
//
// Rounding to the plate increment happens BEFORE the rescale, so the rescale multiplies
// the rounding error and then rounds again. Back-inferring the intensity from that same
// displayed load has the same defect: 75 / (1RM × 0.85) = 0.802 vs the authored 0.785.
const B = { squat: 110, bench: 150, deadlift: 150, overheadPress1RM: 100 };
const AUTHORED = 0.785;
const REPS = 5;
// Strength-primary rows author intensity per rep bracket, so the rep scale is off.
const NO_REP_SCALE = false;

/** What the plan prescribes for a lift in this week — the invariant's right-hand side. */
const planWeight = (lift: string) =>
  calculatePrescribedWeight(lift, AUTHORED, B, REPS, NO_REP_SCALE).weight;

const seed = (lift: string) =>
  resolveSwapSeedWeight(lift, AUTHORED, B, REPS, NO_REP_SCALE).weight;

Deno.test('BUG CASE: Front Squat slot → Back Squat seeds 85, the planned weight, not 90', () => {
  assertEquals(planWeight('Back Squat'), 85);
  assertEquals(seed('Back Squat'), 85);
});

Deno.test('BUG CASE: the old rescale answer is not reachable', () => {
  const displayed = planWeight('Front Squat');           // 75
  const rescaled = Math.round((displayed! * (1.0 / 0.85)) / 5) * 5;
  assertEquals(displayed, 75);
  assertEquals(rescaled, 90);                            // what the old code produced
  assertEquals(seed('Back Squat') === rescaled, false);  // and what we must never return
});

Deno.test('BUG CASE: back-inferring intensity from the rounded load is also wrong', () => {
  // Kept as a pin because this was my first attempted fix and it silently reproduced the bug.
  const displayed = planWeight('Front Squat')!;          // 75, already rounded
  const inferred = displayed / (B.squat * 0.85);         // 0.8021, not 0.785
  assertEquals(Number(inferred.toFixed(4)), 0.8021);
  const viaInference = resolveSwapSeedWeight('Back Squat', inferred, B, REPS, NO_REP_SCALE).weight;
  assertEquals(viaInference, 90);                        // the bug, reproduced
  assertEquals(seed('Back Squat'), 85);                  // the authored % does not have it
});

// ── THE INVARIANT, across every offered alternative ───────────────────────────

Deno.test('INVARIANT: every swap target seeds exactly what the plan would prescribe', () => {
  for (const lift of [
    'Back Squat', 'Leg Press', 'Goblet Squat', 'Bulgarian Split Squat',
    'Reverse Lunge', 'Step Up', 'Lateral Lunge', 'Leg Extension', 'Front Squat',
  ]) {
    assertEquals(seed(lift), planWeight(lift), `${lift} seed must equal its planned weight`);
  }
});

Deno.test('INVARIANT holds across references too (squat slot → bench/deadlift-referenced lifts)', () => {
  for (const lift of ['Hip Thrust', 'Romanian Deadlift', 'Chest Fly', 'Barbell Row']) {
    assertEquals(seed(lift), planWeight(lift), `${lift} seed must equal its planned weight`);
  }
});

Deno.test('INVARIANT holds at every intensity in a block, not just week 3', () => {
  // A strength-primary ramp: base 5s, intensification 3s, peak doubles, retest.
  for (const [pct, reps] of [[0.72, 5], [0.755, 5], [0.785, 5], [0.82, 5],
                             [0.84, 3], [0.90, 3], [0.65, 5], [0.88, 2], [0.94, 2]] as const) {
    for (const lift of ['Back Squat', 'Leg Press', 'Goblet Squat']) {
      assertEquals(
        resolveSwapSeedWeight(lift, pct, B, reps, NO_REP_SCALE).weight,
        calculatePrescribedWeight(lift, pct, B, reps, NO_REP_SCALE).weight,
        `${lift} @ ${pct} × ${reps}`,
      );
    }
  }
});

Deno.test('INVARIANT is baseline-agnostic — holds for any athlete\'s numbers', () => {
  // The whole point: nothing is tuned to one person. Sweep a wide range of 1RMs, including
  // ones that land on and off the 5 lb rounding boundary.
  for (let squat = 65; squat <= 500; squat += 5) {
    const bl = { squat, bench: squat * 0.8, deadlift: squat * 1.2, overheadPress1RM: squat * 0.6 };
    for (const lift of ['Back Squat', 'Leg Press', 'Goblet Squat', 'Bulgarian Split Squat']) {
      assertEquals(
        resolveSwapSeedWeight(lift, AUTHORED, bl, REPS, NO_REP_SCALE).weight,
        calculatePrescribedWeight(lift, AUTHORED, bl, REPS, NO_REP_SCALE).weight,
        `${lift} at squat 1RM ${squat}`,
      );
    }
  }
});

// ── NO COMPOUNDING ────────────────────────────────────────────────────────────

Deno.test('a second swap does not compound: A→B→C uses C\'s own ratio, not a product', () => {
  // The old rescale read the ratio off `planned_name`, which never advanced, so a third
  // lift got ×(1.50/0.85) applied to an ALREADY-rescaled weight. Deriving can't compound:
  // the seed never depends on what the slot previously held.
  assertEquals(seed('Leg Press'), planWeight('Leg Press'));
  assertEquals(seed('Leg Press'), 130);
});

// ── FALLBACKS ─────────────────────────────────────────────────────────────────

Deno.test('no baseline for the new lift\'s reference → blank, never a guess', () => {
  const r = resolveSwapSeedWeight('Back Squat', AUTHORED, { bench: 150 }, REPS, NO_REP_SCALE);
  assertEquals(r.weight, null);
  assertEquals(r.source, 'none');
});

Deno.test('rep scale is applied only when the caller asks (concurrent rows, not strength-primary)', () => {
  const withScale = resolveSwapSeedWeight('Back Squat', AUTHORED, B, REPS, true).weight;
  const without = resolveSwapSeedWeight('Back Squat', AUTHORED, B, REPS, false).weight;
  assertEquals(without, 85);      // 110 × 0.785
  assertEquals(withScale, 90);    // 110 × 0.785 × 1.02 — correct for a row that wants it
});

Deno.test('a perHand lift halves, and the rescale never did', () => {
  // The SECOND, larger bug in the old rescale, and the one nobody had noticed: `curW ×
  // newRatio / oldRatio` is pure ratio arithmetic. It knows nothing about `ratioIsTotal`,
  // so swapping a barbell lift for a dumbbell one skipped the per-hand halving entirely
  // and prescribed the TOTAL load in each hand — 45 per hand where the plan says 20.
  // Deriving goes through calculatePrescribedWeight, which halves before rounding.
  assertEquals(seed('Bulgarian Split Squat'), planWeight('Bulgarian Split Squat'));
  assertEquals(seed('Bulgarian Split Squat'), 20);
  const rescaled = Math.round((planWeight('Front Squat')! * (0.50 / 0.85)) / 5) * 5;
  assertEquals(rescaled, 45);   // what the old code put in the box
});

// ── REVERTED: history seeding ─────────────────────────────────────────────────

Deno.test('the swap does NOT seed from what the athlete last lifted', () => {
  // Seeding from the log was built and reverted. It leaves the protocol: it happens to agree
  // on a lift trained at the block's intensity and drifts on anything else (a reverse lunge
  // logged as accessory work at 25 seeds 25 where the block prescribes 20). A %1RM program's
  // job is to prescribe, not to repeat; load feedback belongs in the consent-gated RIR loop.
  // Pinned so nobody re-adds it: the seed depends only on (lift, %, baselines, reps).
  assertEquals(seed('Reverse Lunge'), 20);
  assertEquals(resolveSwapSeedWeight.length <= 5, true, 'no history/date parameters');
});

// ── key normalization ─────────────────────────────────────────────────────────

Deno.test('lift keys match across plural + side suffixes (Q-197)', () => {
  assertEquals(normalizeLiftKey('Hip Thrusts'), normalizeLiftKey('Hip Thrust'));
  assertEquals(normalizeLiftKey('Step Up (Left)'), normalizeLiftKey('Step Up'));
  assertEquals(normalizeLiftKey('  Back   Squat '), 'back squat');
});

// ── NAME FOLDING (D-316) ──────────────────────────────────────────────────────
// The table is written hyphenated (`pull-up`, `push-up`, `chin-up`, 17 keys). Callers
// write the spaced form. The lookup only lowercased and trimmed, so every one of those
// entries was unreachable — "Pull Up" returned null and fell through to materialize's
// legacy barbell fallback, which prescribed a pull-up off the athlete's BENCH and
// rendered "110 lb". The entries were always correct; they just couldn't be found.

Deno.test('BUG CASE: spaced bodyweight names resolve to their hyphenated entries', () => {
  for (const n of ['Pull Up', 'Pull Ups', 'Push Up', 'Push Ups', 'Chin Up',
                   'Pike Push Up', 'Diamond Push Ups', 'Decline Push Up']) {
    const c = getExerciseConfig(n);
    assertEquals(c?.displayFormat, 'bodyweight', `${n} must resolve as bodyweight`);
    assertEquals(c?.primaryRef, null, `${n} must not derive off another lift`);
  }
});

Deno.test('BUG CASE: a bodyweight lift can never produce a plate number', () => {
  // The exact shape that shipped: a pull-up priced off a 150 lb bench.
  for (const n of ['Pull Up', 'Push Up', 'Chin Up']) {
    const w = calculatePrescribedWeight(n, AUTHORED, B, REPS, NO_REP_SCALE).weight;
    assertEquals(w, 0, `${n} must be 0 (bodyweight), not a derived load`);
  }
});

Deno.test('hyphen/space/underscore forms are interchangeable', () => {
  const want = getExerciseConfig('pull-up');
  for (const n of ['pull up', 'Pull-Up', 'PULL UP', 'pull_up', '  pull   up  ']) {
    assertEquals(getExerciseConfig(n), want, n);
  }
});

Deno.test('folding does not regress the existing table', () => {
  const expect: Array<[string, string | null, number]> = [
    ['squat', 'squat', 1.0],
    ['Back Squat', 'squat', 1.0],
    ['Bulgarian Split Squat', 'squat', 0.50],
    ['Barbell Row', 'bench', 0.80],
    ['Front Squat', 'squat', 0.85],
    ['Leg Press', 'squat', 1.50],
    ['Hip Thrust', 'deadlift', 0.90],
    ['Romanian Deadlift', 'deadlift', 0.75],
    ['Step Up', 'squat', 0.40],
    ['Goblet Squat', 'squat', 0.45],
  ];
  for (const [name, ref, ratio] of expect) {
    const c = getExerciseConfig(name);
    assertEquals(c?.primaryRef ?? null, ref, `${name} ref`);
    assertEquals(c?.ratio, ratio, `${name} ratio`);
  }
});
