import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { planSweep } from './sweep-plan.ts';

const steps = [{ id: 's1' }];
const overall = { distance_m: 5000 };

Deno.test('a linked run with its summary and planned steps is left alone', () => {
  const r = planSweep(
    [{ id: 'w1', type: 'run', planned_id: 'p1', overall, planned_steps_light: steps }],
    [{ id: 'p1', completed_workout_id: 'w1', workout_status: 'completed' }],
  );
  assertEquals(r.attachIds, []);
  assertEquals([...r.computeIds], []);
});

Deno.test('a linked run missing its planned steps is attached and summarised, as before', () => {
  const r = planSweep(
    [{ id: 'w1', type: 'run', planned_id: 'p1', overall, planned_steps_light: null }],
    [{ id: 'p1', completed_workout_id: 'w1', workout_status: 'completed' }],
  );
  assertEquals(r.attachIds, ['w1']);
  assertEquals([...r.computeIds], ['w1']);
});

Deno.test('a link that points one way only is attached again', () => {
  const r = planSweep(
    [{ id: 'w1', type: 'ride', planned_id: 'p1', overall, planned_steps_light: steps }],
    [{ id: 'p1', completed_workout_id: 'other', workout_status: 'completed' }],
  );
  assertEquals(r.attachIds, ['w1']);
  assertEquals([...r.computeIds], []);
});

Deno.test('a linked workout whose planned row is outside the week is attached again', () => {
  const r = planSweep([{ id: 'w1', type: 'run', planned_id: 'p9', overall, planned_steps_light: steps }], []);
  assertEquals(r.attachIds, ['w1']);
});

Deno.test('an unlinked workout still tries to attach; its summary is kept when it has one', () => {
  const r = planSweep([{ id: 'w1', type: 'run', planned_id: null, overall }], []);
  assertEquals(r.attachIds, ['w1']);
  assertEquals([...r.computeIds], []);
});

Deno.test('a workout with no summary is summarised', () => {
  const r = planSweep([{ id: 'w1', type: 'swim', planned_id: null, overall: null }], []);
  assertEquals([...r.computeIds], ['w1']);
});

Deno.test('a linked strength session needs no planned steps', () => {
  const r = planSweep(
    [{ id: 'w1', type: 'strength', planned_id: 'p1', overall }],
    [{ id: 'p1', completed_workout_id: 'w1', workout_status: 'completed' }],
  );
  assertEquals(r.attachIds, []);
  assertEquals([...r.computeIds], []);
});
