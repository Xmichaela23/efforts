import { assert, assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
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

Deno.test('⛔ joined rides: each first half finds its second half on the same day; a skipped first half pairs nothing', async () => {
  const { joinedPartners } = await import('./plan.ts');
  const row = (id: string, slot: string, tags: string[], o: Record<string, unknown> = {}) =>
    ({ id, date: '2026-09-30', type: 'ride', training_plan_id: 'p', tags: [`slot:${slot}`, ...tags], ...o });
  const rows = [
    row('mon', '1:0', []),
    row('vo2', '3:0', ['one_run']),
    row('ss', '3:1', ['one_run', 'one_run_part2']),
    row('spr', '5:0', ['one_run'], { date: '2026-10-02' }),
    row('end', '5:1', ['one_run', 'one_run_part2'], { date: '2026-10-02' }),
  ];
  const got = joinedPartners(rows);
  assertEquals([...got.entries()].map(([h, p]) => `${h}>${p.id}`), ['vo2>ss', 'spr>end']);
  // A second half moved to another date on its own is not merged into its first half.
  assertEquals(joinedPartners([rows[1], { ...rows[2], date: '2026-10-01' }]).size, 0);
  // A skipped first half: the second half goes out alone.
  assertEquals(joinedPartners([{ ...rows[1], workout_status: 'skipped' }, rows[2]]).size, 0);
});

Deno.test('⛔ a joined ride is ONE workout on Intervals.icu / Zwift and on Garmin: both halves in order, both lengths', async () => {
  const { mergeJoinedRow } = await import('./plan.ts');
  const { serializeRide } = await import('../intervals/serialize.ts');
  const { convertWorkoutToGarmin } = await import('../garmin/convert-workout.ts');
  const anchors = { ftp_w: 210 };
  const head = {
    id: 'vo2', date: '2026-09-30', type: 'ride', name: 'Long VO2 Repeats', duration: 60, description: 'VO2 note.',
    tags: ['slot:3:0', 'one_run'], training_plan_id: 'p',
    computed: { anchors, total_duration_seconds: 960, steps: [
      { kind: 'warmup', type: 'warmup', seconds: 780, powerRange: { lower: 116, upper: 147 } },
      { kind: 'work', type: 'work', seconds: 180, powerRange: { lower: 231, upper: 252 } },
    ] },
  };
  const part = {
    id: 'ss', date: '2026-09-30', type: 'ride', name: 'Long Sweet Spot Repeats', duration: 32, description: 'Sweet spot note.',
    tags: ['slot:3:1', 'one_run', 'one_run_part2'], training_plan_id: 'p',
    computed: { anchors, total_duration_seconds: 600, steps: [{ kind: 'work', type: 'work', seconds: 600, powerRange: { lower: 185, upper: 193 } }] },
  };
  const one = mergeJoinedRow(head, part);
  assertEquals(one.id, 'vo2');
  assertEquals(one.session_title, 'Long VO2 Repeats, then Long Sweet Spot Repeats');
  assertEquals(one.duration, 92);
  assertEquals(one.computed.total_duration_seconds, 1560);
  assertEquals(one.description, 'VO2 note.\n\nSweet spot note.');
  const ev = serializeRide({ ...one, name: 'Long VO2 Repeats, then Long Sweet Spot Repeats' });
  assertEquals(ev.external_id, 'vo2');
  assertEquals(ev.moving_time, 780 + 180 + 600);
  assert(ev.description.endsWith('- Warmup 13m 55-70%\n- 3m 110-120%\n- 10m 88-92%'), ev.description);
  const g = convertWorkoutToGarmin({ ...one, name: 'Long VO2 Repeats, then Long Sweet Spot Repeats', user_ftp: 210 } as any) as any;
  const secs = (g.segments?.[0]?.steps ?? []).map((s: any) => Number(s.durationValue ?? s.duration ?? 0));
  assertEquals(secs.filter((x: number) => x > 0), [780, 180, 600]);
  assertEquals(g.workoutName, 'Long VO2 Repeats, then Long Sweet Spot Repeats');
  // Half a ride is never sent as the whole one.
  let threw = false;
  try { mergeJoinedRow(head, { ...part, computed: { steps: [] } }); } catch { threw = true; }
  assert(threw);
});
