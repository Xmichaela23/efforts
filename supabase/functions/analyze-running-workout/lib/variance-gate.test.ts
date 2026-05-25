/**
 * Tests for D-044 item 7 — computeVarianceGate pin tests.
 *
 * Five user-spec scenarios covering the run analyzer's variance-gate output
 * surface (is_mixed_effort + variance_signal + pace_cv_basis +
 * classified_type_variance_override). Locks the contract of the extracted
 * pure function so future refactors of the analyzer don't drift.
 *
 * Run from repo root:
 *   deno test supabase/functions/analyze-running-workout/lib/variance-gate.test.ts --no-check
 */
import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { computeVarianceGate, type VarianceGateInput } from './variance-gate.ts';

/** Helper: synthesizes a base input with sane defaults; tests override per scenario. */
function makeInput(overrides: Partial<VarianceGateInput> = {}): VarianceGateInput {
  return {
    analysisPacingVariabilityCv: 5,            // low CV, no trip by default
    analysisGapAdjusted: true,                  // GAP basis available
    factPacketTerrainType: 'rolling',
    factPacketIntervalExecutionTotalSteps: 0,
    isLinkedPlanSession: false,
    intervalsToAnalyze: [],
    plannedWorkout: null,
    classifiedTypeKey: 'easy',
    detectWorkoutTypeFromIntervals: () => '',
    ...overrides,
  };
}

// ── Pin scenarios from the original batch spec ────────────────────────────

Deno.test('D-044.7: linked-plan interval session → is_mixed_effort=true, signal=interval_execution', () => {
  const out = computeVarianceGate(makeInput({
    isLinkedPlanSession: true,
    factPacketIntervalExecutionTotalSteps: 6, // 6 work steps from the linked plan
    classifiedTypeKey: 'intervals',
    analysisPacingVariabilityCv: 25,           // high CV (interval session)
    analysisGapAdjusted: true,
  }));
  assertEquals(out.is_mixed_effort, true);
  assertEquals(out.variance_signal, 'interval_execution');
  // Linked-plan classified_type='intervals' is NOT easy-like → no override needed
  assertEquals(out.classified_type_variance_override, false);
});

Deno.test('D-044.7: hilly easy run with GAP available → is_mixed_effort=false, pace_cv_basis=gap', () => {
  const out = computeVarianceGate(makeInput({
    isLinkedPlanSession: true,
    classifiedTypeKey: 'easy_run',
    analysisPacingVariabilityCv: 6,           // below 8% threshold
    analysisGapAdjusted: true,
    factPacketTerrainType: 'hilly',
  }));
  assertEquals(out.is_mixed_effort, false);
  assertEquals(out.variance_signal, null);
  assertEquals(out.pace_cv_basis, 'gap');
  assertEquals(out.pace_cv_pct, 6);
});

Deno.test('D-044.7: flat fartlek without plan link → is_mixed_effort=true, signal=detected_intervals OR pace_cv', () => {
  const out = computeVarianceGate(makeInput({
    isLinkedPlanSession: false,                // unplanned
    classifiedTypeKey: 'fartlek',
    analysisPacingVariabilityCv: 21,          // high CV from alternating intervals
    analysisGapAdjusted: false,                // raw pace basis
    factPacketTerrainType: 'flat',             // raw CV trusted only on flat
    detectWorkoutTypeFromIntervals: () => 'fartlek',
  }));
  assertEquals(out.is_mixed_effort, true);
  // Priority: detected_intervals fires before pace_cv because detected is checked first
  // (unplanned session with non-easy detected key → detected_intervals wins).
  // Either signal is spec-compliant per the original 5-scenario brief.
  const acceptable = out.variance_signal === 'detected_intervals' || out.variance_signal === 'pace_cv';
  assertEquals(acceptable, true);
  assertEquals(out.pace_cv_basis, 'raw');
});

Deno.test('D-044.7: linked-plan easy that trips variance → classified_type stays easy + override=true', () => {
  // Plan said "easy"; the actual workout had high pace CV (athlete pushed it on rolling
  // terrain, GAP-adjusted CV still exceeds threshold). Pool filters need to exclude this
  // from the easy pool WITHOUT overwriting the plan-intent classified_type.
  const out = computeVarianceGate(makeInput({
    isLinkedPlanSession: true,
    classifiedTypeKey: 'easy_run',             // plan intent preserved
    analysisPacingVariabilityCv: 12,          // exceeds 8% GAP threshold
    analysisGapAdjusted: true,                 // GAP basis trustworthy
    factPacketTerrainType: 'rolling',
  }));
  assertEquals(out.is_mixed_effort, true);
  assertEquals(out.variance_signal, 'pace_cv');
  assertEquals(out.classified_type_variance_override, true);
});

Deno.test('D-044.7: unplanned 6-interval session → is_mixed_effort=true via detected_intervals', () => {
  // 6 detected intervals (no plan link). detectWorkoutTypeFromIntervals returns
  // 'intervals'/'fartlek'/non-easy; gate trips via detected_intervals signal.
  const intervals = Array.from({ length: 6 }, () => ({ role: 'lap' as const }));
  const out = computeVarianceGate(makeInput({
    isLinkedPlanSession: false,
    intervalsToAnalyze: intervals,
    detectWorkoutTypeFromIntervals: () => 'intervals',
    classifiedTypeKey: null,                   // no plan
    analysisPacingVariabilityCv: 25,
    analysisGapAdjusted: false,
    factPacketTerrainType: 'rolling',
  }));
  assertEquals(out.is_mixed_effort, true);
  assertEquals(out.variance_signal, 'detected_intervals');
  // classified_type override doesn't apply when unplanned (no plan intent to protect)
  assertEquals(out.classified_type_variance_override, false);
});

