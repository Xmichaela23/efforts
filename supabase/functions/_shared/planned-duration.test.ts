// "How long was this session planned to be" — one answer for the attach matcher, the analyzers, the
// Performance chip, and (2026-09-10) every phone surface through get-week and session_detail_v1.
// Written from the real 2026-08-01 row: computed null, intervals [], total_duration_seconds null,
// duration 108, description "~108 min easy, all conversational". That session was BOTH unattachable
// and unscoreable, because two readers each looked in one place and neither looked here.
// Run: deno test --no-check planned-duration.test.ts
import { assertEquals } from 'https://deno.land/std@0.208.0/assert/mod.ts';
import { resolvePlannedDurationSeconds, plannedStepSeconds } from './planned-duration.ts';

Deno.test('⛔ the stored total leads (2026-09-10) — it is the number athletes already see', () => {
  const planned = {
    computed: { steps: [{ seconds: 600 }, { seconds: 1800 }], total_duration_seconds: 9999 },
    total_duration_seconds: 8888,
    duration: 777,
  };
  assertEquals(resolvePlannedDurationSeconds(planned), 8888);
  assertEquals(plannedStepSeconds(planned), 2400);
});

Deno.test('THE REAL ROW: no steps, no totals, duration 108 → 6480s', () => {
  const planned = { computed: null, intervals: [], total_duration_seconds: null, duration: 108 };
  assertEquals(resolvePlannedDurationSeconds(planned), 6480);
  // 64 min ridden against it = 59%, which is what the screen should say — not 0%.
  assertEquals(Math.round((3840 / 6480) * 100), 59);
});

Deno.test('computed.total_duration_seconds ranks second, above the steps and the columns', () => {
  assertEquals(resolvePlannedDurationSeconds({ computed: { total_duration_seconds: 5400, steps: [{ seconds: 60 }] }, duration: 30 }), 5400);
  assertEquals(resolvePlannedDurationSeconds({ computed: null, total_duration_seconds: 3600, duration: 30 }), 3600);
});

Deno.test('the steps come third, and a distance step is priced at its pace target', () => {
  assertEquals(resolvePlannedDurationSeconds({ computed: { steps: [{ seconds: 600 }, { seconds: 1800 }] }, duration: 30 }), 2400);
  // 1609.34 m at 8:00/mi = 480 s, off each of the three pace shapes.
  assertEquals(resolvePlannedDurationSeconds({ computed: { steps: [{ distanceMeters: 1609.34, pace_sec_per_mi: 480 }] } }), 480);
  assertEquals(resolvePlannedDurationSeconds({ computed: { steps: [{ distanceMeters: 1609.34, pace_range: { lower: 470, upper: 490 } }] } }), 480);
  assertEquals(resolvePlannedDurationSeconds({ computed: { steps: [{ distanceMeters: 1609.34, paceTarget: '8:00/mi' }] } }), 480);
});

Deno.test('computed may arrive as a JSON string', () => {
  assertEquals(resolvePlannedDurationSeconds({ computed: JSON.stringify({ total_duration_seconds: 2700 }) }), 2700);
});

Deno.test('the duration column is minutes, unless it is plainly already seconds', () => {
  assertEquals(resolvePlannedDurationSeconds({ duration: 45 }), 2700);
  assertEquals(resolvePlannedDurationSeconds({ duration: 6480 }), 6480); // legacy row, not multiplied again
});

Deno.test('nothing stated → null, never a fabricated length — and no minutes read out of prose', () => {
  assertEquals(resolvePlannedDurationSeconds({}), null);
  assertEquals(resolvePlannedDurationSeconds({ computed: null, intervals: [], duration: 0 }), null);
  assertEquals(resolvePlannedDurationSeconds(null), null);
  assertEquals(resolvePlannedDurationSeconds({ description: '~45 min easy', steps_preset: ['run_easy_45min'] }), null);
  assertEquals(plannedStepSeconds({ computed: { steps: [] } }), null);
});

Deno.test('legacy `intervals` count, including repeat blocks', () => {
  assertEquals(resolvePlannedDurationSeconds({ intervals: [{ duration: 1200 }, { duration: 1200 }] }), 2400);
  assertEquals(resolvePlannedDurationSeconds({ intervals: [{ repeatCount: 4, segments: [{ duration: 240 }, { duration: 120 }] }] }), 1440);
});
