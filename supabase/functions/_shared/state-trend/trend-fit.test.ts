/**
 * The chart trendline, moved to the server (audit 2026-09-10, H-B07).
 *
 *   ~/.deno/bin/deno test supabase/functions/_shared/state-trend/trend-fit.test.ts
 */
import { assert, assertAlmostEquals, assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { fitTrend, spineTrends } from './trend-fit.ts';

Deno.test('fit: start, end and weeks of the least-squares line — a hand-checked case', () => {
  // x = 0, 7, 21 days; y = 1.65, 1.60, 1.50 → slope −1/140 per day, intercept 1.65.
  const f = fitTrend([
    { date: '2026-08-22', value: 1.50 },
    { date: '2026-08-01', value: 1.65 },
    { date: '2026-08-08', value: 1.60 },
  ]);
  assert(!f.tooFew);
  if (f.tooFew) return;
  assertAlmostEquals(f.start, 1.65, 1e-9);
  assertAlmostEquals(f.end, 1.50, 1e-9);
  assertEquals(f.weeks, 3);
  assertEquals(f.n, 3);
});

Deno.test('fit: fewer than three usable points is "too few", with the count', () => {
  assertEquals(fitTrend([]), { tooFew: true, n: 0 });
  assertEquals(fitTrend([{ date: '2026-08-01', value: 1 }, { date: '2026-08-08', value: 2 }]), { tooFew: true, n: 2 });
  assertEquals(fitTrend([{ date: '2026-08-01', value: 1 }, { date: '2026-08-08', value: Number.NaN }, { date: '2026-08-15', value: 2 }]), { tooFew: true, n: 2 });
});

Deno.test('fit: every point on one day has no slope → too few', () => {
  assertEquals(fitTrend([1, 2, 3].map((v) => ({ date: '2026-08-01', value: v }))), { tooFew: true, n: 3 });
});

Deno.test('fit: weeks is capped at the 12-week window and is at least 1', () => {
  const long = fitTrend([{ date: '2026-01-01', value: 1 }, { date: '2026-02-01', value: 2 }, { date: '2026-04-11', value: 3 }]);
  assert(!long.tooFew && long.weeks === 12);
  const short = fitTrend([{ date: '2026-01-01', value: 1 }, { date: '2026-01-02', value: 2 }, { date: '2026-01-03', value: 3 }]);
  assert(!short.tooFew && short.weeks === 1);
});

const pt = (date: string, o: Record<string, unknown> = {}) => ({
  date, efficiency: 1.5, driftPct: 4, driftBasis: 'gap' as const, driftWholeSession: false, fadeWithheld: false, ...o,
});

Deno.test('spine trends: the efficiency chart takes the sessions that count toward the trend', () => {
  const { efficiencyTrend } = spineTrends([
    pt('2026-08-01'), pt('2026-08-08', { countsTowardTrend: false }), pt('2026-08-15', { efficiency: null }), pt('2026-08-22'),
  ]);
  assertEquals(efficiencyTrend.points.map((p) => p.date), ['2026-08-01', '2026-08-22']);
  assertEquals(efficiencyTrend.fit, { tooFew: true, n: 2 });
});

Deno.test('spine trends: the drift chart takes ratio reads only — no heart-rate-alone, withheld or interval day', () => {
  const { driftTrend } = spineTrends([
    pt('2026-08-01'),
    pt('2026-08-02', { driftBasis: 'power', driftPct: 6 }),
    pt('2026-08-03', { driftBasis: 'hr' }),
    pt('2026-08-04', { fadeWithheld: true }),
    pt('2026-08-05', { driftWholeSession: true }),
    pt('2026-08-06', { driftPct: null }),
    pt('2026-08-07', { countsTowardTrend: false }),
    pt('2026-08-08', { driftBasis: 'raw', driftPct: 5 }),
  ]);
  assertEquals(driftTrend.points, [
    { date: '2026-08-01', value: 4 }, { date: '2026-08-02', value: 6 }, { date: '2026-08-08', value: 5 },
  ]);
  assert(!driftTrend.fit.tooFew && driftTrend.fit.n === 3);
});
