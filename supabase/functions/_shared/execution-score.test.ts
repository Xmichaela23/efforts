import { assertEquals } from 'jsr:@std/assert';
import { executionFromEasyHr, executionFromWorkReps } from './execution-score.ts';
import { secondsInPaceRangeBetween } from './run-pace.ts';
import { shareInPowerRange } from './ride-power.ts';

Deno.test('Garmin\'s example: 50 of 60 minutes in range is 83%', () => {
  const r = executionFromWorkReps([{ seconds: 3600, in_range_s: 3000, average_in_range: true }]);
  assertEquals(r.pct, 83);
});

Deno.test('every rep in range reads 100, every rep far out reads 0', () => {
  const clean = Array.from({ length: 6 }, () => ({ seconds: 240, in_range_s: 240, average_in_range: true }));
  assertEquals(executionFromWorkReps(clean), { pct: 100, reps_in_range: 6, reps_judged: 6, fallback_reps: 0 });
  const fast = Array.from({ length: 6 }, () => ({ seconds: 240, in_range_s: 0, average_in_range: false }));
  assertEquals(executionFromWorkReps(fast), { pct: 0, reps_in_range: 0, reps_judged: 6, fallback_reps: 0 });
});

Deno.test('a rep with no per-second count falls back to its average: all or nothing', () => {
  const r = executionFromWorkReps([
    { seconds: 240, in_range_s: null, average_in_range: true },
    { seconds: 240, in_range_s: null, average_in_range: false },
  ]);
  assertEquals(r, { pct: 50, reps_in_range: 1, reps_judged: 2, fallback_reps: 2 });
});

Deno.test('no judged rep, no score', () => {
  assertEquals(executionFromWorkReps([{ seconds: 240, in_range_s: null, average_in_range: null }]).pct, null);
  assertEquals(executionFromWorkReps([]).pct, null);
});

Deno.test('easy: seconds under the ceiling over moving seconds, never above 100', () => {
  assertEquals(executionFromEasyHr(1800, 2400), 75);
  assertEquals(executionFromEasyHr(2500, 2400), 100);
  assertEquals(executionFromEasyHr(null, 2400), null);
  assertEquals(executionFromEasyHr(100, null), null);
});

Deno.test('pace seconds in range: moving seconds only, the range with no allowance', () => {
  // 1 Hz; 3.2 m/s = 8:23/mi for 10 s, then 2.0 m/s = 13:25/mi for 10 s, then stopped for 5 s.
  const samples: { t: number; d: number; v: number }[] = [];
  let d = 0;
  for (let t = 0; t <= 25; t += 1) {
    const v = t <= 10 ? 3.2 : t <= 20 ? 2.0 : 0;
    samples.push({ t, d, v });
    d += v;
  }
  assertEquals(secondsInPaceRangeBetween(samples, 0, 25, 480, 540), 10);
  assertEquals(secondsInPaceRangeBetween(samples, 0, 25, 780, 840), 10);
  assertEquals(secondsInPaceRangeBetween(samples, 0, 25, 100, 200), 0);
  assertEquals(secondsInPaceRangeBetween(samples, 0, 25, null, 540), null);
});

Deno.test('power share in range: zeros count, a floor with no ceiling counts at or above it', () => {
  assertEquals(shareInPowerRange([0, 200, 250, 300], 200, 260), 0.5);
  assertEquals(shareInPowerRange([0, 200, 250, 300], 200, null), 0.75);
  assertEquals(shareInPowerRange([], 200, 260), null);
});
