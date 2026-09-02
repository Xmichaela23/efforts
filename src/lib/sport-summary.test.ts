/**
 * THE COLLAPSED SPORT LINE — leads with change; direction word only when the verdict supports it.
 *   deno test --allow-read src/lib/sport-summary.test.ts --no-check
 */
import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { changeMonth, dirWord, efficiencySummary, strengthSummary } from './sport-summary.ts';

Deno.test('changeMonth = the start of the window (asOf − windowDays)', () => {
  assertEquals(changeMonth('2026-09-01', 42), 'Jul'); // 42d back from Sep 1 → Jul 21
  assertEquals(changeMonth('2026-09-01', null), '');
  assertEquals(changeMonth(null, 42), '');
});

Deno.test('⛔ direction word only when the verdict supports one', () => {
  assertEquals(dirWord('improving'), 'up');
  assertEquals(dirWord('sliding'), 'down');
  assertEquals(dirWord('holding'), '');
  assertEquals(dirWord('needs_data'), '');
  assertEquals(dirWord('withheld'), '');
});

Deno.test('efficiency line leads with the change when the verdict calls a direction', () => {
  assertEquals(
    efficiencySummary({ label: 'pace per heartbeat', verdict: 'improving', pctChange: 4.2, sampleCount: 10, asOf: '2026-09-01', windowDays: 42, noun: 'run' }),
    'pace per heartbeat up 4% since Jul',
  );
});

Deno.test('⛔ no direction → number and count, never an invented direction', () => {
  assertEquals(
    efficiencySummary({ label: 'pace per heartbeat', verdict: 'holding', pctChange: 0.3, sampleCount: 8, asOf: '2026-09-01', windowDays: 42, noun: 'run' }),
    'pace per heartbeat · 8 runs',
  );
  assertEquals(
    efficiencySummary({ label: 'watts per heartbeat', verdict: 'needs_data', pctChange: null, sampleCount: 1, asOf: '2026-09-01', windowDays: 42, noun: 'ride' }),
    'watts per heartbeat · 1 ride',
  );
});

Deno.test('strength lead: two measured numbers, no verdict word', () => {
  assertEquals(strengthSummary('Deadlift', 185, 180), 'Deadlift 185, up from 180');
  assertEquals(strengthSummary('Squat', 120, 130), 'Squat 120, down from 130');
  assertEquals(strengthSummary('Bench Press', 160, 160), 'Bench Press 160');
  assertEquals(strengthSummary('Deadlift', 185, null), 'Deadlift 185');
});
