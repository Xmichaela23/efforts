import { assertEquals } from 'jsr:@std/assert';
import { executionFromEasyHr, executionFromSections } from './execution-score.ts';
import { secondsInPaceRangeBetween } from './run-pace.ts';
import { shareInPowerRange } from './ride-power.ts';

const rep = (o: Partial<Parameters<typeof executionFromSections>[0][number]>) =>
  ({ planned_s: 240, completion: 1, seconds: 240, in_range_s: 240, average_in_range: true, is_rep: true, ...o });

Deno.test('COROS\'s example: all the distance, 80% in the zone, reads 90%', () => {
  const r = executionFromSections([rep({ planned_s: 960, seconds: 960, in_range_s: 768 })]);
  assertEquals([r.pct, r.completion_pct, r.intensity_pct], [90, 100, 80]);
});

Deno.test('clean reads 100; every rep done but far too fast reads 50, not 0', () => {
  assertEquals(executionFromSections(Array.from({ length: 6 }, () => rep({}))).pct, 100);
  const fast = executionFromSections(Array.from({ length: 6 }, () => rep({ seconds: 210, completion: 1, in_range_s: 0, average_in_range: false })));
  assertEquals([fast.pct, fast.reps_in_range, fast.reps_judged], [50, 0, 6]);
});

Deno.test('two of six reps skipped, the other four in range: 67% done, 100% in range, about 83%', () => {
  const skipped = { completion: 0, seconds: 0, in_range_s: 0, average_in_range: false, is_rep: false };
  const r = executionFromSections([rep({}), rep({}), rep({}), rep({}), rep(skipped), rep(skipped)]);
  assertEquals([r.pct, r.completion_pct, r.intensity_pct, r.reps_judged], [83, 67, 100, 4]);
});

Deno.test('a section with no per-second count falls back to its average: all or nothing', () => {
  const r = executionFromSections([rep({ in_range_s: null }), rep({ in_range_s: null, average_in_range: false })]);
  assertEquals([r.pct, r.intensity_pct, r.fallback_reps], [75, 50, 2]);
});

Deno.test('no targeted section, no score', () => {
  assertEquals(executionFromSections([]).pct, null);
});

Deno.test('easy: moving over planned, and time under the ceiling over moving, averaged', () => {
  assertEquals(executionFromEasyHr(1800, 2400, 2400).pct, 88); // (100 + 75) / 2
  assertEquals(executionFromEasyHr(2400, 1800, 2400).pct, 88); // (75 + 100) / 2
  assertEquals(executionFromEasyHr(null, 2400, 2400).pct, null);
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
