// Run: ~/.deno/bin/deno test --no-check src/lib/week-budget.test.ts
import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { isEnduranceSession, WEEK_DAYS, type WeekSession } from './week-budget.ts';

Deno.test('an endurance session is anything that is not a lift', () => {
  const lift: WeekSession = { day: 'Monday', name: 'Strength — Bench Press', type: 'strength' };
  assertEquals(isEnduranceSession(lift), false);
  assertEquals(isEnduranceSession({ day: 'Monday', name: 'Easy Run', type: 'run' }), true);
  assertEquals(isEnduranceSession({ day: 'Monday', name: 'Long Ride', type: 'ride' }), true);
  // ⛔ NO TYPE IS NOT ENDURANCE. An absent tag is not evidence of anything (§0h).
  assertEquals(isEnduranceSession({ day: 'Monday', name: 'Mystery' }), false);
});

Deno.test('the week runs Monday first', () => {
  assertEquals(WEEK_DAYS[0], 'Monday');
  assertEquals(WEEK_DAYS.length, 7);
});
