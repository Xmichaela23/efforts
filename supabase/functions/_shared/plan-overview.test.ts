/**
 * A plan at a glance (audit item 15): current week, phase word, totals over the whole plan.
 *
 * Run: ~/.deno/bin/deno test --no-check supabase/functions/_shared/plan-overview.test.ts
 */
import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { buildPlanOverview, planCurrentWeekIndex, planListFields, planPhaseWord, planTotalWeeks } from './plan-overview.ts';

const racePlan = {
  id: 'p1',
  duration_weeks: 4,
  current_week: 1,
  config: {
    // A Thursday start: week 1 runs Monday 2026-09-07 to Sunday 2026-09-13.
    user_selected_start_date: '2026-09-10',
    phases: [{ name: 'base', start_week: 1 }, { name: 'build', start_week: 2 }, { name: 'taper', start_week: 4 }],
    weekly_summaries: { '1': { total_miles: 20 }, '2': { total_miles: 24 }, '3': { total_miles: 26 }, '4': { total_miles: 12 } },
  },
};

Deno.test('the current week counts from the start moved back to its Monday, like get-week', () => {
  // Monday 2026-09-14 is week 2 from a Thursday 2026-09-10 start; counting from the raw date said week 1.
  assertEquals(planCurrentWeekIndex(racePlan, '2026-09-14'), 2);
  assertEquals(planCurrentWeekIndex(racePlan, '2026-09-13'), 1);
  // Capped at the plan's length.
  assertEquals(planCurrentWeekIndex(racePlan, '2027-01-01'), 4);
  // No start date: the week stored on the plan row.
  assertEquals(planCurrentWeekIndex({ current_week: 3, config: {} }, '2026-09-14'), 3);
  assertEquals(planCurrentWeekIndex({ config: {} }, '2026-09-14'), null);
});

Deno.test('the phase is the plan\'s own word', () => {
  assertEquals(planPhaseWord(racePlan, 1), 'Base');
  assertEquals(planPhaseWord(racePlan, 3), 'Build');
  assertEquals(planPhaseWord(racePlan, 4), 'Taper');
  const strength = { config: { phase_structure: { phases: [{ name: 'Test', start_week: 1, end_week: 1 }, { name: 'Base', start_week: 2, end_week: 12 }] } } };
  assertEquals(planPhaseWord(strength, 1), 'Test');
  assertEquals(planTotalWeeks(strength), 12);
  assertEquals(planPhaseWord({ config: {} }, 2), null);
});

Deno.test('list fields: week, phase, length and progress', () => {
  assertEquals(planListFields(racePlan, '2026-09-21'), {
    current_week_index: 3, current_phase: 'Build', total_weeks: 4, progress_pct: 75,
    starts_on: '2026-09-07', has_started: true,
  });
  // A plan built for a later week: week 1 by the clamp, but not started — Today's "your plan starts" note.
  assertEquals(planListFields(racePlan, '2026-09-01').has_started, false);
  assertEquals(planListFields(racePlan, '2026-09-01').current_week_index, 1);
  assertEquals(planListFields({ config: {} }, '2026-09-01').starts_on, null);
});

Deno.test('totals are over every week, not the weeks opened', () => {
  const rows = [
    { week_number: 1, type: 'run', name: 'Easy', total_duration_seconds: 2700, tags: [] },
    { week_number: 1, type: 'run', name: 'Strides', total_duration_seconds: 1200, tags: ['optional'] },
    { week_number: 1, type: 'rest', name: 'Rest', tags: [] },
    { week_number: 2, type: 'run', name: 'Long', duration: 90, tags: [] },
    { week_number: 3, type: 'ride', name: 'Ride', computed: { total_duration_seconds: 3600 }, tags: [] },
    { week_number: 4, type: 'run', name: 'Race Day', total_duration_seconds: 14400, tags: ['race_day'] },
  ];
  const o = buildPlanOverview({ plan: racePlan, rows, asOfIso: '2026-09-14' });
  assertEquals(o.weeks.map((w) => [w.week, w.phase, w.minutes, w.training_minutes, w.sessions, w.miles]), [
    [1, 'Base', 45, 45, 1, 20],
    [2, 'Build', 90, 90, 1, 24],
    [3, 'Build', 60, 60, 1, 26],
    [4, 'Taper', 240, 0, 1, 12],
  ]);
  // The race day counts in the total, not in the weekly average.
  assertEquals(o.totals, { minutes: 435, avg_minutes_per_week: Math.round(195 / 4), sessions: 4, miles: 82 });
  assertEquals(o.phases, [
    { phase: 'Base', start_week: 1, end_week: 1, minutes: 45, miles: 20, sessions: 1 },
    { phase: 'Build', start_week: 2, end_week: 3, minutes: 150, miles: 50, sessions: 2 },
    { phase: 'Taper', start_week: 4, end_week: 4, minutes: 0, miles: 12, sessions: 1 },
  ]);
  assertEquals([o.current_week_index, o.total_weeks, o.progress_pct], [2, 4, 50]);
});

Deno.test('a week with no rows reads the plan blob\'s authored minutes; no minutes at all falls back to estimated hours', () => {
  const plan = { duration_weeks: 2, config: { weekly_summaries: { '1': { estimated_hours: 3 }, '2': { estimated_hours: 4 } } },
    sessions_by_week: { '1': [{ type: 'run', name: 'Easy', duration: 40 }], '2': [] } };
  const o = buildPlanOverview({ plan, rows: [], asOfIso: '2026-09-14' });
  assertEquals(o.weeks.map((w) => w.minutes), [40, 0]);
  assertEquals(o.totals.minutes, 40);
  const empty = buildPlanOverview({ plan: { ...plan, sessions_by_week: {} }, rows: [], asOfIso: '2026-09-14' });
  assertEquals(empty.totals.minutes, 420);
  assertEquals(empty.totals.avg_minutes_per_week, 210);
});
