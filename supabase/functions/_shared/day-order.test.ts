/**
 * The day's listing order, decided on the server (audit H-T16, 2026-09-10). The cases are the phone's
 * own (`src/lib/pairing-timing.test.ts`, deleted with the phone rule).
 *   deno test --no-lock --allow-all supabase/functions/_shared/day-order.test.ts
 */
import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { dayOrderFor, orderDay, type DayOrderRow } from './day-order.ts';

const id = (r: DayOrderRow) => r;
const qualityRun = { type: 'run', tags: ['quality'], name: 'Quality Run 4×1mi' };
const lowerStrength = { type: 'strength', tags: ['lower_body'], name: 'Strength (Lower)' };
const upperStrength = { type: 'strength', tags: ['upper_body'], name: 'Strength (Upper)' };
const swim = { type: 'swim', tags: [], name: 'Swim — Drills' };
const longRide = { type: 'ride', tags: ['long_ride'], name: 'Long Ride' };
const easyRun = { type: 'run', tags: ['easy_run'], name: 'Easy Run' };

Deno.test('the barbell goes first on a quality pair, whichever way the rows arrive', () => {
  assertEquals(orderDay([qualityRun, lowerStrength], id).map((w) => w.type), ['strength', 'run']);
  assertEquals(orderDay([lowerStrength, qualityRun], id).map((w) => w.type), ['strength', 'run']);
});

Deno.test('a long ride goes before the lift; an easy run goes after it', () => {
  assertEquals(orderDay([lowerStrength, longRide], id).map((w) => w.name), ['Long Ride', 'Strength (Lower)']);
  assertEquals(orderDay([easyRun, lowerStrength], id).map((w) => w.name), ['Strength (Lower)', 'Easy Run']);
});

Deno.test('no lower-body lift: discipline order, swim before an upper-body lift', () => {
  assertEquals(orderDay([upperStrength, swim], id).map((w) => w.type), ['swim', 'strength']);
});

Deno.test('a stored AM/PM on the row is read when the day has no pair to decide', () => {
  const pm = { type: 'swim', tags: [], name: 'Swim', workout_metadata: { timing: 'PM' } };
  const am = { type: 'strength', tags: ['upper_body'], name: 'Upper', workout_metadata: { timing: 'AM' } };
  assertEquals(orderDay([pm, am], id).map((w) => w.name), ['Upper', 'Swim']);
});

Deno.test('a lower-body lift is read from its name when the tag is missing', () => {
  const squat = { type: 'strength', tags: [], name: 'Lower body: Squat' };
  assertEquals(orderDay([qualityRun, squat], id).map((w) => w.type), ['strength', 'run']);
});

Deno.test('day_order is 1-based within each day and rows with no day get none', () => {
  const rows = [
    { date: '2026-09-10', ...qualityRun },
    { date: '2026-09-10', ...lowerStrength },
    { date: '2026-09-11', ...swim },
    { date: null, ...easyRun },
  ];
  const order = dayOrderFor(rows, (r) => r.date, id);
  assertEquals(order.get(rows[1]), 1);
  assertEquals(order.get(rows[0]), 2);
  assertEquals(order.get(rows[2]), 1);
  assertEquals(order.get(rows[3]), undefined);
});

Deno.test('degenerate inputs: one row or none', () => {
  assertEquals(orderDay([qualityRun], id), [qualityRun]);
  assertEquals(orderDay([], id), []);
});
