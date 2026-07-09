/**
 * Golden fixture for buildBodyResponse (D-236 Part A).
 *
 * A characterization test: it pins the EXACT emitted strings for every
 * session_signals / weekly_trends / load_status field on a representative week
 * (runs with HR-vs-norm + drift, lower-body strength with RIR + top-lifts, a
 * load_status with ACWR + cross-training + unplanned). Its job is drift
 * detection — buildBodyResponse is the deterministic fact layer (D-236 reframe:
 * NOT retired into narrative-core), and any future touch that changes a user-
 * facing string here fails loudly. The values were captured from the current
 * implementation, not hand-derived; update them only on an INTENTIONAL change.
 *
 * Run from repo root:
 *   deno test supabase/functions/_shared/athlete-snapshot/body-response-golden.test.ts --no-check
 */
import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { buildBodyResponse } from './body-response.ts';

function run(id: string, date: string, day: string, hr: number, exec: number, rpe: number, dec: number, load: number) {
  return {
    date, day_name: day, is_today: false, is_past: true, planned: [], matches: [],
    actual: [{
      workout_id: id, type: 'run', name: 'Easy Run', source: 'garmin' as const,
      duration_seconds: 3000, distance_meters: 8000, pace: '9:00/mi', avg_hr: hr,
      load_actual: load, rpe, feeling: null, execution_score: exec, decoupling_pct: dec, hr_drift_bpm: dec, // D-264: cardiac trend now reads hr_drift_bpm (real signal); decoupling_pct retained for the % observation
      strength_actual: null,
    }],
  };
}
function strength(id: string, date: string, day: string, rir: number, target: number, load: number) {
  return {
    date, day_name: day, is_today: false, is_past: true, planned: [], matches: [],
    actual: [{
      workout_id: id, type: 'strength', name: 'Lower Body Strength', source: 'manual' as const,
      duration_seconds: 3600, distance_meters: null, pace: null, avg_hr: null,
      load_actual: load, rpe: 7, feeling: null, execution_score: null, decoupling_pct: null, hr_drift_bpm: null,
      strength_actual: [
        { name: 'Back Squat', sets: 3, best_weight: 225, best_reps: 5, avg_rir: rir, target_rir: target, rir_delta: rir - target, unit: 'lbs' as const },
        { name: 'Romanian Deadlift', sets: 3, best_weight: 185, best_reps: 8, avg_rir: rir, target_rir: target, rir_delta: rir - target, unit: 'lbs' as const },
      ],
    }],
  };
}

const LEDGER = [
  run('r1', '2026-06-29', 'Monday', 152, 88, 5, 4.2, 180),
  strength('s1', '2026-06-30', 'Tuesday', 2, 2, 90),
  run('r2', '2026-07-01', 'Wednesday', 156, 90, 6, 5.1, 190),
  strength('s2', '2026-07-02', 'Thursday', 1, 2, 95),
  run('r3', '2026-07-03', 'Friday', 150, 85, 5, 6.8, 175),
];
const NORMS = {
  easy_hr_at_pace: 144, threshold_pace_sec_per_mi: 420, avg_execution_score: 90,
  avg_rpe: 4.3, avg_hr_drift_bpm: 6, avg_decoupling_pct: 3.5, avg_rir: 2,
};
const LOAD_STATUS = { actual_vs_planned_pct: 108, acwr: 1.10, running_acwr: 1.05, cycling_acwr: null };
const CROSS = { interference: false, detail: 'balanced' };
const PROFILES = [
  { discipline: 'run', maturity: 'established' as const, sessions_28d: 12 },
  { discipline: 'strength', maturity: 'learning' as const, sessions_28d: 6 },
];

const out = buildBodyResponse(LEDGER as any, NORMS as any, true, LOAD_STATUS, CROSS, 'build', PROFILES);

Deno.test('golden: session_signals strings (HR-vs-norm, drift bands, RIR verdict, top-lifts, RPE)', () => {
  assertEquals(out.session_signals, [
    { date: '2026-06-29', workout_id: 'r1', type: 'run', observations: [
      'HR 152 bpm — 8 bpm above your norm for this pace.',
      'Moderate cardiac drift (4.2%) — normal for this duration.',
    ] },
    { date: '2026-06-30', workout_id: 's1', type: 'strength', observations: [
      'Hit prescribed intensity — averaged 2.0 RIR against target 2.',
      'Top lifts: Back Squat 225lbs × 5 (2.0 vs 2 RIR), Romanian Deadlift 185lbs × 8 (2.0 vs 2 RIR).',
      'Rated effort 7/10.',
    ] },
    { date: '2026-07-01', workout_id: 'r2', type: 'run', observations: [
      'HR 156 bpm — 12 bpm above your norm for this pace.',
      'Moderate cardiac drift (5.1%) — normal for this duration.',
    ] },
    { date: '2026-07-02', workout_id: 's2', type: 'strength', observations: [
      'Close to prescribed intensity — 1.0 RIR vs target 2.',
      'Top lifts: Back Squat 225lbs × 5 (1.0 vs 2 RIR), Romanian Deadlift 185lbs × 8 (1.0 vs 2 RIR).',
      'Rated effort 7/10.',
    ] },
    { date: '2026-07-03', workout_id: 'r3', type: 'run', observations: [
      'HR 150 bpm — 6 bpm above your norm for this pace.',
      'Significant cardiac drift (6.8%) — fatigue kicked in during this session.',
    ] },
  ]);
});

Deno.test('golden: weekly_trends strings (run_quality / effort / cardiac / strength / cross_training)', () => {
  assertEquals(out.weekly_trends, {
    run_quality: { trend: 'stable', detail: 'holding steady across 3 sessions', based_on_sessions: 3 },
    effort_perception: { trend: 'stable', detail: 'holding steady across 5 sessions', based_on_sessions: 5 },
    cardiac: { trend: 'declining', detail: 'declining across 3 sessions', based_on_sessions: 3 },
    strength: { trend: 'declining', detail: 'declining across 2 sessions', based_on_sessions: 2 },
    cross_training: { interference: false, detail: 'balanced' },
  });
});

Deno.test('golden: load_status strings (status, interpretation, load receipts, unplanned, cross-training)', () => {
  assertEquals(out.load_status, {
    actual_vs_planned_pct: 108,
    acwr: 1.1,
    running_acwr: 1.05,
    cycling_acwr: null,
    run_only_week_load: 545,
    run_only_week_load_pct: null,
    running_weighted_week_load: 675,
    running_weighted_week_load_pct: null,
    unplanned_summary: '5 unplanned: 3 runs, 2 strengths',
    cross_training_load_summary: '2 strength (185 pts, moderate running impact, learning — 6 sessions)',
    status: 'on_target',
    interpretation: 'running load on target. Cross-training: 2 strength (185 pts, moderate running impact, learning — 6 sessions). 5 unplanned: 3 runs, 2 strengths',
    avg_run_hr_drift_bpm: 5.4, // D-264 step 0 receipt: mean of the 3 runs' drift (4.2/5.1/6.8)
  });
});
