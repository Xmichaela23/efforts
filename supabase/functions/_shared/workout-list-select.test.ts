/**
 * The list reads never pull the chart series (2026-09-10).
 *
 * Run: ~/.deno/bin/deno test --no-check supabase/functions/_shared/workout-list-select.test.ts
 */
import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { WORKOUT_LIST_JSON_SELECT, rebuildWorkoutListRow } from './workout-list-select.ts';

Deno.test('the select names keys of computed and workout_analysis, never the whole column, never the series', () => {
  const sel = WORKOUT_LIST_JSON_SELECT.join(',');
  assertEquals(WORKOUT_LIST_JSON_SELECT.every((s) => /^[A-Za-z0-9_]+:(computed|workout_analysis)->/.test(s)), true);
  assertEquals(sel.includes('series'), false);
  assertEquals(sel.includes('display_series'), false);
  assertEquals(WORKOUT_LIST_JSON_SELECT.includes('computed'), false);
  assertEquals(WORKOUT_LIST_JSON_SELECT.includes('workout_analysis'), false);
  assertEquals(sel.includes('cmp__overall:computed->overall'), true);
  assertEquals(sel.includes('cmpa__bests:computed->analysis->bests'), true);
  assertEquals(sel.includes('wa__session_detail_v1:workout_analysis->session_detail_v1'), true);
});

Deno.test('the row is rebuilt into the objects the readers expect, aliases dropped', () => {
  const row = {
    id: 'w1',
    date: '2026-09-10',
    cmp__overall: { distance_m: 10000, duration_s_moving: 3000 },
    cmp__intervals: null,
    cmp__power_curve: { '20min': 250 },
    cmpa__bests: { max_speed_mps: 12 },
    cmpa__events: { splits: { mi: [] } },
    cmpa__version: 'v1',
    wa__session_detail_v1: { splits_mi: [] },
    wa__is_goal_race: false,
    wa__ai_summary: null,
  };
  const out = rebuildWorkoutListRow(row) as Record<string, unknown>;
  assertEquals(out.id, 'w1');
  assertEquals(Object.keys(out).some((k) => k.includes('__')), false);
  assertEquals(out.computed, {
    overall: { distance_m: 10000, duration_s_moving: 3000 },
    power_curve: { '20min': 250 },
    analysis: { version: 'v1', events: { splits: { mi: [] } }, bests: { max_speed_mps: 12 } },
  });
  assertEquals(out.workout_analysis, { session_detail_v1: { splits_mi: [] }, is_goal_race: false });
});

Deno.test('a row with nothing under a column gets null there, as the whole-column read returned', () => {
  const out = rebuildWorkoutListRow({ id: 'w2', cmp__overall: null, cmpa__bests: null, wa__performance: null }) as Record<string, unknown>;
  assertEquals(out.computed, null);
  assertEquals(out.workout_analysis, null);
});

Deno.test('a row that already carries computed is returned as it is', () => {
  const row = { id: 'w3', computed: { overall: { distance_m: 1 } }, workout_analysis: null };
  assertEquals(rebuildWorkoutListRow(row), row);
});
