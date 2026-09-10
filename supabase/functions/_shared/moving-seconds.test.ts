// One moving time per finished session (2026-09-10, audit H-D10).
// Run: ~/.deno/bin/deno test --no-check supabase/functions/_shared/moving-seconds.test.ts
import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { completedMovingSeconds } from './moving-seconds.ts';

Deno.test('a Strava row: the provider\'s true seconds beat the minute-rounded computed figure', () => {
  const row = { type: 'ride', moving_time: 45, metrics: { moving_time_seconds: 2677 }, computed: { overall: { duration_s_moving: 2700 } } };
  assertEquals(completedMovingSeconds(row), 2677);
});

Deno.test('computed wins when it is not a rebuild of the minutes and no true seconds exist', () => {
  assertEquals(completedMovingSeconds({ type: 'run', moving_time: 45, computed: { overall: { duration_s_moving: 2688 } } }), 2688);
});

Deno.test('a rounded computed figure is skipped for distance over speed, then minutes', () => {
  // 20 km at 30 km/h = 2400 s, inside the 45 min elapsed.
  assertEquals(completedMovingSeconds({ type: 'ride', moving_time: 45, elapsed_time: 45, distance: 20, avg_speed: 30, computed: { overall: { duration_s_moving: 2700 } } }), 2400);
  assertEquals(completedMovingSeconds({ type: 'ride', moving_time: 45, computed: { overall: { duration_s_moving: 2700 } } }), 2700);
});

Deno.test('a race is its elapsed time', () => {
  assertEquals(completedMovingSeconds({ type: 'run', workout_type: 1, metrics: { moving_time_seconds: 10000, total_elapsed_time_seconds: 10321 } }), 10321);
  assertEquals(completedMovingSeconds({ type: 'run', workout_analysis: { is_goal_race: true }, elapsed_time: 172, metrics: { moving_time_seconds: 10000 } }), 10320);
});

Deno.test('a swim reads the raw-column scalar the Performance card reads, not the sample-derived overall', () => {
  assertEquals(completedMovingSeconds({ type: 'swim', moving_time: 35, elapsed_time: 36, computed: { overall: { duration_s_moving: 2202 } } }), 2100);
});

Deno.test('provider timers, sensor samples, and elapsed as the last resort (never for a swim)', () => {
  assertEquals(completedMovingSeconds({ type: 'ride', metrics: JSON.stringify({ timerDurationInSeconds: 1800 }) }), 1800);
  assertEquals(completedMovingSeconds({ type: 'ride', sensor_data: { samples: [{ timerDurationInSeconds: 10 }, { timerDurationInSeconds: 1234 }] } }), 1234);
  assertEquals(completedMovingSeconds({ type: 'ride', metrics: { total_elapsed_time_seconds: 999 } }), 999);
  assertEquals(completedMovingSeconds({ type: 'swim', metrics: { total_elapsed_time_seconds: 999 } }), null);
  assertEquals(completedMovingSeconds(null), null);
});
