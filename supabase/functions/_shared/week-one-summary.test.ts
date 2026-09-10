/**
 * The sample week's summary (audit H-P05): the counts and the two sentences the grid used to work out.
 */
import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { weekOneSummary } from './week-one-summary.ts';

const S = (day: string, type: string, name: string, duration: number, tags: string[] = []) =>
  ({ day, type, name, duration, tags });

Deno.test('counts training and rest days, lifting days without the plyo day, and the minutes', () => {
  const s = weekOneSummary([
    S('Monday', 'strength', 'Test: Upper', 45, ['test_week']),
    S('Monday', 'run', 'Hard Run', 43),
    S('Wednesday', 'strength', 'Plyometrics', 20, ['plyo']),
    S('Saturday', 'ride', 'Ride', 130, ['long_ride']),
  ], 0)!;
  assertEquals([s.training_days, s.rest_days, s.lift_days, s.total_minutes], [3, 4, 1, 238]);
  assertEquals(
    s.balance_note,
    'This week is arranged to balance the stressors — lifting on Monday, the hard session and the long ride spaced around it.',
  );
  assertEquals(s.press_days_note, null);
});

Deno.test('no balance sentence when the solver reported a compromise; the press-days sentence on consecutive press days', () => {
  const s = weekOneSummary([
    S('Monday', 'strength', 'Bench Press', 50),
    S('Tuesday', 'strength', 'Overhead Press', 50),
    S('Tuesday', 'run', 'Hard Run', 40),
  ], 1)!;
  assertEquals(s.balance_note, null);
  assertEquals(s.press_days_note, 'Press days sit together on purpose — no recovery gap needed.');
});

Deno.test('no week, no summary', () => {
  assertEquals(weekOneSummary([], 0), null);
  assertEquals(weekOneSummary(null, 0), null);
});
