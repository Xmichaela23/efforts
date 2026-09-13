import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { destinationFor, diffDeliveries, syncWindow, contentHash, type Delivery, type Desired } from './plan.ts';

const today = '2026-09-13';
const connected = new Set(['garmin', 'intervals_icu'] as const);
const dests = { ride: 'intervals_icu', run: 'garmin', swim: 'none' } as const;

Deno.test('window is 15 days, today included', () => {
  assertEquals(syncWindow(today), { from: '2026-09-13', to: '2026-09-27' });
});

Deno.test('destination: sport choice, window, status, connection', () => {
  const at = (o: any) => destinationFor({ id: 'x', date: today, type: 'ride', workout_status: 'planned', ...o }, dests as any, connected as any, today);
  assertEquals(at({}), 'intervals_icu');
  assertEquals(at({ type: 'run' }), 'garmin');
  assertEquals(at({ type: 'swim' }), null);
  assertEquals(at({ type: 'strength' }), null);
  assertEquals(at({ type: 'mobility' }), null);
  assertEquals(at({ date: '2026-09-27' }), 'intervals_icu');
  assertEquals(at({ date: '2026-09-28' }), null);
  assertEquals(at({ date: '2026-09-12' }), null);
  assertEquals(at({ workout_status: 'completed' }), null);
  assertEquals(at({ workout_status: 'skipped' }), null);
  assertEquals(at({ workout_status: null }), 'intervals_icu');
  assertEquals(destinationFor({ id: 'x', date: today, type: 'ride' }, dests as any, new Set(['garmin']) as any, today), null);
});

const delivery = (o: Partial<Delivery>): Delivery => ({
  planned_workout_id: 'a', provider: 'intervals_icu', date: today, content_hash: 'h1', provider_workout_id: '1', provider_schedule_id: null, ...o,
});
const want = (o: Partial<Desired>): Desired => ({ planned_workout_id: 'a', provider: 'intervals_icu', date: today, content_hash: 'h1', ...o });

Deno.test('diff: create, unchanged, update', () => {
  const r = diffDeliveries([want({}), want({ planned_workout_id: 'b' }), want({ planned_workout_id: 'c', content_hash: 'h2' })],
    [delivery({}), delivery({ planned_workout_id: 'c' })], today);
  assertEquals(r.create.map((d) => d.planned_workout_id), ['b']);
  assertEquals(r.update.map((u) => u.desired.planned_workout_id), ['c']);
  assertEquals(r.remove, []);
});

Deno.test('diff: a rebuild (new ids) removes every old copy and creates every new one', () => {
  const r = diffDeliveries([want({ planned_workout_id: 'new1' })], [delivery({ planned_workout_id: 'old1' })], today);
  assertEquals(r.create.length, 1);
  assertEquals(r.remove.map((d) => d.planned_workout_id), ['old1']);
});

Deno.test('diff: history before today is never removed; a failed serialization keeps its old copy', () => {
  const r = diffDeliveries([], [delivery({ planned_workout_id: 'past', date: '2026-09-12' }), delivery({ planned_workout_id: 'broken' })], today, new Set(['broken']));
  assertEquals(r.remove, []);
});

Deno.test('diff: moving a sport to another provider removes it from the first and creates it on the second', () => {
  const r = diffDeliveries([want({ provider: 'garmin' })], [delivery({ provider: 'intervals_icu' })], today);
  assertEquals(r.create.map((d) => d.provider), ['garmin']);
  assertEquals(r.remove.map((d) => d.provider), ['intervals_icu']);
});

Deno.test('hash: date is part of it; same input same hash', async () => {
  assertEquals(await contentHash(today, { a: 1 }), await contentHash(today, { a: 1 }));
  const moved = await contentHash('2026-09-14', { a: 1 });
  assertEquals(moved === (await contentHash(today, { a: 1 })), false);
});
