// @ts-nocheck
/**
 * Regression tests for the description↔delivered contract on strength loads.
 *
 * Context: in the prior implementation, `adjustPerformanceWorkingLoadLb` had a
 * compound branch that added `+5 lb per 2 weeks` and a `× 0.9` deload on week
 * 4n. That offset was applied AFTER the dispatcher's phase-aware %1RM emit AND
 * after `scaleSessionToRebuildLoads`'s pre-resolved rebuild weights, producing
 * delivered weights that drifted from the description text (e.g. description
 * said 110 lb, delivered 145 lb).
 *
 * These tests pin the contract: compound lifts pass through `adjustPerformance
 * WorkingLoadLb` untouched. The accessory branch — added intentionally in
 * commit 832a8449 for isolation lifts whose descriptions are qualitative — is
 * preserved.
 *
 * Run from repo root:
 *   deno test --no-lock --allow-all supabase/functions/materialize-plan/index.test.ts
 */

import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { adjustPerformanceWorkingLoadLb, fallbackUnresolvedPercentDisplay } from './index.ts';

// ── §1 Compound passthrough — the regression class we just closed ─────────

Deno.test('compound: deadlift Week 9 Build passes through unchanged (no +20 stack)', () => {
  // Dispatcher emit for Week 9 Build with 1RM=150: prescribed = round(0.80×150/5)×5 = 120.
  // Pre-fix: 120 + (9-1)×2.5 = 140 lb delivered (drift).
  // Post-fix: 120 lb delivered. Description ≡ delivered.
  const out = adjustPerformanceWorkingLoadLb(120, 'Deadlift', 'performance', 9);
  assertEquals(out, 120);
});

Deno.test('compound: deadlift Week 4 deload passes through (no ×0.9 stack)', () => {
  // Pre-fix: week 4n branch returned 120 × 0.9 = 108 → 110. Dispatcher already
  // owns deload via phase emit / rebuild ramp; materializer must not re-stack.
  const out = adjustPerformanceWorkingLoadLb(120, 'Deadlift', 'performance', 4);
  assertEquals(out, 120);
});

Deno.test('compound: squat Week 15 Rebuild — pre-resolved rebuild weight passes through', () => {
  // scaleSessionToRebuildLoads at Week 15 (wip=1) emits 110 lb (= 0.90×0.80×150
  // rounded). The materializer must not add +35 lb of compound progression on
  // top of that. This is the exact scenario from the audit (W15 reported 145).
  const out = adjustPerformanceWorkingLoadLb(110, 'Back Squat', 'performance', 15);
  assertEquals(out, 110);
});

Deno.test('compound: bench Week 16 deload — pre-resolved rebuild weight passes through', () => {
  // Rebuild ramp at Week 16 (wip=2) emits ~115 lb. Pre-fix: week 4n → ×0.9 = ~105
  // (observed in audit). Post-fix: 115 stays 115.
  const out = adjustPerformanceWorkingLoadLb(115, 'Bench Press', 'performance', 16);
  assertEquals(out, 115);
});

Deno.test('compound: every variant we list in isPerformanceCompoundExercise passes through', () => {
  // These names exercise each `||` branch of isPerformanceCompoundExercise so a
  // future regression that adds the compound progression back gets caught no
  // matter which lift the protocol generates.
  for (const name of [
    'Back Squat',
    'Front Squat',
    'Deadlift',
    'Sumo Deadlift',
    'Romanian Deadlift', // 'rdl'
    'RDL',
    'Bench Press',
    'Incline Bench',
    'Overhead Press',
    'Strict Press',
    'Barbell Row',
    'Barbell Rows',
    'Hip Thrust',
  ]) {
    const out = adjustPerformanceWorkingLoadLb(120, name, 'performance', 9);
    assertEquals(out, 120, `expected passthrough for "${name}"`);
  }
});

// ── §2 Accessory branch — preserved per commit 832a8449 ───────────────────

Deno.test('accessory: cable row Week 9 → +2.5 lb × (9-1) = +20 progression', () => {
  // Description is qualitative ("Light cable row") so the +2.5/wk increment
  // doesn't break description≡delivered. This branch is intentional.
  const out = adjustPerformanceWorkingLoadLb(50, 'Cable Row', 'performance', 9);
  assertEquals(out, 70); // 50 + (9-1)×2.5
});

