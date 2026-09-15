/** Run: deno test --no-check supabase/functions/analyze-running-workout/lib/interval-display.test.ts */
import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { rowsComeFromTheWatch } from './interval-display.ts';

Deno.test('unmatched laps and a structured run with no laps are ready, not missing', () => {
  assertEquals(rowsComeFromTheWatch('laps-unmatched'), true);
  assertEquals(rowsComeFromTheWatch('no-laps-whole-run'), true);
});

Deno.test('plan-aligned, matched-lap and unknown runs keep the missing-steps check', () => {
  for (const m of ['aligned', 'laps-matched', 'snap-to-laps', 'overall-only', null, undefined, '']) assertEquals(rowsComeFromTheWatch(m), false);
});
