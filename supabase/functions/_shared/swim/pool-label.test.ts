/**
 * A completed swim's pool label: the length through the one resolver, the unit from the saved unit,
 * the plan's unit, then the athlete's setting (audit H-D08 / H-D13).
 *
 * Run: deno test --no-check --no-lock supabase/functions/_shared/swim/pool-label.test.ts
 */
import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { poolLabel } from './pool-label.ts';
import { buildSessionDetailV1 } from '../session-detail/build.ts';

Deno.test('⛔ a watch-recorded 25 yd pool with no saved unit reads yards for an imperial athlete', () => {
  assertEquals(poolLabel({ length_m: 22.86, athlete_units: 'imperial' }), { label: '25 yd', unit: 'yd' });
});

Deno.test('a metric athlete\'s 25 m pool with no saved unit reads metres — the old guess said "27 yd"', () => {
  assertEquals(poolLabel({ length_m: 25, athlete_units: 'metric' }), { label: '25 m', unit: 'm' });
});

Deno.test('a saved unit wins over the athlete\'s setting; the plan\'s unit comes next', () => {
  assertEquals(poolLabel({ length_m: 25, unit: 'm', athlete_units: 'imperial' }), { label: '25 m', unit: 'm' });
  assertEquals(poolLabel({ length_m: 22.86, plan_unit: 'yd', athlete_units: 'metric' }), { label: '25 yd', unit: 'yd' });
  assertEquals(poolLabel({ length_m: 25, unit: 'm', plan_unit: 'yd', athlete_units: 'imperial' }), { label: '25 m', unit: 'm' });
});

Deno.test('the length is the resolver\'s: the athlete\'s correction, then the device, then the plan', () => {
  assertEquals(poolLabel({ user_corrected_length_m: 45.72, length_m: 22.86, unit: 'yd' }), { label: '50 yd', unit: 'yd' });
  assertEquals(poolLabel({ plan_length_m: 22.86, plan_unit: 'yd' }), { label: '25 yd', unit: 'yd' });
});

Deno.test('⛔ no captured length: no label — the resolver\'s default length is not printed', () => {
  assertEquals(poolLabel({ unit: 'yd', athlete_units: 'imperial' }), { label: null, unit: null });
  assertEquals(poolLabel(null), { label: null, unit: null });
});

Deno.test('no saved unit and no setting: metres, the unit the length is stored in', () => {
  assertEquals(poolLabel({ length_m: 22.86 }), { label: '23 m', unit: 'm' });
});

Deno.test('the build writes the label on a swim, and nothing on a run', () => {
  const build = (type: string) => buildSessionDetailV1({
    workoutId: 'w1', workoutDate: '2026-09-10', workoutType: type, workoutName: 'Session',
    ledgerDay: null, actualSession: null, match: null, plannedSession: null,
    plannedRowRaw: null, completedStrengthExercises: null, bodyweightLb: null, observations: [],
    completedComputed: { overall: {} },
    completedPool: { length_m: 22.86, athlete_units: 'imperial' },
    workoutAnalysis: null, narrativeText: null,
  } as any) as any;
  assertEquals(build('swim').completed_totals.pool_display, '25 yd');
  assertEquals(build('swim').completed_totals.pool_unit, 'yd');
  assertEquals(build('run').completed_totals.pool_display, undefined);
});
