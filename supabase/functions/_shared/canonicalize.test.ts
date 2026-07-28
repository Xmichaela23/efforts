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
  assertEquals(canonicalDisplayName('single_leg_rdl'), 'Single Leg RDL');
});

Deno.test('pre-existing explicit plurals are unchanged by the fallback', () => {
  assertEquals(canonicalize('Pushups'), 'pushup');
  assertEquals(canonicalize('Hip Thrusts'), 'hip_thrust');
  assertEquals(canonicalize('Barbell Rows'), 'barbell_row');
});

// ── Q-210: qualifiers and separators — the THIRD decoration class ──────────────
//
// Q-197 fixed two ways a real name can be decorated and miss the map: SYNONYMS
// ("Barbell Back Squat") and PLURALS ("Bulgarian Split Squats"). It never covered the
// third: a trailing PARENTHETICAL, or a HYPHEN where the map has a space. Measured
// 2026-07-28 — 78 of 111 emitted names miss the curated map, and 19 of those misses
// have a curated key for the SAME movement already sitting in the map.
//
// The one that matters: "Hip Thrusts" canonicalizes to `hip_thrust`, which IS in
// STRENGTH_ANCHORS, so it earns an e1RM and a trend. "Hip Thrusts (Fast Concentric)"
// slugified to a lone bucket and was dropped from the anchors entirely — the same lift,
// in the same block, tracked or invisible depending on a parenthetical. That field is
// `learned_fitness.strength_1rms`, which is what the 1RM-learning ticket reads.

Deno.test('a trailing qualifier does not hide a mapped lift (Q-210)', () => {
  const cases: Array<[string, string]> = [
    ['Hip Thrusts (Fast Concentric)', 'hip_thrust'],   // ⛔ the anchor-dropping one
    ['Goblet Squat (Heavy)', 'goblet_squat'],
    ['Bodyweight Squat (3-2-X tempo)', 'bodyweight_squat'],
    ['Bodyweight Squat (3-sec descent)', 'bodyweight_squat'],
    ['Bulgarian Split Squat (Pistol Prep)', 'bulgarian_split_squat'],
    ['DB Bench Press (Light)', 'db_bench_press'],
    ['DB Shoulder Press (Light)', 'db_shoulder_press'],
    ['Glute Bridges (Explosive)', 'glute_bridge'],
    ['Calf Raises (Bilateral)', 'calf_raise'],
  ];
  for (const [raw, want] of cases) {
    assertEquals(canonicalize(raw), want, `"${raw}" should canonicalize to ${want}`);
  }
});

Deno.test('a hyphen where the map has a space does not hide a mapped lift (Q-210)', () => {
  const cases: Array<[string, string]> = [
    ['Lat Pull Down', 'lat_pulldown'],                 // map has "lat pulldown"
    ['Lat Pull-Down (Light)', 'lat_pulldown'],         // hyphen AND qualifier
    ['Single-Leg RDL (Bodyweight)', 'single_leg_rdl'],
    ['Single-Leg RDL (Bodyweight, Slow)', 'single_leg_rdl'],
    ['Single-Leg RDL (Heavy DB)', 'single_leg_rdl'],
    ['Single Leg RDL (Supported)', 'single_leg_rdl'],
    ['Pull-ups (Explosive)', 'pullup'],
    ['Push-ups (explosive)', 'pushup'],
    ['Push-ups (Incline → Flat progression)', 'pushup'],
  ];
  for (const [raw, want] of cases) {
    assertEquals(canonicalize(raw), want, `"${raw}" should canonicalize to ${want}`);
  }
});

Deno.test('⛔ CONTAINMENT IS NOT IDENTITY — the strip must not over-merge (Q-210)', () => {
  // Michael, on the 26 containment cases left deliberately unruled: "Jump Squats contains
  // squat and is NOT a squat for 1RM purposes." Folding these would put a plyometric into
  // an anchor's e1RM bucket. Every one of these must keep its own lone bucket.
  const mustStaySeparate = [
    'Jump Squats', 'Squat Jumps', 'Jump Lunges', 'Pike Push ups',
    'Explosive Lat Pull Down', 'Light DB Row', 'Copenhagen Plank', 'Plank Hold',
    'Band Assisted Pull up', 'Box Step ups',
  ];
  for (const raw of mustStaySeparate) {
    const got = canonicalize(raw);
    assertEquals(
      got,
      raw.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, ''),
      `"${raw}" must stay its own bucket — containment is not identity`,
    );
  }
});
