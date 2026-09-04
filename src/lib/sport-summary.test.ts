/**
 * The collapsed sport row helpers — run with `deno test src/lib/sport-summary.test.ts --no-check`.
 * 2026-09-04: the endurance rows print the LAST workout's number and its day (TrainingPeaks' per-workout
 * Efficiency Factor); the arrow / percent-since / recent-half helpers are gone with the Garmin rule.
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
  assertEquals(strengthGlanceRows([], 4), []);
});

// ── THE HEADLINE = the average of the last 28 days (Garmin), the same half the arrow reads ────────
