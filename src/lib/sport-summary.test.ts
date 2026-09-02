/**
 * THE COLLAPSED SPORT LINE — right population, confidence-gated, consistent grammar (2026-09-01).
 *   deno test --allow-read src/lib/sport-summary.test.ts --no-check
 */
import { assert, assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { changeMonth, dirWord, efficiencySummary, pickStrengthLead, sinceMonthFromSeries, strengthSummary } from './sport-summary.ts';

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

Deno.test('strength lead: pick the lift that MOVED, not the freshly-tested one; delta = prior weekly reading', () => {
  const lifts = [
    { displayName: 'Back Squat', latestE1rm: 125, series: [{ value: 125 }] },                    // just tested, one point → no delta
    { displayName: 'Deadlift', latestE1rm: 185, series: [{ value: 178 }, { value: 180 }, { value: 185 }] }, // +5
    { displayName: 'Bench Press', latestE1rm: 162, series: [{ value: 160 }, { value: 162 }] },     // +2
  ];
  const lead = pickStrengthLead(lifts)!;
  assertEquals(lead.name, 'Deadlift');
  assertEquals(strengthSummary(lead.name, lead.latest, lead.prior), 'Deadlift 185, up from 180');
});

Deno.test('⛔ no lift has a confident change → strongest number, NO manufactured delta', () => {
  const lifts = [
    { displayName: 'Back Squat', latestE1rm: 125, series: [{ value: 125 }] },
    { displayName: 'Deadlift', latestE1rm: 185, series: [{ value: 185 }] },
  ];
  const lead = pickStrengthLead(lifts)!;
  assertEquals(lead.name, 'Deadlift');
  assertEquals(lead.prior, null);
  assertEquals(strengthSummary(lead.name, lead.latest, lead.prior), 'Deadlift 185');
});

Deno.test('strengthSummary: equal or absent prior → just the number', () => {
  assertEquals(strengthSummary('Squat', 120, 130), 'Squat 120, down from 130');
  assertEquals(strengthSummary('Bench Press', 160, 160), 'Bench Press 160');
  assertEquals(strengthSummary('Deadlift', 185, null), 'Deadlift 185');
});

Deno.test('pickStrengthLead: no lifts → null', () => {
  assert(pickStrengthLead([]) === null);
});
