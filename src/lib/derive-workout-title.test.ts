/**
 * `deriveWorkoutTitle` — canonical title derivation regression lock.
 *
 * Locks the closure of the ENGINE-STATE Known Broken entry "Run — Tempo vs
 * Run Intervals 4×1000m label divergence". The four call sites (the new
 * shared utility + the three React components that consume it) now produce
 * the same canonical title for every workout shape.
 *
 * Run: deno test --no-check --no-lock --allow-all src/lib/derive-workout-title.test.ts
 */

import { assert, assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { deriveWorkoutTitle } from './derive-workout-title.ts';

// ── Materialized-name precedence (the core closure) ────────────────────────

Deno.test('preserves informative session-factory run name (rep count survives)', () => {
  // The drawer surface used to show this; the chip surfaces stripped it to
  // "Run — Intervals". Now both surfaces preserve the rep count.
  assertEquals(
    deriveWorkoutTitle({ type: 'run', name: 'Run Intervals — 6×1000m' }),
    'Run Intervals — 6×1000m',
  );
});

Deno.test('preserves informative tempo name (mileage survives)', () => {
  assertEquals(
    deriveWorkoutTitle({ type: 'run', name: 'Tempo Run — 5 mi at threshold' }),
    'Tempo Run — 5 mi at threshold',
  );
});

Deno.test('preserves informative ride name (duration survives)', () => {
  assertEquals(
    deriveWorkoutTitle({ type: 'ride', name: 'Long Ride — 2.5 hr' }),
    'Long Ride — 2.5 hr',
  );
});

Deno.test('preserves informative easy-run name with strides modifier', () => {
  assertEquals(
    deriveWorkoutTitle({ type: 'run', name: 'Easy Run + Strides — 5 mi' }),
    'Easy Run + Strides — 5 mi',
  );
});

// ── Generic name → derived fallback ────────────────────────────────────────

Deno.test('generic "Run" name falls back to interval regex on description', () => {
  assertEquals(
    deriveWorkoutTitle({ type: 'run', name: 'Run', description: '8x400m intervals at 5K pace' }),
    'Run — Intervals',
  );
});

Deno.test('generic "Run" name falls back to tempo regex on description', () => {
  assertEquals(
    deriveWorkoutTitle({ type: 'run', name: 'Run', description: 'Sustained tempo at threshold' }),
    'Run — Tempo',
  );
});

Deno.test('missing name + interval token in steps_preset → Run — Intervals', () => {
  assertEquals(
    deriveWorkoutTitle({ type: 'run', steps_preset: ['warmup_run_10min_easy', 'interval_4x1000m_base', 'cooldown_run_10min_easy'] }),
    'Run — Intervals',
  );
});

Deno.test('long_run tag overrides generic name', () => {
  assertEquals(
    deriveWorkoutTitle({ type: 'run', name: 'Run', tags: ['long_run'] }),
    'Run — Long Run',
  );
});

// ── Ride paths ─────────────────────────────────────────────────────────────

Deno.test('group_ride tag returns Group Ride', () => {
  assertEquals(
    deriveWorkoutTitle({ type: 'ride', name: 'Ride', tags: ['group_ride'] }),
    'Group Ride',
  );
});

Deno.test('bike_vo2_ token returns Ride — VO2', () => {
  assertEquals(
    deriveWorkoutTitle({ type: 'ride', name: 'Ride', steps_preset: ['bike_vo2_5x3min'] }),
    'Ride — VO2',
  );
});

Deno.test('sweet spot detected from description "sweet spot"', () => {
  assertEquals(
    deriveWorkoutTitle({ type: 'ride', name: 'Ride', description: 'Sweet spot intervals 2x15min' }),
    'Ride — Sweet Spot',
  );
});

Deno.test('sweet spot detected from "ssp" abbreviation', () => {
  assertEquals(
    deriveWorkoutTitle({ type: 'ride', name: 'Ride', description: '3x10 ssp at 90% FTP' }),
    'Ride — Sweet Spot',
  );
});

// ── Brick carve-out ────────────────────────────────────────────────────────

Deno.test('brick-tagged session preserves "Brick — Bike X hr" name', () => {
  assertEquals(
    deriveWorkoutTitle({ type: 'ride', name: 'Brick — Bike 2.5 hr', tags: ['brick'] }),
    'Brick — Bike 2.5 hr',
  );
});

Deno.test('brick-tagged ride with no Brick-prefixed name falls back to generic Brick — Bike', () => {
  assertEquals(
    deriveWorkoutTitle({ type: 'ride', name: 'Ride', tags: ['brick'] }),
    'Brick — Bike',
  );
});

Deno.test('brick-tagged run with no Brick-prefixed name falls back to Brick — Run off the bike', () => {
  assertEquals(
    deriveWorkoutTitle({ type: 'run', name: 'Run', tags: ['brick'] }),
    'Brick — Run off the bike',
  );
});

// ── Swim paths ─────────────────────────────────────────────────────────────

Deno.test('swim with technique tag returns Swim — Drills', () => {
  // plannedSwimSessionLabel may return a generic "Swim — N yd" — drill-like
  // detection adds the discipline qualifier.
  const label = deriveWorkoutTitle({
    type: 'swim',
    name: 'Swim — 2000 yd',
    tags: ['opt_kind:technique'],
  });
  assertEquals(label, 'Swim — Drills');
});

Deno.test('swim with workout_structure.title preserves the structured title', () => {
  const label = deriveWorkoutTitle({
    type: 'swim',
    name: 'Swim',
    workout_structure: { title: 'Technique Aerobic Swim — 2200 yd' },
  });
  assert(/Technique Aerobic Swim/.test(label), `expected Technique Aerobic Swim; got "${label}"`);
});

// ── Strength paths ─────────────────────────────────────────────────────────

Deno.test('strength preserves user-meaningful name and strips date suffix', () => {
  assertEquals(
    deriveWorkoutTitle({ type: 'strength', name: 'Push Day - 12/3/2025' }),
    'Push Day',
  );
});

Deno.test('strength with generic name falls through to compounds-detection on desc', () => {
  assertEquals(
    deriveWorkoutTitle({ type: 'strength', name: 'Strength', description: 'Back squat 4x6, bench press 3x8' }),
    'Strength — Compounds',
  );
});

Deno.test('strength with generic name and accessory desc → Strength — Accessory', () => {
  assertEquals(
    deriveWorkoutTitle({ type: 'strength', name: 'Strength', description: 'Chin-ups, rows, lunges' }),
    'Strength — Accessory',
  );
});

Deno.test('strength with no signals returns plain "Strength"', () => {
  assertEquals(
    deriveWorkoutTitle({ type: 'strength' }),
    'Strength',
  );
});

// ── Pilates / Yoga ─────────────────────────────────────────────────────────

Deno.test('pilates_yoga discriminates yoga from name', () => {
  assertEquals(
    deriveWorkoutTitle({ type: 'pilates_yoga', name: 'Vinyasa Yoga Flow' }),
    'Yoga',
  );
});

Deno.test('pilates_yoga discriminates pilates from description', () => {
  assertEquals(
    deriveWorkoutTitle({ type: 'pilates_yoga', name: 'Mat session', description: 'Pilates core work' }),
    'Pilates',
  );
});

// ── Defensive cases ────────────────────────────────────────────────────────

Deno.test('null / undefined workout returns "Session"', () => {
  assertEquals(deriveWorkoutTitle(null), 'Session');
  assertEquals(deriveWorkoutTitle(undefined), 'Session');
});

Deno.test('empty workout object returns "Session"', () => {
  assertEquals(deriveWorkoutTitle({}), 'Session');
});

Deno.test('workout with only name (no type) returns the name unchanged', () => {
  assertEquals(deriveWorkoutTitle({ name: 'Custom Workout' }), 'Custom Workout');
});

// ── Anti-regression: the divergence cases the bug filed ────────────────────

Deno.test('divergence closure: drawer-title surface and chip surface now agree on interval name', () => {
  // Drawer surface previously used workout.name → "Run Intervals — 6×1000m".
  // Chip surface previously used regex-derived → "Run — Intervals".
  // Post-fix both call deriveWorkoutTitle and get the same value.
  const w = { type: 'run', name: 'Run Intervals — 6×1000m', description: 'WU 10min, 6×1000m at 10K pace' };
  assertEquals(deriveWorkoutTitle(w), 'Run Intervals — 6×1000m');
});

Deno.test('divergence closure: tempo run drawer + chip agree', () => {
  const w = { type: 'run', name: 'Tempo Run — 5 mi at threshold', description: 'WU 1.5mi, 5mi at threshold, CD 1mi' };
  assertEquals(deriveWorkoutTitle(w), 'Tempo Run — 5 mi at threshold');
});
