/**
 * Regression fixtures for exercise-name canonicalization (_shared/canonicalize.ts).
 *
 * Q-197: squat e1RM was split across TWO canonical buckets because two real raw
 * names never mapped and slugified into lone buckets:
 *   - "Barbell Back Squat" -> barbell_back_squat  (dropped from STRENGTH_ANCHORS)
 *   - "Bulgarian Split Squats" (plural) -> bulgarian_split_squats
 * These pin that all synonyms of the standard back squat fold into `squat`, that
 * genuinely distinct squat variants stay separate, and that the plural fallback
 * folds a trailing-s name into its mapped singular WITHOUT over-merging.
 *
 * Run from repo root:
 *   deno test supabase/functions/_shared/canonicalize.test.ts --no-check
 */
import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { canonicalize, canonicalDisplayName } from './canonicalize.ts';

Deno.test('back-squat synonyms all fold into squat (Q-197)', () => {
  for (const raw of [
    'Squat', 'squat',
    'Back Squat', 'back squat',
    'Barbell Back Squat', 'barbell back squat',
    'Barbell Squat', 'BB Squat',
    'High Bar Squat', 'Low Bar Squat',
  ]) {
    assertEquals(canonicalize(raw), 'squat', `"${raw}" should canonicalize to squat`);
  }
});

Deno.test('distinct squat variants stay separate — nothing over-merged', () => {
  assertEquals(canonicalize('Front Squat'), 'front_squat');
  assertEquals(canonicalize('Goblet Squat'), 'goblet_squat');
  assertEquals(canonicalize('Bulgarian Split Squat'), 'bulgarian_split_squat');
  assertEquals(canonicalize('Split Squat'), 'split_squat');
  assertEquals(canonicalize('Bodyweight Squat'), 'bodyweight_squat');
});

Deno.test('plural fallback folds trailing-s into its mapped singular (Q-197)', () => {
  assertEquals(canonicalize('Bulgarian Split Squats'), 'bulgarian_split_squat');
  assertEquals(canonicalize('Goblet Squats'), 'goblet_squat');
  assertEquals(canonicalize('Front Squats'), 'front_squat');
  assertEquals(canonicalize('Barbell Back Squats'), 'squat');
});

Deno.test('deadlift + OHP synonyms fold into their anchor (Q-197 extension)', () => {
  for (const raw of ['Deadlift', 'Conventional Deadlift', 'Conventional deadlift', 'Barbell Deadlift']) {
    assertEquals(canonicalize(raw), 'deadlift', `"${raw}" should canonicalize to deadlift`);
  }
  for (const raw of ['Overhead Press', 'Standing Barbell Overhead Press', 'Standing Overhead Press', 'Barbell Overhead Press', 'OHP', 'Military Press']) {
    assertEquals(canonicalize(raw), 'overhead_press', `"${raw}" should canonicalize to overhead_press`);
  }
});

Deno.test('distinct deadlift/press variants stay separate', () => {
  assertEquals(canonicalize('Romanian Deadlift'), 'romanian_deadlift');
  assertEquals(canonicalize('Trap Bar Deadlift'), 'trap_bar_deadlift');
  assertEquals(canonicalize('Sumo Deadlift'), 'sumo_deadlift');
  assertEquals(canonicalize('Dumbbell Bench Press'), 'db_bench_press');
});

Deno.test('plural fallback never over-merges an unmapped name', () => {
  // "hack squat" is not in the map and has no singular collision -> its own bucket.
  assertEquals(canonicalize('Hack Squats'), 'hack_squats');
  assertEquals(canonicalize('Hack Squat'), 'hack_squat');
});

Deno.test('canonicalDisplayName gives one clean label per lift, regardless of raw name', () => {
  // Every raw squat synonym canonicalizes to the same clean label.
  for (const raw of ['Barbell Back Squat', 'back squat', 'Squat', 'BB Squat']) {
    assertEquals(canonicalDisplayName(canonicalize(raw)), 'Back Squat');
  }
  assertEquals(canonicalDisplayName(canonicalize('Conventional Deadlift')), 'Deadlift');
  assertEquals(canonicalDisplayName(canonicalize('Standing Barbell Overhead Press')), 'Overhead Press');
  assertEquals(canonicalDisplayName(canonicalize('Hip Thrusts')), 'Hip Thrust');
  // Title-case fallback for unmapped canonicals.
  assertEquals(canonicalDisplayName('front_squat'), 'Front Squat');
  assertEquals(canonicalDisplayName('hack_squat'), 'Hack Squat');
  // Abbreviation cases title-case can't do.
  assertEquals(canonicalDisplayName('db_row'), 'DB Row');
  assertEquals(canonicalDisplayName('single_leg_rdl'), 'Single-Leg RDL');
});

Deno.test('pre-existing explicit plurals are unchanged by the fallback', () => {
  assertEquals(canonicalize('Pushups'), 'pushup');
  assertEquals(canonicalize('Hip Thrusts'), 'hip_thrust');
  assertEquals(canonicalize('Barbell Rows'), 'barbell_row');
});
