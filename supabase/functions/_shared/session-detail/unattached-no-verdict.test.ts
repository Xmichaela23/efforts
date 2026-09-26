/**
 * ⛔ A RUN OR RIDE WITH NO PLAN ATTACHED GETS NO VERDICT (Michael, 2026-09-25 — POLISH-PUNCH-LIST "AN UNATTACHED
 * INTERVAL RIDE STILL GETS A DRIFT NUMBER"). No grade and no steadiness or drift number on its screens; the facts
 * stay. The same session with a plan attached is unchanged. `noVerdict` in build.ts.
 *
 * Run: deno test --no-check --no-lock supabase/functions/_shared/session-detail/unattached-no-verdict.test.ts
 */
import { assert, assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { buildSessionDetailV1 } from './build.ts';

/** The week ledger's own shape for a done session nothing was planned against (`daily-ledger.ts` pass 4). */
const UNPLANNED = { planned_id: null, workout_id: 'w1', endurance_quality: 'unplanned', strength_quality: null, summary: 'unplanned session' };
const ATTACHED = { planned_id: 'p1', workout_id: 'w1', endurance_quality: 'followed', strength_quality: null, summary: 'Linked to plan — 3 x 10 min.' };

/** Three work intervals with watts bands and no recoveries, so the steadiness ladder has nothing to say and
 *  answers "steady" — the path that put a whole-file drift number on an unattached interval ride. */
const rideAnalysis = {
  performance: { execution_adherence: 82, power_adherence: 90, duration_adherence: 95, execution_basis: 'work_time_in_range' },
  granular_analysis: { performance_assessment: 'Solid execution' },
  detailed_analysis: {
    interval_breakdown: {
      intervals: [
        { interval_id: 'a', interval_type: 'work', interval_number: 1, planned_power_range_lower: 240, planned_power_range_upper: 260, avg_power_watts: 250, actual_duration_s: 600, power_adherence_percent: 100 },
        { interval_id: 'b', interval_type: 'work', interval_number: 2, planned_power_range_lower: 240, planned_power_range_upper: 260, avg_power_watts: 270, actual_duration_s: 600, power_adherence_percent: 96 },
        { interval_id: 'c', interval_type: 'work', interval_number: 3, planned_power_range_lower: 240, planned_power_range_upper: 260, avg_power_watts: 230, actual_duration_s: 600, power_adherence_percent: 96 },
      ],
    },
  },
  bike_fitness_v1: { counts_toward_trend: true },
  adherence_summary: {
    verdict: 'Solid execution.',
    technical_insights: [{ label: 'Cardiac Drift', value: 'Moderate HR drift in the second half.' }],
    plan_impact: { focus: 'Aerobic base', outlook: 'Quality session executed well — proceed with planned next session.' },
  },
  session_state_v1: {
    glance: { status_label: 'Good' },
    details: { flags_v1: [{ type: 'concern', category: 'hr', message: 'HR drift 12 bpm — elevated.', priority: 1 }] },
  },
  fact_packet_v1: {
    facts: { normalized_power_w: 240, intensity_factor: 0.85, avg_hr: 150, total_duration_min: 60 },
    derived: {
      primary_limiter: { limiter: 'heat', confidence: 0.7, evidence: ['Dew point 70°F'] },
      power_halves: { first_w: 245, second_w: 235 },
    },
  },
};

function ride(match: unknown) {
  return buildSessionDetailV1({
    workoutId: 'w1', workoutDate: '2026-09-20', workoutType: 'ride', workoutName: 'Zwift - Anaerobic Ride',
    ledgerDay: null, actualSession: { hr_drift_bpm: 7 } as any, match: match as any, plannedSession: null,
    plannedRowRaw: null, completedStrengthExercises: null, bodyweightLb: null, observations: [],
    completedComputed: {
      overall: { distance_m: 30000, duration_s_moving: 3600 },
      analysis: { efficiency: { efficiency_factor: 1.4, aerobic_decoupling_pct: 6.2 } },
    },
    completedMovingS: 3600,
    completedAvgHr: 150,
    loadContext: { workload: 78 },
    workoutAnalysis: rideAnalysis,
    narrativeText: null,
  } as any);
}

const labels = (sd: any) => (sd.analysis_details.rows as Array<{ label: string }>).map((r) => r.label);

Deno.test('an unattached interval ride: no drift, no steadiness row, no verdict field', () => {
  const sd: any = ride(UNPLANNED);
  assertEquals(sd.classification.is_unplanned, true);
  // Drift and steadiness: none.
  assertEquals(sd.classification.decoupling, null);
  assertEquals(sd.classification.hr_drift_bpm, null);
  for (const l of ['Heart rate', 'EFFICIENCY', 'Flag', 'Limiter']) assert(!labels(sd).includes(l), `row ${l} printed`);
  // Grades: none.
  const ex = sd.execution;
  for (const k of ['execution_score', 'pace_adherence', 'power_adherence', 'duration_adherence', 'intensity_adherence',
    'volume_ratio_pct', 'easy_line', 'performance_assessment', 'off_prescription', 'execution_line', 'status_label']) {
    assertEquals(ex[k] ?? null, null, k);
  }
  assertEquals(sd.display.show_adherence_chips, false);
  assertEquals(sd.display.has_measured_execution, false);
  assertEquals(sd.session_interpretation, null);
  assertEquals(sd.adherence.technical_insights, []);
  // No colour and no percent on any row; the watts stay.
  for (const iv of sd.intervals) {
    assertEquals(iv.executed.band, null);
    assertEquals(iv.pace_adherence_pct, null);
  }
  assertEquals(sd.intervals.map((iv: any) => iv.executed.power_watts), [250, 270, 230]);
  // Facts stay: distance, time, heart rate, workload, the pacing row, the ledger's own line.
  assertEquals(sd.completed_totals.distance_m, 30000);
  assertEquals(sd.completed_totals.moving_s, 3600);
  assertEquals(sd.completed_totals.avg_hr, 150);
  assertEquals(sd.load, { workload: 78 });
  assert(labels(sd).includes('Pacing'));
  assertEquals(sd.adherence.plan_impact_text, 'unplanned session');
});

Deno.test('a ride the athlete unattached (no match at all) reads the same', () => {
  const sd: any = ride(null);
  assertEquals(sd.classification.is_unplanned, true);
  assertEquals(sd.classification.decoupling, null);
  assertEquals(sd.execution.execution_score, null);
  assertEquals(sd.adherence.plan_impact_text, null); // not the analyser's "proceed with planned next session"
});

Deno.test('the same ride with a plan attached is unchanged: every verdict still there', () => {
  const sd: any = ride(ATTACHED);
  assertEquals(sd.classification.is_unplanned, false);
  assertEquals(sd.classification.decoupling?.pct, 6.2);
  assertEquals(sd.classification.decoupling?.basis, 'power');
  assertEquals(sd.classification.decoupling?.line, '1.2 over the 5% line');
  assertEquals(sd.classification.hr_drift_bpm, 7);
  for (const l of ['EFFICIENCY', 'Flag', 'Limiter', 'Pacing']) assert(labels(sd).includes(l), `row ${l} missing`);
  assertEquals(sd.execution.execution_score, 82);
  assertEquals(sd.execution.power_adherence, 90);
  assertEquals(sd.execution.duration_adherence, 95);
  assertEquals(sd.execution.execution_line, '3 of 3 intervals done');
  assertEquals(sd.execution.status_label, 'Good');
  assertEquals(sd.execution.performance_assessment, 'Solid execution');
  assertEquals(sd.display.show_adherence_chips, true);
  assert(sd.session_interpretation != null);
  assertEquals(sd.adherence.technical_insights.length, 1);
  assertEquals(sd.intervals.map((iv: any) => iv.executed.band), ['in', 'above', 'below']);
});

/** A steady run with a grade-adjusted decoupling the Heart rate row prints. */
function run(match: unknown) {
  return buildSessionDetailV1({
    workoutId: 'w2', workoutDate: '2026-09-20', workoutType: 'run', workoutName: 'Morning Run',
    ledgerDay: null, actualSession: null, match: match as any, plannedSession: null,
    plannedRowRaw: null, completedStrengthExercises: null, bodyweightLb: null, observations: [],
    completedComputed: { overall: { distance_m: 8047, duration_s_moving: 2700, avg_pace_s_per_mi: 540, avg_gap_s_per_mi: 530 } },
    workoutAnalysis: {
      heart_rate_summary: { decouplingPct: 3.2, decouplingBasis: 'gap', decouplingAssessment: 'good' },
      fact_packet_v1: { facts: { workout_type: 'easy_run' }, derived: {} },
    },
    narrativeText: null,
  } as any);
}

Deno.test('an unattached run: no Heart rate drift row; grade-adjusted pace stays', () => {
  const sd: any = run(UNPLANNED);
  assertEquals(sd.classification.decoupling, null);
  assert(!labels(sd).includes('Heart rate'));
  assert(labels(sd).includes('Grade-adjusted pace'));
});

Deno.test('the same run with a plan attached keeps its Heart rate row', () => {
  const sd: any = run({ ...ATTACHED, workout_id: 'w2' });
  assertEquals(sd.classification.decoupling?.pct, 3.2);
  const hr = (sd.analysis_details.rows as Array<{ label: string; value: string }>).find((r) => r.label === 'Heart rate');
  assertEquals(hr?.value, 'Held steady with pace (drift 3.2%)');
  assert(labels(sd).includes('Grade-adjusted pace'));
});