Deno.test('accessory: cable row Week 4 deload → × 0.9 rounded to 2.5', () => {
  const out = adjustPerformanceWorkingLoadLb(50, 'Cable Row', 'performance', 4);
  assertEquals(out, 45); // 50 × 0.9 = 45
});

Deno.test('accessory: cable row Week 1 → unchanged (base prescription)', () => {
  const out = adjustPerformanceWorkingLoadLb(50, 'Cable Row', 'performance', 1);
  assertEquals(out, 50);
});

Deno.test('accessory: leg press Week 9 progresses (not a compound)', () => {
  const out = adjustPerformanceWorkingLoadLb(100, 'Leg Press', 'performance', 9);
  assertEquals(out, 120); // 100 + 8×2.5
});

Deno.test('accessory: goblet squat is accessory, not a squat compound', () => {
  // isPerformanceCompoundExercise excludes goblet squat; accessory branch wins.
  const out = adjustPerformanceWorkingLoadLb(40, 'Goblet Squat', 'performance', 9);
  assertEquals(out, 60); // 40 + 8×2.5
});

// ── §3 Non-performance intent / null inputs ───────────────────────────────

Deno.test('non-performance intent: hypertrophy deadlift passes through', () => {
  const out = adjustPerformanceWorkingLoadLb(120, 'Deadlift', 'hypertrophy' as any, 9);
  assertEquals(out, 120);
});

Deno.test('null / undefined / non-finite inputs pass through unchanged', () => {
  assertEquals(adjustPerformanceWorkingLoadLb(undefined, 'Deadlift', 'performance', 9), undefined);
  assertEquals(adjustPerformanceWorkingLoadLb(null as any, 'Deadlift', 'performance', 9), null);
  assertEquals(adjustPerformanceWorkingLoadLb(NaN, 'Deadlift', 'performance', 9), NaN);
});

// ── §4 D-071: % 1RM fallthrough display when 1RM baseline is missing ─────
//
// When materialize-plan's resolution chain bails (no 1RM in
// performance_numbers), the strength session would emit `weight_display:
// undefined` and the client UI would fall back to the raw input string —
// "65% 1RM (DB ≈ 70% barbell load)" leaks to athletes. The helper converts
// that to an RIR-anchored cue using the rep count.

Deno.test('D-071: raw "% 1RM" string with numeric reps → RIR-anchored cue', () => {
  const out = fallbackUnresolvedPercentDisplay('65% 1RM', 8);
  assertEquals(out, 'Pick a weight you can do for 8 reps with 2 in reserve');
});

Deno.test('D-071: "% 1RM" with DB modifier string still triggers fallback', () => {
  // Real protocol emit: "65% 1RM (DB ≈ 70% barbell load)" — % 1RM detector
  // must match regardless of trailing modifier copy.
  const out = fallbackUnresolvedPercentDisplay('65% 1RM (DB ≈ 70% barbell load)', 10);
  assertEquals(out, 'Pick a weight you can do for 10 reps with 2 in reserve');
});

Deno.test('D-071: string reps like "8-10" pick the first integer', () => {
  const out = fallbackUnresolvedPercentDisplay('70% 1RM', '8-10');
  assertEquals(out, 'Pick a weight you can do for 8 reps with 2 in reserve');
});

Deno.test('D-071: missing reps falls back to generic moderate cue', () => {
  const out = fallbackUnresolvedPercentDisplay('70% 1RM', undefined);
  assertEquals(out, 'Moderate weight — leave 2 reps in reserve');
});

Deno.test('D-071: non-% input returns undefined (caller falls through)', () => {
  // Qualitative strings ("Bodyweight", "Light"), numeric strings, and band
  // copy are owned by other branches — the helper only handles raw % 1RM.
  assertEquals(fallbackUnresolvedPercentDisplay('Bodyweight', 8), undefined);
  assertEquals(fallbackUnresolvedPercentDisplay('Heaviest available', 8), undefined);
  assertEquals(fallbackUnresolvedPercentDisplay('115', 8), undefined);
  assertEquals(fallbackUnresolvedPercentDisplay(null, 8), undefined);
});
