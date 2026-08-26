/**
 * ⛔ THE GATE — THE PLAN ROW SHOWS WHAT THEY GOT (stage 2, item 6).
 *
 *   ~/.deno/bin/deno test --no-check --sloppy-imports src/utils/strengthFormatter.last-result.test.ts
 *
 * The heavy slot printed "Bench Press 1×1-5 @ 145 lb" and nothing else. On a light bar the weight
 * moves ONCE in twelve weeks, so a block progressing exactly as designed reads as frozen for eight.
 * This is the one line where the athlete can see it moving.
 */
import { assert, assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { formatStrengthExercise } from './strengthFormatter.ts';

const ROW = { name: 'Bench Press', sets: 1, reps: '1-5', weight_display: '145 lb' };

Deno.test('⛔⛔ THE ROW SAYS WHAT THEY GOT LAST TIME', () => {
  assertEquals(formatStrengthExercise({ ...ROW, last_reps: [4] }), 'Bench Press 1×1-5 @ 145 lb — last time 4');
  // ⚠️ THE MOST RECENT, not the best of the window. A run of 5-4-3 is a lift heading down, and
  // printing the 5 would show the athlete a number they have not made in two sessions.
  assertEquals(formatStrengthExercise({ ...ROW, last_reps: [5, 4, 3] }), 'Bench Press 1×1-5 @ 145 lb — last time 3');
});

Deno.test('⛔ ABSENT MEANS ABSENT — the line disappears the week a jump lands', () => {
  // There is no last time at the NEW weight, and repeating a count earned on a lighter bar would be
  // a claim about a session that did not happen.
  const bare = formatStrengthExercise(ROW);
  assertEquals(bare, 'Bench Press 1×1-5 @ 145 lb');
  assertEquals(formatStrengthExercise({ ...ROW, last_reps: [] }), bare);
  assertEquals(formatStrengthExercise({ ...ROW, last_reps: null }), bare);
  assertEquals(formatStrengthExercise({ ...ROW, last_reps: 'five' }), bare);
  assertEquals(formatStrengthExercise({ ...ROW, last_reps: [NaN] }), bare);
});

Deno.test('⛔ AND IT DOES NOT DISTURB THE ROW IT SITS ON', () => {
  // ⚠️ Every existing part still prints, in order — the result is appended, never woven in. A row
  // that lost its weight or its notes to this change would be a worse trade than the frozen block.
  const full = formatStrengthExercise({
    ...ROW, notes: 'competition grip', last_reps: [2],
  });
  assert(full.startsWith('Bench Press 1×1-5 @ 145 lb (competition grip)'), full);
  assert(full.endsWith('— last time 2'), full);
});

Deno.test('a zero prints — the failed attempt is a result too', () => {
  // ⛔ NOT DROPPED BY A TRUTHINESS TEST. Zero is the session that undoes an earned jump; a row that
  // silently omitted it would show nothing on the one week the athlete most needs to see why.
  assertEquals(formatStrengthExercise({ ...ROW, last_reps: [0] }), 'Bench Press 1×1-5 @ 145 lb — last time 0');
});
