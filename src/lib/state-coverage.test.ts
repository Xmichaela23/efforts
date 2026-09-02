/**
 * THE COVERAGE LINE IS PLAN-DEPENDENT (2026-09-01, ruled by Michael).
 *
 *   deno test --allow-read src/lib/state-coverage.test.ts --no-check
 *
 * ⛔ THE FIXTURE THAT MATTERS: with no active plan, the "nothing this week for …" line MUST NOT
 * render — a coverage gap against no prescription is the app inventing a gap.
 */
import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { coverageVisible } from './state-coverage.ts';

Deno.test('⛔ NO PLAN → the coverage line is hidden, even with muscles below the floor', () => {
  assertEquals(coverageVisible(false, ['triceps', 'glutes']), false);
});

Deno.test('plan + a real gap → shown', () => {
  assertEquals(coverageVisible(true, ['triceps']), true);
});

Deno.test('plan + no gap → hidden', () => {
  assertEquals(coverageVisible(true, []), false);
  assertEquals(coverageVisible(true, null), false);
  assertEquals(coverageVisible(true, undefined), false);
});
