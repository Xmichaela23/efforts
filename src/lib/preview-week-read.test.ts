// Run: deno test --no-check --allow-read src/lib/preview-week-read.test.ts
import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import {
  conflictsOf, hardIntensityOf, isHardPreviewSession, placedHardDays, placedHardSessions,
} from './preview-week-read.ts';

const S = (day: string, type: string, name: string, family: string) =>
  ({ day, type, name, tags: ['standing_plan', `family:${family}`, `sport:${type}`] });

// ⛔ THE DEVICE CASE (2026-09-03): the built plan put "Anaerobic Ride" on Tuesday and the card said
// Mon, because no name regex matched "Anaerobic Ride".
const WEEK = [
  S('Monday', 'run', 'Hard Run', 'run_mlss'),
  S('Tuesday', 'ride', 'Anaerobic Ride', 'ride_anaerobic'),
  S('Wednesday', 'run', 'Near-threshold Run', 'run_near_threshold'),
  S('Thursday', 'ride', 'Ride', 'ride_endurance'),
  S('Saturday', 'ride', 'Ride', 'ride_endurance'),
];
const SLOTS = [{ discipline: 'run' as const }, { discipline: 'bike' as const }, { discipline: 'run' as const }];

Deno.test('a placed hard session is found by its family tag, whatever its name', () => {
  assertEquals(placedHardDays(WEEK, SLOTS), ['monday', 'tuesday', 'wednesday']);
  assertEquals(isHardPreviewSession(S('x', 'ride', 'Ride', 'ride_endurance')), false);
  assertEquals(isHardPreviewSession({ day: 'x', type: 'ride', name: 'Hard Ride' }), false, 'no tag, no guess');
});

Deno.test('the row label reads the family: anaerobic ride is top-end, near-threshold is threshold', () => {
  const placed = placedHardSessions(WEEK, SLOTS);
  assertEquals(placed.map((s) => hardIntensityOf((s?.tags ?? []).find((t) => t.startsWith('family:'))!.slice(7))),
    ['top-end', 'top-end', 'threshold']);
  assertEquals(hardIntensityOf('ride_endurance'), null);
});

Deno.test('conflicts are the compromises with a known rule; everything else is a trade-off', () => {
  const cs = [
    { text: 'a', rule: 'two_hard_one_day' },
    { text: 'b' },
    { text: 'c', rule: 'no_rest_day' },
    { text: 'd', rule: 'mid_week_start' },
  ];
  assertEquals(conflictsOf(cs).map((c) => c.text), ['a', 'c']);
});
