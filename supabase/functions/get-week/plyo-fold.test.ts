// The plyo warm-up is part of its run's card (2026-09-29). Run: ~/.deno/bin/deno test --no-check --allow-read supabase/functions/get-week/plyo-fold.test.ts
import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { foldPlyoItems } from './plyo-fold.ts';

Deno.test('the warm-up folds into its run: one item, "Plyo - {run}", its drills, both ids for skip', () => {
  const rows = [
    { id: 'w', date: '2026-10-07', type: 'strength', training_plan_id: 'p', tags: ['plyo', 'warms_up:3:0'], workout_status: 'planned',
      strength_exercises: [{ name: 'Stiff-Legged Run', how_to: 'Run with straight legs.', benefit_line: 'Benefit: running gait and speed.' }, { name: 'Pogo Hops', how_to: null, benefit_line: null }] },
    { id: 'r', date: '2026-10-07', type: 'run', training_plan_id: 'p', tags: ['slot:3:0'], workout_status: 'planned', name: 'Short Threshold Repeats' },
  ];
  const items: any[] = [
    { planned: { id: 'w', name: 'Plyo warm-up' }, executed: null },
    { planned: { id: 'r', name: 'Short Threshold Repeats', session_title: 'Short Threshold Repeats' }, executed: null },
  ];
  foldPlyoItems(items, rows);
  assertEquals(items.length, 1);
  assertEquals(items[0].planned.session_title, 'Plyo - Short Threshold Repeats');
  assertEquals(items[0].planned.plyo_warm_up.drills.map((d: any) => d.name), ['Stiff-Legged Run', 'Pogo Hops']);
  assertEquals(items[0].planned.plyo_warm_up.note, 'Pick one or two of these drills. Repeat each drill until the movement is at its best for the day and you feel confident in it, then move on. Fatigue, poor form and imprecise movement all need to be avoided.');
  assertEquals(items[0].planned.joined_part_ids, ['w']);
});

Deno.test('a warm-up with its own recorded workout stays its own item', () => {
  const rows = [
    { id: 'w', date: '2026-10-07', type: 'strength', training_plan_id: 'p', tags: ['plyo'], workout_status: 'completed' },
    { id: 'r', date: '2026-10-07', type: 'run', training_plan_id: 'p', tags: ['slot:3:0'], workout_status: 'planned' },
  ];
  const items: any[] = [{ planned: { id: 'w' }, executed: { id: 'x' } }, { planned: { id: 'r' }, executed: null }];
  foldPlyoItems(items, rows);
  assertEquals(items.length, 2);
});
