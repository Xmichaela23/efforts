import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { buildActualSession } from './daily-ledger.ts';
import { completedMovingSeconds } from '../moving-seconds.ts';

// 2026-09-15 — plan context and the Duration chip read the same moving seconds.
Deno.test('plan context reads the true moving seconds, not the whole-minute column', () => {
  const row = { id: 'r', type: 'run', date: '2026-09-14', moving_time: 29, computed: { overall: { duration_s_moving: 1796 } } };
  assertEquals(buildActualSession(row, true).duration_seconds, 1796);
  assertEquals(buildActualSession(row, true).duration_seconds, completedMovingSeconds(row));
});

Deno.test('provider seconds lead; minute column is the last resort', () => {
  assertEquals(buildActualSession({ id: 'a', type: 'ride', moving_time: 45, metrics: { moving_time_seconds: 2677 } }, true).duration_seconds, 2677);
  assertEquals(buildActualSession({ id: 'b', type: 'strength', duration: 40 }, true).duration_seconds, 2400);
});
