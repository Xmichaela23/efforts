/**
 * A swim's distance and duration as a share of plan (audit H-D13).
 *
 * Run: deno test --no-check --no-lock supabase/functions/_shared/session-detail/swim-plan-share.test.ts
 */
import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { planShare } from './swim-plan-share.ts';
import { buildSessionDetailV1 } from './build.ts';

Deno.test('percent of plan, rounded, and whether it reached the plan', () => {
  assertEquals(planShare(1500, 1500), { pct: 100, status: 'at_or_above' });
  assertEquals(planShare(1650, 1500), { pct: 110, status: 'at_or_above' });
  assertEquals(planShare(1492, 1500), { pct: 99, status: 'below' });
  // 99.6 rounds to 100 — the card printed "100%" in green for this too.
  assertEquals(planShare(1494, 1500), { pct: 100, status: 'at_or_above' });
});

Deno.test('no plan figure or no done figure: nothing', () => {
  assertEquals(planShare(1500, 0), { pct: null, status: null });
  assertEquals(planShare(0, 1500), { pct: null, status: null });
  assertEquals(planShare(null, 1500), { pct: null, status: null });
  assertEquals(planShare(1500, undefined), { pct: null, status: null });
});

function swimDetail(plannedRowRaw: Record<string, unknown> | null, type = 'swim') {
  return buildSessionDetailV1({
    workoutId: 'w1', workoutDate: '2026-09-10', workoutType: type, workoutName: 'Pool Swim',
    ledgerDay: null, actualSession: null, match: null, plannedSession: null,
    plannedRowRaw, completedStrengthExercises: null, bodyweightLb: null, observations: [],
    completedComputed: { overall: {} },
    completedSwimScalars: { movingSeconds: 2100, elapsedSeconds: 2700, distanceMeters: 1463, avgHr: 130 },
    workoutAnalysis: null, narrativeText: null,
  } as any) as any;
}

Deno.test('the build stamps both shares on a planned swim', () => {
  const sd = swimDetail({
    total_duration_seconds: 2700,
    computed: { steps: [{ distanceMeters: 1372 }, { distanceMeters: 91 }] },
  });
  assertEquals(sd.completed_totals.distance_m, 1463);
  assertEquals(sd.planned_totals.distance_m, 1463);
  assertEquals(sd.completed_totals.swim_distance_pct_of_plan, 100);
  assertEquals(sd.completed_totals.swim_distance_status, 'at_or_above');
  assertEquals(sd.completed_totals.swim_duration_pct_of_plan, 100);
  assertEquals(sd.completed_totals.swim_duration_status, 'at_or_above');
});

Deno.test('an unplanned swim, and a run, carry no share', () => {
  const sd = swimDetail(null);
  assertEquals(sd.completed_totals.swim_distance_pct_of_plan ?? null, null);
  assertEquals(sd.completed_totals.swim_duration_status ?? null, null);
  const run = swimDetail({ total_duration_seconds: 2700 }, 'run');
  assertEquals(run.completed_totals.swim_distance_pct_of_plan, undefined);
});
