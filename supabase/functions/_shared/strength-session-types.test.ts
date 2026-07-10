// b2 (Q-149) regressions for the strength session-type breakdown. Pins:
//  - the verified read path (session_state_v1.glance.execution_score)
//  - test-exclusion (a 1RM test contributes test_count, NOT the graded mean) — permanent regression
//  - lower/upper/full classification via the shared classifyStrengthFocus
//  - NEG: an endurance-only week yields an empty strength breakdown (zero-regression for non-strength athletes)
import { assertEquals } from 'https://deno.land/std@0.208.0/assert/mod.ts';
import { buildStrengthSessionTypes7d, strengthFocusFromWorkout } from './strength-session-types.ts';

function strengthWorkout(opts: {
  date: string;
  exercises: string[];
  execution_score: number | null;
  is_test?: boolean;
  primary_mover?: string | null;
  status?: string;
  type?: string;
}) {
  return {
    date: opts.date,
    type: opts.type ?? 'strength',
    workout_status: opts.status ?? 'completed',
    strength_exercises: opts.exercises.map((name) => ({ name })),
    workout_analysis: {
      session_state_v1: {
        is_test: opts.is_test === true,
        glance: {
          status_label: opts.is_test ? '1RM Test' : (opts.execution_score != null ? 'Solid execution' : null),
          execution_score: opts.is_test ? null : opts.execution_score,
        },
        details: {
          execution_summary: {
            component_attribution: { primary_mover: opts.primary_mover ?? null },
          },
        },
      },
    },
  };
}

Deno.test('lower-body sessions aggregate with the analyzer execution score + tone', () => {
  const out = buildStrengthSessionTypes7d([
    strengthWorkout({ date: '2026-07-06', exercises: ['Back Squat', 'Reverse Lunge'], execution_score: 90 }),
    strengthWorkout({ date: '2026-07-08', exercises: ['Back Squat', 'RDL'], execution_score: 80, primary_mover: 'load_adherence' }),
  ]);
  assertEquals(out.length, 1);
  assertEquals(out[0].type, 'lower');
  assertEquals(out[0].type_label, 'Lower Body');
  assertEquals(out[0].sample_size, 2);
  assertEquals(out[0].avg_execution_score, 85); // (90+80)/2
  assertEquals(out[0].efficiency_tone, 'positive'); // 85 → positive
  assertEquals(out[0].primary_mover, 'load_adherence'); // most recent graded session (07-08)
  assertEquals(out[0].test_count, 0);
});

Deno.test('a 1RM test contributes test_count but NOT the graded mean (verified test-exclusion)', () => {
  const out = buildStrengthSessionTypes7d([
    strengthWorkout({ date: '2026-07-06', exercises: ['Bench Press', 'Barbell Row'], execution_score: 72 }),
    strengthWorkout({ date: '2026-07-09', exercises: ['Bench Press'], execution_score: null, is_test: true }),
  ]);
  assertEquals(out.length, 1);
  assertEquals(out[0].type, 'upper');
  assertEquals(out[0].sample_size, 2);        // both counted as sessions done
  assertEquals(out[0].avg_execution_score, 72); // ONLY the graded one — the test does not deflate the mean
  assertEquals(out[0].efficiency_tone, 'warning'); // 72 → warning
  assertEquals(out[0].test_count, 1);
});

Deno.test('full-body (lower + upper) classifies as full', () => {
  const out = buildStrengthSessionTypes7d([
    strengthWorkout({ date: '2026-07-07', exercises: ['Back Squat', 'Bench Press'], execution_score: 68 }),
  ]);
  assertEquals(out[0].type, 'full');
  assertEquals(out[0].efficiency_tone, 'danger'); // <70 → danger
  assertEquals(out[0].efficiency_label, 'Needs adjustment');
});

Deno.test('NEG: an endurance-only week yields an empty strength breakdown', () => {
  const out = buildStrengthSessionTypes7d([
    { date: '2026-07-06', type: 'run', workout_status: 'completed', workout_analysis: {} },
    { date: '2026-07-07', type: 'ride', workout_status: 'completed', workout_analysis: {} },
    { date: '2026-07-08', type: 'swim', workout_status: 'completed', workout_analysis: {} },
  ]);
  assertEquals(out.length, 0);
});

Deno.test('non-completed strength sessions are ignored', () => {
  const out = buildStrengthSessionTypes7d([
    strengthWorkout({ date: '2026-07-06', exercises: ['Back Squat'], execution_score: 90, status: 'planned' }),
  ]);
  assertEquals(out.length, 0);
});

Deno.test('all-tests week: session counted, no graded mean, honest label', () => {
  const out = buildStrengthSessionTypes7d([
    strengthWorkout({ date: '2026-07-06', exercises: ['Back Squat'], execution_score: null, is_test: true }),
  ]);
  assertEquals(out.length, 1);
  assertEquals(out[0].sample_size, 1);
  assertEquals(out[0].avg_execution_score, null);
  assertEquals(out[0].test_count, 1);
  assertEquals(out[0].efficiency_label, 'Test — not graded');
  assertEquals(out[0].efficiency_tone, 'neutral');
});

Deno.test('strengthFocusFromWorkout: name fallback when exercise list empty', () => {
  assertEquals(strengthFocusFromWorkout({ strength_exercises: [], name: 'Lower Body Day' }), 'lower');
  assertEquals(strengthFocusFromWorkout({ strength_exercises: [], name: 'Upper Push' }), 'upper');
  assertEquals(strengthFocusFromWorkout({ strength_exercises: [{ name: 'Back Squat' }, { name: 'Overhead Press' }] }), 'full');
});
