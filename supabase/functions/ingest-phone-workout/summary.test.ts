/**
 * The post-run screen prints the server's grading (audit H-D15, 2026-09-10).
 *   deno test --no-lock --allow-all supabase/functions/ingest-phone-workout/summary.test.ts
 */
import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { buildPhoneWorkoutSummary } from './summary.ts';

const steps = [
  { id: 'wu', kind: 'warmup', seconds: 600, pace_range: { lower: 564, upper: 636 } },
  { id: 'w1', kind: 'work', seconds: 240, distanceMeters: 800, pace_range: { lower: 470, upper: 490 } },
  { id: 'r1', kind: 'recovery', seconds: 120 },
  { id: 'w2', kind: 'work', seconds: 240, distanceMeters: 800, pace_range: { lower: 470, upper: 490 } },
];
const computed = {
  overall: { execution_score: 87 },
  intervals: [
    { planned_step_id: 'wu', kind: 'warmup', executed: { avg_pace_s_per_mi: 600 } },
    { planned_step_id: 'w1', kind: 'work', executed: { avg_pace_s_per_mi: 484 } },
    { planned_step_id: 'r1', kind: 'recovery', executed: { avg_pace_s_per_mi: 700 } },
    { planned_step_id: 'w2', kind: 'work', executed: { avg_pace_s_per_mi: 512 } },
  ],
};

Deno.test('work steps only, each read against its planned range with the Performance tab\'s rule', () => {
  const s = buildPhoneWorkoutSummary(computed, steps, 151.4);
  assertEquals(s.execution_score, 87);
  assertEquals(s.avg_hr, 151);
  assertEquals(s.intervals, [
    { planned_step_id: 'w1', avg_pace_s_per_mi: 484, band: 'in' },
    { planned_step_id: 'w2', avg_pace_s_per_mi: 512, band: 'below' },
  ]);
});

Deno.test('no score, no heart rate, no intervals: nulls and an empty list, never a phone-side number', () => {
  const s = buildPhoneWorkoutSummary({ overall: {} }, [], null);
  assertEquals(s, { execution_score: null, avg_hr: null, intervals: [] });
  const t = buildPhoneWorkoutSummary(null, steps, 0);
  assertEquals(t.intervals, []);
  assertEquals(t.avg_hr, null);
});

Deno.test('a work step with no planned range prints its pace and no band', () => {
  const s = buildPhoneWorkoutSummary(
    { intervals: [{ planned_step_id: 'x', kind: 'work', executed: { avg_pace_s_per_mi: 500 } }] },
    [{ id: 'x', kind: 'work', seconds: 60 }],
    null,
  );
  assertEquals(s.intervals, [{ planned_step_id: 'x', avg_pace_s_per_mi: 500, band: null }]);
});
