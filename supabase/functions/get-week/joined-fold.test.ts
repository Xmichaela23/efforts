// deno test --allow-read --allow-env --no-check supabase/functions/get-week/joined-fold.test.ts
import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { foldJoinedItems } from './joined-fold.ts';

const row = (id: string, slot: string, tags: string[], mins: number, name: string, o: Record<string, unknown> = {}) => ({
  id, date: '2026-09-30', type: 'ride', name, training_plan_id: 'p', workout_status: 'planned', duration: mins,
  tags: [`slot:${slot}`, ...tags], computed: { steps: [{ id: `${id}-s`, kind: 'work', seconds: mins * 60 }] }, ...o,
});
const item = (r: any) => ({
  id: r.id, date: r.date, type: 'ride', status: 'planned', executed: null, workload_planned: 10,
  planned: { id: r.id, name: r.name, steps: r.computed.steps, duration: r.duration, total_duration_seconds: r.duration * 60, tags: r.tags },
});

Deno.test('⛔ a joined ride is one card: both halves\' steps and lengths, the joined title, the second half\'s id', () => {
  const rows = [row('vo2', '3:0', ['one_run'], 60, 'Long VO2 Repeats'), row('ss', '3:1', ['one_run', 'one_run_part2'], 32, 'Long Sweet Spot Repeats'),
    row('mon', '1:0', [], 45, 'Tempo Blocks', { date: '2026-09-28' })];
  const items = rows.map(item);
  foldJoinedItems(items, rows);
  assertEquals(items.map((i) => i.id), ['vo2', 'mon']);
  const p = items[0].planned as any;
  assertEquals(p.steps.map((s: any) => s.id), ['vo2-s', 'ss-s']);
  assertEquals([p.duration, p.total_duration_seconds, p.planned_duration_seconds], [92, 5520, 5520]);
  assertEquals(p.session_title, 'Long VO2 Repeats, then Long Sweet Spot Repeats');
  assertEquals(p.joined_part_ids, ['ss']);
  assertEquals(items[0].workload_planned, 20);
});

Deno.test('⛔ a skipped first half pairs nothing: each half shows alone', () => {
  const rows = [row('vo2', '3:0', ['one_run'], 60, 'VO2', { workout_status: 'skipped' }), row('ss', '3:1', ['one_run', 'one_run_part2'], 32, 'SS')];
  const items = rows.map(item);
  foldJoinedItems(items, rows);
  assertEquals(items.map((i) => i.id), ['vo2', 'ss']);
});
