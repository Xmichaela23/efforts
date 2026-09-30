// The plyo warm-up goes with its run or ride (2026-09-29). Run: ~/.deno/bin/deno test --no-check --allow-read supabase/functions/_shared/move-check/plyo-pair.test.ts
import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { movesTogether, plyoPair, type MoveRow } from './index.ts';
import { withPlyoHead } from '../calendar-sync/plan.ts';

const P = 'plan-1';
const row = (id: string, type: string, tags: string[], date = '2026-10-07'): MoveRow => ({ id, date, type, training_plan_id: P, tags, workout_status: 'planned' });

Deno.test('a tagged warm-up pairs with the session whose slot it names, from either side', () => {
  const warm = row('w', 'strength', ['standing_plan', 'plyo', 'warms_up:3:0']);
  const run = row('r', 'run', ['slot:3:0']);
  const lift = row('l', 'strength', ['standing_plan']);
  const rows = [warm, run, lift];
  assertEquals(plyoPair(warm, rows)?.session.id, 'r');
  assertEquals(plyoPair(run, rows)?.warmUp.id, 'w');
  assertEquals(plyoPair(lift, rows), null);
  assertEquals(movesTogether(run, rows).map((r) => r.id), ['w']);
  assertEquals(movesTogether(warm, rows).map((r) => r.id), ['r']);
});

Deno.test('a joined session moves whole, with its warm-up, from any part', () => {
  const warm = row('w', 'strength', ['plyo', 'warms_up:3:0']);
  const head = row('h', 'run', ['slot:3:0', 'one_run']);
  const part = row('p', 'run', ['slot:3:1', 'one_run', 'one_run_part2']);
  const rows = [warm, head, part];
  assertEquals(movesTogether(part, rows).map((r) => r.id).sort(), ['h', 'w']);
  assertEquals(movesTogether(warm, rows).map((r) => r.id).sort(), ['h', 'p']);
});

Deno.test('a warm-up built before the tag pairs with the first run or ride on its plan day; another day does not pair', () => {
  const warm = row('w', 'strength', ['plyo']);
  const ride = row('b', 'ride', ['slot:3:1']);
  const run = row('r', 'run', ['slot:3:0']);
  assertEquals(plyoPair(warm, [warm, ride, run])?.session.id, 'r');
  assertEquals(plyoPair(warm, [warm, row('x', 'run', ['slot:4:0'], '2026-10-08')]), null);
});

Deno.test('the watch step: one lap-button warm-up in front, the drill names as its words, "Plyo - {session}"', () => {
  const run = { id: 'r', type: 'run', name: 'Short Threshold Repeats', computed: { steps: [{ type: 'warmup', duration_s: 600 }] } };
  const out = withPlyoHead(run, { strength_exercises: [{ name: 'Stiff-Legged Run' }, { name: 'Pogo Hops' }] });
  assertEquals(out.computed.steps[0], { type: 'warmup', lap_button: true, watch_target: 'none', label: 'Plyo warm-up: Stiff-Legged Run · Pogo Hops', plyo: true });
  assertEquals(out.computed.steps.length, 2);
  assertEquals(out.session_title.startsWith('Plyo - '), true);
});
