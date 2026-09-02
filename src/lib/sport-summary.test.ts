/**
 * THE COLLAPSED SPORT LINE — right population, confidence-gated, consistent grammar (2026-09-01).
 *   deno test --allow-read src/lib/sport-summary.test.ts --no-check
 */
import { assert, assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { changeMonth, dirWord, efficiencySummary, sinceMonthFromSeries, strengthGlance } from './sport-summary.ts';

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

Deno.test('efficiency line leads with the change when the verdict calls a direction', () => {
  assertEquals(
    efficiencySummary({ label: 'pace per heartbeat', verdict: 'improving', pctChange: 4.2, sampleCount: 10, sinceMonth: 'Jul', noun: 'easy run' }),
    'pace per heartbeat up 4% since Jul',
  );
});

Deno.test('efficiency line leads with the REAL VALUE when one is passed', () => {
  assertEquals(
    efficiencySummary({ label: 'pace per heartbeat', value: '8:30/mi at 145 bpm', verdict: 'improving', pctChange: 4.2, sampleCount: 10, sinceMonth: 'Jul', noun: 'easy run' }),
    '8:30/mi at 145 bpm · up 4% since Jul',
  );
  // no direction → value · count, never a bare count
  assertEquals(
    efficiencySummary({ label: 'power', value: '210 W', verdict: 'holding', pctChange: null, sampleCount: 6, sinceMonth: 'Jul', noun: 'ride' }),
    '210 W · 6 rides',
  );
});

Deno.test('⛔ no direction (incl. the false −22% case once it is the HOLDING easy group) → number and count', () => {
  // The pooled series called "sliding −22", but the easy group holds → the line states the count, not a collapse.
  assertEquals(
    efficiencySummary({ label: 'pace per heartbeat', verdict: 'holding', pctChange: -22, sampleCount: 9, sinceMonth: 'Jul', noun: 'easy run' }),
    'pace per heartbeat · 9 easy runs',
  );
  assertEquals(
    efficiencySummary({ label: 'watts per heartbeat', verdict: 'needs_data', pctChange: null, sampleCount: 5, sinceMonth: '', noun: 'ride' }),
    'watts per heartbeat · 5 rides',
  );
});

Deno.test('⛔ strength is NOT PR-based: opening week lists the working numbers, no "tested" claim', () => {
  const lifts = [
    { displayName: 'Deadlift', latestE1rm: 185, series: [{ value: 185, week: 1 }] },
    { displayName: 'Back Squat', latestE1rm: 125, series: [{ value: 125, week: 1 }] },
    { displayName: 'Bench Press', latestE1rm: 160, series: [{ value: 160, week: 1 }] },
  ];
  assertEquals(strengthGlance(lifts, 1), 'Deadlift 185 · Back Squat 125 · Bench Press 160');
  // no active plan (null) → still just the working numbers
  assertEquals(strengthGlance(lifts, null), 'Deadlift 185 · Back Squat 125 · Bench Press 160');
});

Deno.test('mid-block: lead the lift that moved MOST since the block opened; slow gain, no PR flag', () => {
  const lifts = [
    { displayName: 'Back Squat', latestE1rm: 125, series: [{ value: 125, week: 1 }] },                       // flat
    { displayName: 'Deadlift', latestE1rm: 185, series: [{ value: 180, week: 1 }, { value: 185, week: 4 }] }, // +5
    { displayName: 'Bench Press', latestE1rm: 162, series: [{ value: 160, week: 1 }, { value: 162, week: 4 }] }, // +2
  ];
  assertEquals(strengthGlance(lifts, 4), 'Deadlift 185 · +5 since week 1');
});

Deno.test('mid-block: a real drop is shown honestly; nothing moved → "even since week N"', () => {
  assertEquals(
    strengthGlance([{ displayName: 'Squat', latestE1rm: 120, series: [{ value: 130, week: 2 }, { value: 120, week: 5 }] }], 5),
    'Squat 120 · -10 since week 2',
  );
  assertEquals(
    strengthGlance([{ displayName: 'Deadlift', latestE1rm: 185, series: [{ value: 185, week: 1 }, { value: 185, week: 4 }] }], 4),
    'Deadlift 185 · even since week 1',
  );
});

Deno.test('mid-block but no block-start point to compare → strongest number, no invented delta', () => {
  const lifts = [
    { displayName: 'Back Squat', latestE1rm: 125, series: [{ value: 125 }] }, // older-block point, no week
    { displayName: 'Deadlift', latestE1rm: 185, series: [{ value: 185 }] },
  ];
  assertEquals(strengthGlance(lifts, 4), 'Deadlift 185');
});

Deno.test('strengthGlance: no lifts → null', () => {
  assert(strengthGlance([], 4) === null);
});
