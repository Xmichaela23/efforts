/**
 * ⛔ GARMIN'S RULE, PINNED (2026-09-04, docs/SPEC-state-nothing-invented-2026-09-04.md).
 * The average of the last 28 days against the average of the 28 days before:
 *   higher → improving (↑) · lower → sliding (↓) · the same at the printed precision → holding (→)
 *   one half empty → needs_data (blank). Nothing else decides.
 *
 * Run from repo root:
 *   deno test supabase/functions/_shared/state-trend/classify-boundary.test.ts --no-check
 */
import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { classifyTrend } from './classify.ts';
import { resolveThresholds, TREND_HALF_DAYS, TREND_WINDOW_DAYS } from './thresholds.ts';

const AS_OF = '2026-09-04';
// recent half = 2026-08-08 .. 2026-09-04 (date > asOf−28); prior half = 2026-07-11 .. 2026-08-07
const HIGHER = resolveThresholds('bike', 0); // watts / e1RM, shown whole: higher is better
const LOWER = resolveThresholds('run', 0); // pace to the second: lower is better
const EF = { ...resolveThresholds('run', 3), lowerIsBetter: false }; // efficiency, shown to 3 decimals

Deno.test('the window is two 28-day halves, and the split is by date', () => {
  assertEquals(TREND_HALF_DAYS, 28);
  assertEquals(TREND_WINDOW_DAYS, 56);
  const t = classifyTrend([{ date: '2026-08-08', value: 100 }, { date: '2026-08-07', value: 90 }], HIGHER, AS_OF);
  assertEquals(t.window, { days: 56, start: '2026-07-10', end: AS_OF, recentStart: '2026-08-07' });
  assertEquals(t.recentCount, 1); // 08-08 is inside the recent half
  assertEquals(t.earlyCount, 1); // 08-07 is the last day of the prior half
});

Deno.test('up: the recent average is higher → improving, pctChange = the change between the two averages', () => {
  const t = classifyTrend([
    { date: '2026-07-15', value: 200 }, { date: '2026-07-29', value: 210 }, // prior avg 205
    { date: '2026-08-12', value: 220 }, { date: '2026-08-26', value: 224 }, // recent avg 222
  ], HIGHER, AS_OF);
  assertEquals(t.verdict, 'improving');
  assertEquals(t.earlyAvg, 205);
  assertEquals(t.recentAvg, 222);
  assertEquals(t.pctChange, 8.3);
});

Deno.test('down: the recent average is lower → sliding', () => {
  const t = classifyTrend([
    { date: '2026-07-15', value: 220 }, { date: '2026-08-01', value: 220 },
    { date: '2026-08-12', value: 200 }, { date: '2026-09-01', value: 196 },
  ], HIGHER, AS_OF);
  assertEquals(t.verdict, 'sliding');
  assertEquals(t.pctChange, -10);
});

Deno.test('lower-is-better flips the arrow, never the number: a faster pace is improving with a negative pctChange', () => {
  const t = classifyTrend([
    { date: '2026-07-20', value: 330 }, { date: '2026-08-20', value: 300 },
  ], LOWER, AS_OF);
  assertEquals(t.verdict, 'improving');
  assertEquals(t.pctChange, -9.1);
  const u = classifyTrend([{ date: '2026-07-20', value: 300 }, { date: '2026-08-20', value: 330 }], LOWER, AS_OF);
  assertEquals(u.verdict, 'sliding');
});

Deno.test('→ the same digits at the displayed precision → holding (Garmin: VO2 max whole, arrow → when the shown number does not move)', () => {
  // e1RM shown whole: 185 vs 185.4 both print 185 → holding; 185 vs 185.5 prints 186 → improving
  const same = classifyTrend([{ date: '2026-07-20', value: 185 }, { date: '2026-08-20', value: 185.4 }], HIGHER, AS_OF);
  assertEquals(same.verdict, 'holding');
  assertEquals(same.pctChange, 0.2); // the change is still reported; the arrow says the shown number did not move
  const moved = classifyTrend([{ date: '2026-07-20', value: 185 }, { date: '2026-08-20', value: 185.5 }], HIGHER, AS_OF);
  assertEquals(moved.verdict, 'improving');
  // efficiency shown to 3 decimals: 1.5674 vs 1.5671 both print 1.567 → holding; 1.567 vs 1.568 → improving
  assertEquals(classifyTrend([{ date: '2026-07-20', value: 1.5671 }, { date: '2026-08-20', value: 1.5674 }], EF, AS_OF).verdict, 'holding');
  assertEquals(classifyTrend([{ date: '2026-07-20', value: 1.567 }, { date: '2026-08-20', value: 1.568 }], EF, AS_OF).verdict, 'improving');
  // pace to the second: 300 vs 300.4 → holding; 300 vs 299 → improving (lower is better)
  assertEquals(classifyTrend([{ date: '2026-07-20', value: 300 }, { date: '2026-08-20', value: 300.4 }], LOWER, AS_OF).verdict, 'holding');
  assertEquals(classifyTrend([{ date: '2026-07-20', value: 300 }, { date: '2026-08-20', value: 299 }], LOWER, AS_OF).verdict, 'improving');
});

Deno.test('blank: one half with no session → needs_data, with the counts on the receipt', () => {
  const recentOnly = classifyTrend([{ date: '2026-08-12', value: 220 }, { date: '2026-08-26', value: 224 }], HIGHER, AS_OF);
  assertEquals(recentOnly.verdict, 'needs_data');
  assertEquals(recentOnly.pctChange, null);
  assertEquals([recentOnly.earlyCount, recentOnly.recentCount, recentOnly.sampleCount], [0, 2, 2]);
  const priorOnly = classifyTrend([{ date: '2026-07-15', value: 220 }], HIGHER, AS_OF);
  assertEquals(priorOnly.verdict, 'needs_data');
  assertEquals(classifyTrend([], HIGHER, AS_OF).verdict, 'needs_data');
});

Deno.test('one session in each half is enough — the only floor', () => {
  const t = classifyTrend([{ date: '2026-07-15', value: 200 }, { date: '2026-08-30', value: 210 }], HIGHER, AS_OF);
  assertEquals(t.verdict, 'improving');
  assertEquals(t.minSessions, 1);
  assertEquals(t.stale, false);
});

Deno.test('outside the 56 days and excluded points do not count; one bad day does not own the read', () => {
  const t = classifyTrend([
    { date: '2026-07-01', value: 999 }, // before the window
    { date: '2026-07-20', value: 200 }, { date: '2026-07-25', value: 100, meta: { phase: 'deload' } },
    { date: '2026-08-20', value: 210 }, { date: '2026-08-21', value: 212 }, { date: '2026-08-22', value: 150 }, // one bad day, averaged not anchored
  ], HIGHER, AS_OF, { exclude: (p) => p.meta?.phase === 'deload' });
  assertEquals(t.sampleCount, 4);
  assertEquals(t.earlyAvg, 200);
  assertEquals(Math.round(t.recentAvg! * 10) / 10, 190.7);
  assertEquals(t.verdict, 'sliding'); // the average moved down 4.7% — reported, not smoothed away
});

Deno.test('no freshness decay: a recent half with only an old-ish session still reads', () => {
  const t = classifyTrend([{ date: '2026-07-15', value: 200 }, { date: '2026-08-09', value: 210 }], HIGHER, AS_OF);
  assertEquals(t.verdict, 'improving');
  assertEquals(t.newestAgeDays, 26);
});
