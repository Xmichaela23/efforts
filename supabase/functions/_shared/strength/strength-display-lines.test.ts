/**
 * The planned strength row's line, written by materialize-plan (audit H-D14). The first four tests moved
 * from `src/utils/strengthFormatter.last-result.test.ts` with the formatter.
 *
 * Run: deno test --no-check --no-lock supabase/functions/_shared/strength/strength-display-lines.test.ts
 */
import { assert, assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { formatStrengthExercise, formatStrengthExerciseLines } from './strength-display-lines.ts';

const ROW = { name: 'Bench Press', sets: 1, reps: '1-5', weight_display: '145 lb' };

Deno.test('⛔⛔ THE ROW SAYS WHAT THEY GOT LAST TIME — the most recent, not the best', () => {
  assertEquals(formatStrengthExercise({ ...ROW, last_reps: [4] }), 'Bench Press 1×1-5 @ 145 lb — last time 4');
  assertEquals(formatStrengthExercise({ ...ROW, last_reps: [5, 4, 3] }), 'Bench Press 1×1-5 @ 145 lb — last time 3');
});

Deno.test('⛔ ABSENT MEANS ABSENT — the line disappears the week a jump lands', () => {
  const bare = formatStrengthExercise(ROW);
  assertEquals(bare, 'Bench Press 1×1-5 @ 145 lb');
  assertEquals(formatStrengthExercise({ ...ROW, last_reps: [] }), bare);
  assertEquals(formatStrengthExercise({ ...ROW, last_reps: null }), bare);
  assertEquals(formatStrengthExercise({ ...ROW, last_reps: 'five' }), bare);
  assertEquals(formatStrengthExercise({ ...ROW, last_reps: [NaN] }), bare);
});

Deno.test('⛔ AND IT DOES NOT DISTURB THE ROW IT SITS ON', () => {
  const full = formatStrengthExercise({ ...ROW, notes: 'competition grip', last_reps: [2] });
  assert(full.startsWith('Bench Press 1×1-5 @ 145 lb (competition grip)'), full);
  assert(full.endsWith('— last time 2'), full);
});

Deno.test('a zero prints — the failed attempt is a result too', () => {
  assertEquals(formatStrengthExercise({ ...ROW, last_reps: [0] }), 'Bench Press 1×1-5 @ 145 lb — last time 0');
});

Deno.test('the book word, the reserve, the adjusted weight in the athlete\'s unit', () => {
  assertEquals(
    formatStrengthExercise({ name: 'Back Squat', sets: 3, reps: 5, slot_intent: 'HYP', target_rir: 2, weight_display: '80 kg', adjusted: true, original_weight: 85 }, 'kg'),
    'HYP · Back Squat 3×5 · 2 in reserve @ 80 kg (was 85 kg)',
  );
  // ME states no reserve target (p218) — none printed even if one arrived.
  assertEquals(formatStrengthExercise({ name: 'Deadlift', sets: 1, reps: '1-5', slot_intent: 'ME', target_rir: 1, weight_display: '315 lb' }), 'ME · Deadlift 1×1-5 @ 315 lb');
  assertEquals(formatStrengthExercise({ name: 'Front Squat', sets: 3, reps: 5, baseline_missing: true }), 'Front Squat 3×5 @ [Setup Required]');
});

Deno.test('no "your call" sentence; the reserve reads "1 to 2" (Michael, 2026-09-10)', () => {
  assertEquals(formatStrengthExercise({ name: 'Calf Raise', sets: 3, reps: 12, load_basis: 'auto_regulated' }),
    'Calf Raise 3×12');
  assertEquals(formatStrengthExercise({ name: 'Calf Raise', sets: 3, reps: 12, load_basis: 'auto_regulated', target_rir: 1.5 }),
    'Calf Raise 3×12 · 1 to 2 in reserve');
  assertEquals(formatStrengthExercise({ name: 'Split Squat', sets: 3, reps: 8, load_basis: 'per_side' }),
    'Split Squat 3×8');
  assertEquals(formatStrengthExercise({ name: 'Bench Press', sets: 3, reps: 5, load_basis: 'awaiting_test' }),
    'Bench Press 3×5 — weights arrive once you log the test');
});

Deno.test('a superset pair is one line, its sentence first', () => {
  assertEquals(formatStrengthExerciseLines([
    { name: 'Tate Press', sets: 3, reps: '6-12', slot_intent: 'HYP', target_rir: 1, superset_group: 'a', load_basis: 'auto_regulated' },
    { name: 'Drag Curl', sets: 3, reps: '6-12', slot_intent: 'HYP', target_rir: 1, superset_group: 'a' },
    { name: 'Row', sets: 3, reps: 8, weight_display: '100 lb' },
  ]), [
    'Superset: Tate Press with Drag Curl — one set of each, rest, then again.',
    'HYP · Tate Press + Drag Curl · superset · 3×6-12 · 1 in reserve',
    'Row 3×8 @ 100 lb',
  ]);
});
