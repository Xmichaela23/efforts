/**
 * THE ONE COMPLETED-SET SHAPE — fixtures.
 *
 *   ~/.deno/bin/deno test --allow-read src/lib/normalize-strength-set.test.ts --no-check
 *
 * Pins the spread-first contract: a field the logger writes reaches the client instead of being
 * whitelisted off. The band-assist case (resistance_level) is the regression the file exists for —
 * it was dropped by hand-listed rebuilds in get-week, workout-detail (x2), useWorkouts and the
 * Performance summary, so Aug-10 Dips read "10 reps" with no assist (2026-08-11).
 */
import { assert, assertEquals } from 'https://deno.land/std@0.208.0/assert/mod.ts';
import {
  normalizeCompletedStrengthSet,
  normalizeCompletedStrengthExercise,
  isUntouchedPrefill,
} from './normalize-strength-set.ts';

// ── THE BUG: band assist must survive ─────────────────────────────────────────────────────────
Deno.test('resistance_level (band assist) rides through', () => {
  const out = normalizeCompletedStrengthSet({ reps: 10, weight: 0, completed: true, resistance_level: 75 });
  assertEquals(out.resistance_level, 75);
  assertEquals(out.reps, 10);
  assertEquals(out.completed, true);
});

Deno.test('amrap and duration_seconds ride through', () => {
  const amrap = normalizeCompletedStrengthSet({ reps: 5, weight: 190, completed: true, amrap: true });
  assertEquals(amrap.amrap, true);
  const plank = normalizeCompletedStrengthSet({ reps: 0, weight: 0, completed: true, duration_seconds: 60 });
  assertEquals(plank.duration_seconds, 60);
});

Deno.test('an arbitrary future field is not dropped (spread-first)', () => {
  const out = normalizeCompletedStrengthSet({ reps: 8, weight: 100, completed: true, difficulty: 'grind', some_new_field: 'x' });
  assertEquals(out.difficulty, 'grind');
  assertEquals((out as any).some_new_field, 'x');
});

// ── coercion of the known fields ──────────────────────────────────────────────────────────────
Deno.test('known fields coerce to stable types', () => {
  const out = normalizeCompletedStrengthSet({ reps: '12', weight: '95.5', rir: 2, completed: 1, prefilled: 0 });
  assertEquals(out.reps, 12);
  assertEquals(out.weight, 95.5);
  assertEquals(out.rir, 2);
  assertEquals(out.completed, true);
  assertEquals(out.prefilled, false);
});

Deno.test('non-numeric rir becomes undefined; garbage set is safe', () => {
  assertEquals(normalizeCompletedStrengthSet({ reps: 5, weight: 10, rir: 'hard' }).rir, undefined);
  const empty = normalizeCompletedStrengthSet(null);
  assertEquals(empty.reps, 0);
  assertEquals(empty.completed, false);
  assertEquals(empty.prefilled, false);
});

// ── exercise wrapper: sets normalized, exercise-level facts preserved ──────────────────────────
Deno.test('exercise wrapper normalizes sets and preserves substituted_for', () => {
  const ex = normalizeCompletedStrengthExercise({
    name: 'Dips',
    substituted_for: 'Band Face Pulls',
    sets: [
      { reps: 10, weight: 0, completed: true, resistance_level: 75 },
      { reps: 8, weight: 0, completed: true, resistance_level: 75 },
    ],
  }, 0);
  assertEquals(ex.name, 'Dips');
  assertEquals(ex.substituted_for, 'Band Face Pulls');
  assertEquals(ex.sets.length, 2);
  assertEquals(ex.sets[0].resistance_level, 75);
  assertEquals(ex.sets[1].resistance_level, 75);
  assert(typeof ex.id === 'string');
});

Deno.test('legacy compact shape (sets as a count) expands to a normalized array', () => {
  const ex = normalizeCompletedStrengthExercise({ name: 'Push Up', sets: 3, reps: 15, weight: 0 }, 1);
  assertEquals(ex.sets.length, 3);
  assertEquals(ex.sets[0].reps, 15);
  assertEquals(ex.sets[0].completed, false);
});

// ── D-204: the prefill predicate is a separate question from shape ─────────────────────────────
Deno.test('isUntouchedPrefill flags only completed!==true && prefilled===true', () => {
  assertEquals(isUntouchedPrefill({ prefilled: true, completed: false }), true);
  assertEquals(isUntouchedPrefill({ prefilled: true, completed: true }), false); // touched
  assertEquals(isUntouchedPrefill({ prefilled: false, completed: false }), false); // legacy real set
  assertEquals(isUntouchedPrefill({ reps: 5 }), false); // no flag → kept
});
