// deno test --allow-read --allow-env --no-check supabase/functions/_shared/joined-session.test.ts
import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { swapReachesJoinedHalf } from './joined-session.ts';

Deno.test('⛔ a swap on a joined ride reaches the other half — the trainer, the other sport, the way back — not a workout pick', () => {
  const other = ['venue:trainer', 'discipline:run', 'revert:venue', 'workout:long_vo2'];
  assertEquals(swapReachesJoinedHalf('venue:trainer', other), true);
  assertEquals(swapReachesJoinedHalf('discipline:run', other), true);
  assertEquals(swapReachesJoinedHalf('revert:venue', other), true);
  // A workout pick names one half's own printed workout.
  assertEquals(swapReachesJoinedHalf('workout:long_vo2', other), false);
  // A choice the other half's sheet does not offer is not forced on it.
  assertEquals(swapReachesJoinedHalf('hike:run', other), false);
});
