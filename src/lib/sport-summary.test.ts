/**
 * The collapsed sport row helpers — run with `deno test src/lib/sport-summary.test.ts --no-check`.
 * 2026-09-04: the endurance rows print the LAST workout's number and its day (TrainingPeaks' per-workout
 * Efficiency Factor); the arrow / percent-since / recent-half helpers are gone with the Garmin rule.
 * 2026-09-10: the trendline fit and the since-block creep are the server's; their tests live beside them.
 */
import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { fmtDayShort, latestPoint, strengthGlanceRows } from './sport-summary.ts';

Deno.test('latestPoint: the newest dated point, whatever order they arrive in; null when empty', () => {
  const pts = [
    { date: '2026-08-30', value: 1.6 },
    { date: '2026-09-02', value: 1.72 },
    { date: '2026-08-12', value: 1.5 },
  ];
  assertEquals(latestPoint(pts)?.value, 1.72);
  assertEquals(latestPoint(pts)?.date, '2026-09-02');
  assertEquals(latestPoint([]), null);
  assertEquals(latestPoint([{ date: '2026-09-02', value: Number.NaN }]), null);
});

Deno.test('fmtDayShort: "Sep 2"', () => {
  assertEquals(fmtDayShort('2026-09-02'), 'Sep 2');
  assertEquals(fmtDayShort('2026-09-02T14:00:00Z'), 'Sep 2');
  assertEquals(fmtDayShort(null), '');
});

Deno.test('strengthGlanceRows: no lifts → []', () => {
  assertEquals(strengthGlanceRows([]), []);
});

Deno.test('strengthGlanceRows: the server\'s creep beside the number; flat, opening or absent prints the number alone', () => {
  assertEquals(strengthGlanceRows([
    { displayName: 'Back Squat', latestE1rm: 214.6, sinceBlockDelta: 5 },
    { displayName: 'Bench Press', latestE1rm: 160, sinceBlockDelta: -5 },
    { displayName: 'Deadlift', latestE1rm: 240, sinceBlockDelta: 0 },
    { displayName: 'Overhead Press', latestE1rm: 100, sinceBlockDelta: null },
    { displayName: 'Barbell Row', latestE1rm: null, sinceBlockDelta: 3 },
  ]), [
    { name: 'Back Squat', value: '215', note: '+5' },
    { name: 'Bench Press', value: '160', note: '-5' },
    { name: 'Deadlift', value: '240' },
    { name: 'Overhead Press', value: '100' },
  ]);
});
