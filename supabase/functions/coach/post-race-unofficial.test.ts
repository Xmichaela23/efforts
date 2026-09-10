/**
 * Coach's unofficial finish after race day (2026-09-10, audit H-B10) — State's gates and words, moved.
 *
 * Run: deno test --no-check supabase/functions/coach/post-race-unofficial.test.ts
 */
import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { buildPostRaceUnofficial, daysAfterRaceLabel, postRaceCandidate, signedDeltaVsModel } from './post-race-unofficial.ts';

const PLAN = 'plan-1';
const GOAL = { id: 'goal-1', sport: 'run', target_date: '2026-09-06', plan_id: PLAN };
const base = {
  asOfDate: '2026-09-08',
  activePlanId: PLAN,
  activePlans: [{ plan_id: PLAN, race_date: '2026-09-05' }],
  goals: [GOAL],
  primaryEventId: null,
  projectionGoalId: null,
  readinessGoalId: null,
  lastCompletedRaceGoalId: null,
};

Deno.test('the plan\'s run goal date wins over the plan\'s own race date; two days after', () => {
  assertEquals(postRaceCandidate(base), { goal_id: 'goal-1', race_date: '2026-09-06', goal_sport: 'run', days_after_race: 2 });
  assertEquals(postRaceCandidate({ ...base, goals: [] }), { goal_id: null, race_date: '2026-09-05', goal_sport: null, days_after_race: 3 });
  // A ride goal is not the run goal State reads; the plan's race date stands in.
  assertEquals(postRaceCandidate({ ...base, goals: [{ ...GOAL, sport: 'ride' }] })?.race_date, '2026-09-05');
});

Deno.test('nothing on or before race day, with no plan, or once the result is saved', () => {
  assertEquals(postRaceCandidate({ ...base, asOfDate: '2026-09-06' }), null);
  assertEquals(postRaceCandidate({ ...base, asOfDate: '2026-09-01' }), null);
  assertEquals(postRaceCandidate({ ...base, activePlanId: null }), null);
  assertEquals(postRaceCandidate({ ...base, lastCompletedRaceGoalId: 'goal-1' }), null);
  assertEquals(postRaceCandidate({ ...base, lastCompletedRaceGoalId: 'goal-9', projectionGoalId: 'goal-9' }), null);
  assertEquals(postRaceCandidate({ ...base, lastCompletedRaceGoalId: 'goal-9', primaryEventId: 'goal-9' }), null);
  // A saved result for another race does not hide this one.
  assertEquals(postRaceCandidate({ ...base, lastCompletedRaceGoalId: 'goal-9' })?.goal_id, 'goal-1');
  // The readiness goal only counts when nothing ahead of it names a goal.
  assertEquals(postRaceCandidate({ ...base, lastCompletedRaceGoalId: 'goal-9', projectionGoalId: 'goal-1', readinessGoalId: 'goal-9' })?.goal_id, 'goal-1');
});

Deno.test('State\'s words, word for word', () => {
  assertEquals(daysAfterRaceLabel(1), '1 day after race');
  assertEquals(daysAfterRaceLabel(6), '6 days after race');
  assertEquals(daysAfterRaceLabel(7), 'after your race');
  assertEquals(signedDeltaVsModel(13500, 13500), 'same as model projection');
  assertEquals(signedDeltaVsModel(13500, 13248), '+4:12 vs model');
  assertEquals(signedDeltaVsModel(13000, 17000), '−1:06:40 vs model');
});

Deno.test('the longest run on race day, its elapsed finish, and the gap to the model', () => {
  const cand = postRaceCandidate(base)!;
  const rows = [
    { id: 'warm', type: 'run', elapsed_time: 15, computed: { overall: { distance_m: 2000 } } },
    { id: 'race', type: 'run', elapsed_time: 225, moving_time: 220, computed: { overall: { distance_m: 42400, duration_s_elapsed: 13507 } } },
    { id: 'spin', type: 'ride', elapsed_time: 300, computed: { overall: { distance_m: 90000 } } },
  ];
  assertEquals(buildPostRaceUnofficial(cand, rows, { seconds: 13200, display: '3:40:00' }), {
    goal_id: 'goal-1', race_date: '2026-09-06', workout_id: 'race', logged_seconds: 13507, logged_display: '3:45:07',
    days_after_race: 2, days_after_label: '2 days after race', model_projected_display: '3:40:00', gap_display: '+5:07 vs model',
  });
  assertEquals(buildPostRaceUnofficial(cand, rows, null)?.gap_display, null);
  assertEquals(buildPostRaceUnofficial(cand, [rows[2]], null), null);
});
