/**
 * The day's listing order, decided on the server (audit H-T16, 2026-09-10). Rule 1 is the book's since 2026-09-19:
 * the lift goes first on every leg day (`liftGoesFirst`, Viada p143 rules 5 and 6, p77); the upper day is left to the tie-break.
 *   deno test --no-lock --allow-all supabase/functions/_shared/day-order.test.ts
 */
import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { dayOrderFor, orderDay, type DayOrderRow } from './day-order.ts';

const id = (r: DayOrderRow) => r;
const PLAN = 'plan-1';
const lift = (name: string, tags: string[], intents: string[]) => ({
  type: 'strength', name, training_plan_id: PLAN, tags: ['standing_plan', ...tags],
  strength_exercises: intents.map((slot_intent) => ({ slot_intent })),
});
const upperME = lift('Upper body: Push', ['frame:all_rounder'], ['ME', 'DE', 'HYP']);
const lowerME = lift('Lower body: Hinge', ['frame:all_rounder', 'lower:me'], ['ME', 'HYP', 'DE']);
const lowerHyp = lift('Lower body: Push', ['frame:all_rounder', 'lower:me'], ['ME', 'HYP']);
const session = (type: string, name: string, band: string) =>
  ({ type, name, training_plan_id: PLAN, tags: ['standing_plan', `sport:${type}`, `band:${band}`] });
const hardRun = session('run', 'Intervals', 'above');
const hardRide = session('ride', 'Anaerobic Ride', 'above');
const easyRide = session('ride', 'Ride', 'vt1_or_easier');
const swim = { type: 'swim', name: 'Swim', training_plan_id: PLAN, tags: ['sport:swim'] };

Deno.test('a leg day with speed sets goes before a hard ride, whichever way the rows arrive', () => {
  assertEquals(orderDay([hardRide, lowerME], id).map((w) => w.type), ['strength', 'ride']);
  assertEquals(orderDay([lowerME, hardRide], id).map((w) => w.type), ['strength', 'ride']);
});

Deno.test('a leg day goes before an easy ride (p143 rule 5), even with no speed or skill sets', () => {
  assertEquals(orderDay([easyRide, lowerHyp], id).map((w) => w.type), ['strength', 'ride']);
});

Deno.test('the upper day (heavy bench) beside a hard run: the page gives no order, the run is listed first', () => {
  assertEquals(orderDay([upperME, hardRun], id).map((w) => w.type), ['run', 'strength']);
});

Deno.test('the upper day beside an easy ride: no order from the page, the ride is listed first', () => {
  assertEquals(orderDay([upperME, easyRide], id).map((w) => w.type), ['ride', 'strength']);
});

Deno.test('a leg day with no speed or skill sets beside a hard ride: the lift is listed first (2026-09-19)', () => {
  assertEquals(orderDay([lowerHyp, hardRide], id).map((w) => w.type), ['strength', 'ride']);
});

Deno.test('a swim beside a leg day: the page gives no order, discipline order puts the swim first', () => {
  assertEquals(orderDay([lowerME, swim], id).map((w) => w.type), ['swim', 'strength']);
});

Deno.test('a session not from the plan never triggers the book order', () => {
  const logged = { ...hardRide, training_plan_id: null };
  assertEquals(orderDay([lowerME, logged], id).map((w) => w.type), ['ride', 'strength']);
});

Deno.test('the plyo warm-up is listed before the session it warms up for, hard or easy, run, ride or lift', () => {
  const plyo = { type: 'strength', name: 'Plyo warm-up', training_plan_id: PLAN, tags: ['standing_plan', 'plyo'] };
  assertEquals(orderDay([hardRide, plyo], id).map((w) => w.name), ['Plyo warm-up', 'Anaerobic Ride']);
  assertEquals(orderDay([easyRide, plyo], id).map((w) => w.name), ['Plyo warm-up', 'Ride']);
  assertEquals(orderDay([hardRun, plyo], id).map((w) => w.name), ['Plyo warm-up', 'Intervals']);
  assertEquals(orderDay([upperME, plyo], id).map((w) => w.name), ['Plyo warm-up', 'Upper body: Push']);
});

Deno.test('a stored AM/PM on the row is read when the page gives no order', () => {
  const pm = { type: 'swim', tags: [], name: 'Swim', workout_metadata: { timing: 'PM' } };
  const am = { type: 'strength', tags: ['upper_body'], name: 'Upper', workout_metadata: { timing: 'AM' } };
  assertEquals(orderDay([pm, am], id).map((w) => w.name), ['Upper', 'Swim']);
});

Deno.test('day_order is 1-based within each day and rows with no day get none', () => {
  const rows = [
    { date: '2026-09-22', ...hardRide },
    { date: '2026-09-22', ...lowerME },
    { date: '2026-09-23', ...swim },
    { date: null, ...easyRide },
  ];
  const order = dayOrderFor(rows, (r) => r.date, id);
  assertEquals(order.get(rows[1]), 1);
  assertEquals(order.get(rows[0]), 2);
  assertEquals(order.get(rows[2]), 1);
  assertEquals(order.get(rows[3]), undefined);
});

Deno.test('degenerate inputs: one row or none', () => {
  assertEquals(orderDay([hardRun], id), [hardRun]);
  assertEquals(orderDay([], id), []);
});
