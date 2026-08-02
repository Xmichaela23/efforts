// "How long was this session planned to be" — one answer for the attach matcher and the analyzers.
// Written from the real 2026-08-01 row: computed null, intervals [], total_duration_seconds null,
// duration 108, description "~108 min easy, all conversational". That session was BOTH unattachable
// and unscoreable, because two readers each looked in one place and neither looked here.
// Run: deno test --no-check planned-duration.test.ts
import { assertEquals } from 'https://deno.land/std@0.208.0/assert/mod.ts';
import { resolvePlannedDurationSeconds, plannedStepSeconds } from './planned-duration.ts';

Deno.test('steps win — they are what the athlete was told to do', () => {
  const planned = {
    computed: { steps: [{ seconds: 600 }, { seconds: 1800 }], total_duration_seconds: 9999 },
    total_duration_seconds: 8888,
    duration: 777,
  };
  assertEquals(resolvePlannedDurationSeconds(planned), 2400);
  assertEquals(plannedStepSeconds(planned), 2400);
});

Deno.test('THE REAL ROW: no steps, no totals, duration 108 → 6480s', () => {
  const planned = { computed: null, intervals: [], total_duration_seconds: null, duration: 108 };
  assertEquals(resolvePlannedDurationSeconds(planned), 6480);
  // 64 min ridden against it = 59%, which is what the screen should say — not 0%.
  assertEquals(Math.round((3840 / 6480) * 100), 59);
});

Deno.test('computed.total_duration_seconds is the run analyzer\'s source and still ranks above the columns', () => {
  assertEquals(resolvePlannedDurationSeconds({ computed: { total_duration_seconds: 5400 }, total_duration_seconds: 3600, duration: 30 }), 5400);
  assertEquals(resolvePlannedDurationSeconds({ computed: null, total_duration_seconds: 3600, duration: 30 }), 3600);
});

Deno.test('the duration column is minutes, unless it is plainly already seconds', () => {
  assertEquals(resolvePlannedDurationSeconds({ duration: 45 }), 2700);
  assertEquals(resolvePlannedDurationSeconds({ duration: 6480 }), 6480); // legacy row, not multiplied again
});

Deno.test('nothing stated → null, never a fabricated length', () => {
  assertEquals(resolvePlannedDurationSeconds({}), null);
  assertEquals(resolvePlannedDurationSeconds({ computed: null, intervals: [], duration: 0 }), null);
  assertEquals(resolvePlannedDurationSeconds(null), null);
  assertEquals(plannedStepSeconds({ computed: { steps: [] } }), null);
});

Deno.test('legacy `intervals` counts as steps', () => {
  assertEquals(resolvePlannedDurationSeconds({ intervals: [{ duration: 1200 }, { duration: 1200 }] }), 2400);
});
