/**
 * Run: ~/.deno/bin/deno test --no-check supabase/functions/get-week/week-totals.test.ts
 */
import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { weekBarTotals } from './week-totals.ts';

Deno.test('a finished session counts at its planned length in Planned and its moving time in Done', () => {
  const t = weekBarTotals([
    { type: 'run', status: 'completed', is_executed: true, moving_seconds: 4320, executed: { overall: { distance_m: 12000 } },
      planned: { planned_duration_seconds: 3600, steps: [{ seconds: 3600 }] } },
    { type: 'ride', status: 'planned', planned: { planned_duration_seconds: 3960, steps: [] } },
  ]);
  assertEquals(t.planned_minutes, 60 + 66);
  assertEquals(t.done_minutes, 72);
  assertEquals(t.done_meters, 12000);
  assertEquals(t.planned_meters, 0);
});

Deno.test('an unplanned session is done, not planned; a distance prescription counts as planned metres', () => {
  const t = weekBarTotals([
    { type: 'run', status: 'completed', is_executed: true, moving_seconds: 1800, executed: { overall: { distance_m: 5000 } } },
    { type: 'run', status: 'planned', planned: { planned_duration_seconds: 2400, steps: [{ distanceMeters: 1609.34 }, { distanceMeters: 800 }] } },
  ]);
  assertEquals(t.planned_minutes, 40);
  assertEquals(t.planned_meters, 2409);
  assertEquals(t.done_minutes, 30);
});

Deno.test('lifts are counted, and a completed row with no receipt is not done', () => {
  const t = weekBarTotals([
    { type: 'strength', status: 'completed', is_executed: true, planned: {} },
    { type: 'strength', status: 'planned', planned: {} },
    { type: 'strength', status: 'completed', is_executed: false },
    { type: 'run', status: 'completed', is_executed: false, moving_seconds: 600 },
  ]);
  assertEquals(t.lifts_planned, 2);
  assertEquals(t.lifts_done, 1);
  assertEquals(t.done_minutes, 0);
});