// ── Predicate-priority + boundary pins ────────────────────────────────────

Deno.test('D-044.7: linked plan ie steps >= 2 wins over plan-intent intervals', () => {
  // Both predicates would fire; ieTripsLinked has priority.
  const out = computeVarianceGate(makeInput({
    isLinkedPlanSession: true,
    factPacketIntervalExecutionTotalSteps: 4,
    classifiedTypeKey: 'tempo',
    analysisPacingVariabilityCv: 20,
    analysisGapAdjusted: true,
  }));
  assertEquals(out.variance_signal, 'interval_execution');
});

Deno.test('D-044.7: plan-intent fires when ie steps < 2 but classified_type is interval-like', () => {
  const out = computeVarianceGate(makeInput({
    isLinkedPlanSession: true,
    factPacketIntervalExecutionTotalSteps: 1,  // below threshold
    classifiedTypeKey: 'threshold',
    analysisPacingVariabilityCv: 5,            // below CV threshold
    analysisGapAdjusted: true,
  }));
  assertEquals(out.variance_signal, 'plan_intent_intervals');
});

Deno.test('D-044.7: raw CV on rolling terrain is silently skipped (terrain confounder)', () => {
  const out = computeVarianceGate(makeInput({
    isLinkedPlanSession: true,
    classifiedTypeKey: 'easy_run',
    analysisPacingVariabilityCv: 25,
    analysisGapAdjusted: false,                // raw basis
    factPacketTerrainType: 'rolling',          // NOT flat → silently skipped
  }));
  assertEquals(out.is_mixed_effort, false);
  assertEquals(out.variance_signal, null);
});

Deno.test('D-044.7: raw CV on flat terrain DOES trip (terrain confound absent)', () => {
  const out = computeVarianceGate(makeInput({
    isLinkedPlanSession: true,
    classifiedTypeKey: 'easy_run',
    analysisPacingVariabilityCv: 25,
    analysisGapAdjusted: false,
    factPacketTerrainType: 'flat',
  }));
  assertEquals(out.is_mixed_effort, true);
  assertEquals(out.variance_signal, 'pace_cv');
  assertEquals(out.pace_cv_basis, 'raw');
});

Deno.test('D-044.7: CV at exactly 8% trips (>= threshold)', () => {
  const out = computeVarianceGate(makeInput({
    isLinkedPlanSession: false,
    classifiedTypeKey: 'easy',
    analysisPacingVariabilityCv: 8,
    analysisGapAdjusted: true,
  }));
  assertEquals(out.is_mixed_effort, true);
  assertEquals(out.variance_signal, 'pace_cv');
});

Deno.test('D-044.7: CV at 7.9% does NOT trip', () => {
  const out = computeVarianceGate(makeInput({
    isLinkedPlanSession: false,
    classifiedTypeKey: 'easy',
    analysisPacingVariabilityCv: 7.9,
    analysisGapAdjusted: true,
  }));
  assertEquals(out.is_mixed_effort, false);
});

Deno.test('D-044.7: null/missing CV → cvValid=false, basis=null, no trip', () => {
  const out = computeVarianceGate(makeInput({
    analysisPacingVariabilityCv: null,
    analysisGapAdjusted: true,
  }));
  assertEquals(out.is_mixed_effort, false);
  assertEquals(out.pace_cv_pct, null);
  assertEquals(out.pace_cv_basis, null);
});

Deno.test('D-044.7: classified_type_variance_override only fires on linked easy-like + gate trip', () => {
  // Unplanned cannot trigger override (no plan intent to protect).
  const unplanned = computeVarianceGate(makeInput({
    isLinkedPlanSession: false,
    classifiedTypeKey: 'easy',
    analysisPacingVariabilityCv: 20,
    analysisGapAdjusted: true,
  }));
  assertEquals(unplanned.classified_type_variance_override, false);

  // Linked plan, easy intent, gate trips → override fires.
  const linkedEasy = computeVarianceGate(makeInput({
    isLinkedPlanSession: true,
    classifiedTypeKey: 'long_run',
    analysisPacingVariabilityCv: 15,
    analysisGapAdjusted: true,
  }));
  assertEquals(linkedEasy.classified_type_variance_override, true);

  // Linked plan, interval intent (not easy-like) → override stays false even though gate trips.
  const linkedIntervals = computeVarianceGate(makeInput({
    isLinkedPlanSession: true,
    classifiedTypeKey: 'intervals',
    analysisPacingVariabilityCv: 25,
    analysisGapAdjusted: true,
  }));
  assertEquals(linkedIntervals.classified_type_variance_override, false);
});

Deno.test('D-044.7: pace_cv_pct rounded to 0.1', () => {
  const out = computeVarianceGate(makeInput({
    analysisPacingVariabilityCv: 21.16666,
    analysisGapAdjusted: true,
  }));
  assertEquals(out.pace_cv_pct, 21.2);
});
