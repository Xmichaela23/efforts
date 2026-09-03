/**
 * THE COLLAPSED SPORT ROW — right population, confidence-gated, ONE grammar for every sport.
 * Row shape (name · value · note) per DESIGN_GUIDELINES "Layout Rules" §1, 2026-09-03.
 *   deno test --allow-read src/lib/sport-summary.test.ts --no-check
 */
import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { changeMonth, dirWord, efficiencyRow, sinceMonthFromSeries, strengthGlanceRows } from './sport-summary.ts';

Deno.test('changeMonth = start of the window (asOf − windowDays)', () => {
  assertEquals(changeMonth('2026-09-01', 42), 'Jul');
  assertEquals(changeMonth('2026-09-01', null), '');
});

Deno.test('sinceMonthFromSeries = the first recent point\'s month', () => {
  assertEquals(sinceMonthFromSeries([{ date: '2026-06-10', recent: false }, { date: '2026-07-20', recent: true }, { date: '2026-08-30', recent: true }]), 'Jul');
  assertEquals(sinceMonthFromSeries([]), '');
});

Deno.test('⛔ direction word only when the verdict supports one', () => {
  assertEquals(dirWord('improving'), 'up');
  assertEquals(dirWord('sliding'), 'down');
  for (const v of ['holding', 'needs_data', 'withheld', 'still_learning', null]) assertEquals(dirWord(v), '');
});

Deno.test('efficiency ROW: a direction becomes the value when there is no real number', () => {
  assertEquals(
    efficiencyRow({ label: 'pace per heartbeat', verdict: 'improving', pctChange: 4.2, sampleCount: 10, sinceMonth: 'Jul', noun: 'easy run' }),
    { name: 'pace per heartbeat', value: 'up 4% since Jul' },
  );
});

Deno.test('efficiency ROW: the REAL VALUE takes the number column, the change becomes the note', () => {
  assertEquals(
    efficiencyRow({ label: 'pace per heartbeat', value: '8:30/mi', verdict: 'improving', pctChange: 4.2, sampleCount: 10, sinceMonth: 'Jul', noun: 'easy run' }),
    { name: 'pace per heartbeat', value: '8:30/mi', note: 'up 4% since Jul' },
  );
  // no direction → value + count, never a bare count
  assertEquals(
    efficiencyRow({ label: 'power', value: '210 W', verdict: 'holding', pctChange: null, sampleCount: 6, sinceMonth: 'Jul', noun: 'ride' }),
    { name: 'power', value: '210 W', note: '6 rides' },
  );
});

Deno.test('⛔ no direction (incl. the false −22% case once it is the HOLDING easy group) → the count, never a collapse', () => {
  // The pooled series called "sliding −22", but the easy group holds → the row states the count.
  assertEquals(
    efficiencyRow({ label: 'pace per heartbeat', verdict: 'holding', pctChange: -22, sampleCount: 9, sinceMonth: 'Jul', noun: 'easy run' }),
    { name: 'pace per heartbeat', value: '9 easy runs' },
  );
  assertEquals(
    efficiencyRow({ label: 'watts per heartbeat', verdict: 'needs_data', pctChange: null, sampleCount: 5, sinceMonth: '', noun: 'ride' }),
    { name: 'watts per heartbeat', value: '5 rides' },
  );
});

Deno.test('⛔ strength is NOT PR-based: one ROW per lift; opening lists the working numbers, no "tested" claim', () => {
  const lifts = [
    { displayName: 'Deadlift', latestE1rm: 185, series: [{ value: 185, week: 1 }] },
    { displayName: 'Back Squat', latestE1rm: 125, series: [{ value: 125, week: 1 }] },
    { displayName: 'Bench Press', latestE1rm: 160, series: [{ value: 160, week: 1 }] },
  ];
  const opening = [
    { name: 'Deadlift', value: '185' },
    { name: 'Back Squat', value: '125' },
    { name: 'Bench Press', value: '160' },
  ];
  assertEquals(strengthGlanceRows(lifts, 1), opening);
  // no active plan (null) → still just the working numbers
  assertEquals(strengthGlanceRows(lifts, null), opening);
});

Deno.test('mid-block: the creep since the block opened is the NOTE; slow gain, no PR flag', () => {
  const lifts = [
    { displayName: 'Back Squat', latestE1rm: 125, series: [{ value: 125, week: 1 }] },                       // flat → no note
    { displayName: 'Deadlift', latestE1rm: 185, series: [{ value: 180, week: 1 }, { value: 185, week: 4 }] }, // +5
    { displayName: 'Bench Press', latestE1rm: 162, series: [{ value: 160, week: 1 }, { value: 162, week: 4 }] }, // +2
  ];
  assertEquals(strengthGlanceRows(lifts, 4), [
    { name: 'Back Squat', value: '125' },
    { name: 'Deadlift', value: '185', note: '+5' },
    { name: 'Bench Press', value: '162', note: '+2' },
  ]);
});

Deno.test('mid-block: a real drop shows honestly; flat carries no note', () => {
  assertEquals(
    strengthGlanceRows([{ displayName: 'Squat', latestE1rm: 120, series: [{ value: 130, week: 2 }, { value: 120, week: 5 }] }], 5),
    [{ name: 'Squat', value: '120', note: '-10' }],
  );
  assertEquals(
    strengthGlanceRows([{ displayName: 'Deadlift', latestE1rm: 185, series: [{ value: 185, week: 1 }, { value: 185, week: 4 }] }], 4),
    [{ name: 'Deadlift', value: '185' }],
  );
});

Deno.test('mid-block but no block-start point to compare → bare number, no invented delta', () => {
  const lifts = [
    { displayName: 'Back Squat', latestE1rm: 125, series: [{ value: 125 }] }, // older-block point, no week
    { displayName: 'Deadlift', latestE1rm: 185, series: [{ value: 185 }] },
  ];
  assertEquals(strengthGlanceRows(lifts, 4), [
    { name: 'Back Squat', value: '125' },
    { name: 'Deadlift', value: '185' },
  ]);
});

Deno.test('strengthGlanceRows: no lifts → []', () => {
  assertEquals(strengthGlanceRows([], 4), []);
});
