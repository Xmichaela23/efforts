/**
 * Issue 2 — classify-error contract tests.
 *
 * Covers the downstream side of the actionable-error chain: a race-week §8.x
 * hard-fail must classify as `race_week_infeasible` + HTTP 422 (athlete-
 * actionable, stays !resp.ok so the wrapper propagates the code), while a
 * genuine internal error stays `combined_plan_internal_error` + 500. The
 * leaked `"Error: "` prefix (the old `String(e)`) must be gone.
 *
 * The wrapper-side passthrough (create-goal-and-materialize-plan invokeFunction
 * reading payload.error_code → AppError → 200 body) is a trivial inline
 * passthrough not separately unit-tested here; the full HTTP chain remains
 * integration-uncovered (pre-existing gap, flagged).
 *
 * Run from repo root:
 *   deno test --no-check --no-lock --allow-all \
 *     supabase/functions/generate-combined-plan/classify-error.test.ts
 */

import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { classifyCombinedPlanError } from './classify-error.ts';

Deno.test('§8.2/§8.5 race-week throw → race_week_infeasible / 422, no "Error:" prefix', () => {
  const r = classifyCombinedPlanError(
    new Error('[race-week §8.2/§8.5] B-race "X" (2026-08-16) is too close to A-race "Y" (2026-09-13): only 2 week(s) ... Move the B-race earlier, drop it, or choose a later A-race date.'),
  );
  assertEquals(r.error_code, 'race_week_infeasible');
  assertEquals(r.status, 422);
  assertEquals(r.error.startsWith('[race-week §8.2/§8.5]'), true);
  // Regression guard: the old String(Error) prepended "Error: ".
  assertEquals(r.error.startsWith('Error:'), false);
});

Deno.test('§8.1 chronology throw also classifies race_week_infeasible / 422', () => {
  const r = classifyCombinedPlanError(
    new Error('[race-week §8.1] priority-A race "A" (2026-08-16) is not the chronologically-last race ...'),
  );
  assertEquals(r.error_code, 'race_week_infeasible');
  assertEquals(r.status, 422);
});

Deno.test('generic Error → combined_plan_internal_error / 500, message preserved verbatim', () => {
  const r = classifyCombinedPlanError(new Error('boom'));
  assertEquals(r, { error: 'boom', error_code: 'combined_plan_internal_error', status: 500 });
});

Deno.test('non-Error throw → String() fallback, internal / 500', () => {
  const r = classifyCombinedPlanError('weird non-error');
  assertEquals(r.error, 'weird non-error');
  assertEquals(r.error_code, 'combined_plan_internal_error');
  assertEquals(r.status, 500);
});

Deno.test('a message merely containing "[race-week" mid-string is NOT misclassified (prefix-anchored)', () => {
  const r = classifyCombinedPlanError(new Error('db write failed while logging [race-week] note'));
  assertEquals(r.error_code, 'combined_plan_internal_error');
  assertEquals(r.status, 500);
});
