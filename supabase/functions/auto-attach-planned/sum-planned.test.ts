// What the auto-attach matcher can read as "how long was the planned session" (2026-08-01).
// Traced from a real miss: a ride did not attach to its planned "Long Ride" because the planned row
// was UNSTRUCTURED — computed null, intervals [], total_duration_seconds null, and `duration: 108`
// sitting right there unread. Unstructured base miles are the default case for an endurance athlete,
// so this was not an edge case; it was most of the week.
// Run: deno test --no-check sum-planned.test.ts
import { assertEquals } from 'https://deno.land/std@0.208.0/assert/mod.ts';
import { sumPlanned } from './index.ts';

Deno.test('structured session: the STEPS are authoritative', () => {
  const planned = { computed: { steps: [{ seconds: 600 }, { seconds: 1800 }, { seconds: 600 }] }, duration: 999 };
  // 999 in the duration column is ignored — the steps are what the athlete was told to do.
  assertEquals(sumPlanned(planned), { seconds: 3000, meters: null });
});

Deno.test('legacy `intervals` still counts as structure', () => {
  assertEquals(sumPlanned({ intervals: [{ duration: 1200 }, { duration: 1200 }] }), { seconds: 2400, meters: null });
});

// ── THE REGRESSION THIS WAS WRITTEN FOR ─────────────────────────────────────────────────────────
Deno.test('THE REAL ROW: unstructured "~108 min easy" resolves to 108 minutes', () => {
  const planned = { computed: null, intervals: [], total_duration_seconds: null, duration: 108 };
  assertEquals(sumPlanned(planned), { seconds: 6480, meters: null });
  // And the ride that missed: 64 min against 108 is a ratio of 0.59, inside the 0.50-1.50 window.
  const ratio = 3840 / 6480;
  assertEquals(ratio > 0.5 && ratio < 1.5, true);
});

Deno.test('total_duration_seconds is preferred over the minutes column', () => {
  assertEquals(sumPlanned({ computed: null, intervals: [], total_duration_seconds: 5400, duration: 108 }), { seconds: 5400, meters: null });
});

Deno.test('a legacy duration already in seconds is not multiplied again', () => {
  // Same >=1000 heuristic the caller uses on workouts.moving_time.
  assertEquals(sumPlanned({ computed: null, intervals: [], duration: 6480 }), { seconds: 6480, meters: null });
});

Deno.test('genuinely empty stays null — the fallback must not invent a length', () => {
  assertEquals(sumPlanned({ computed: null, intervals: [] }), { seconds: null, meters: null });
  assertEquals(sumPlanned({ computed: null, intervals: [], duration: 0 }), { seconds: null, meters: null });
  assertEquals(sumPlanned({}), { seconds: null, meters: null });
});

Deno.test('distance-only steps still report meters, and are unaffected by the fallback', () => {
  assertEquals(sumPlanned({ computed: { steps: [{ original_val: 10, original_units: 'mi' }] }, duration: 90 }).meters, 16093.4);
});
