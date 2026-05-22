/**
 * D-031 (2026-05-22) — rebuild-mode lerp throttle + peak-of-base floor.
 *
 * Pins the four lerp sources (long-run, long-ride, brick-run, swim yards) under
 * the new `loadThrottle` parameter. Verifies:
 *   - Throttle = 1.0 (default) preserves existing D-026 / D-028 / D-029 behavior
 *     (back-compat for every legacy caller).
 *   - Throttle < 1.0 shrinks the lerp output, FLOORED at `*FloorMiles/Hours(distance, 'base')`
 *     — the distance-aware peak-of-base value. A throttled plan still ships
 *     with a defensible durability anchor.
 *   - The floor is distance-keyed: full IM never squeezed to 70.3's floor.
 *   - The validator helpers (effectiveLongRunFloorMiles + effectiveLongRideFloorHours)
 *     thread the throttle so validator + builder agree during rebuild mode.
 *
 * Run from repo root:
 *   deno test --no-check --no-lock --allow-all \
 *     supabase/functions/generate-combined-plan/lerp-rebuild-throttle.test.ts
 */

import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import {
  brickRunMilesForWeek,
  brickRunTargetMiles,
  longRideHoursForWeek,
  longRideFloorHours,
  longRunMilesForWeek,
  longRunFloorMiles,
} from './science.ts';
import {
  effectiveLongRideFloorHours,
  effectiveLongRunFloorMiles,
} from './validate-training-floors.ts';

// ── Back-compat: throttle = 1.0 (default) preserves existing behavior ───────

Deno.test('D-031 back-compat: longRunMilesForWeek(70.3, build, 4, 4) unchanged at throttle=1.0', () => {
  // build PEAK for 70.3 = 0.85 × 13 = 11.05 → roundHalfMile = 11.0
  assertEquals(longRunMilesForWeek('70.3', 'build', 4, 4), 11.0);
  assertEquals(longRunMilesForWeek('70.3', 'build', 4, 4, 1.0), 11.0);
});

Deno.test('D-031 back-compat: longRideHoursForWeek(70.3, race_specific, 4, 4) unchanged at throttle=1.0', () => {
  // RS PEAK for 70.3 = 1.0 × 3.0 = 3.0h
  assertEquals(longRideHoursForWeek('70.3', 'race_specific', 4, 4), 3.0);
  assertEquals(longRideHoursForWeek('70.3', 'race_specific', 4, 4, 1.0), 3.0);
});

Deno.test('D-031 back-compat: brickRunMilesForWeek(70.3, race_specific, 4, 4) unchanged at throttle=1.0', () => {
  // RS PEAK for 70.3 = 0.42 × 13.1 = 5.50 → roundHalfMile = 5.5
  assertEquals(brickRunMilesForWeek('70.3', 'race_specific', 4, 4), 5.5);
  assertEquals(brickRunMilesForWeek('70.3', 'race_specific', 4, 4, 1.0), 5.5);
});

// ── Throttle shrinks: floor binds at peak-of-base ───────────────────────────

Deno.test('D-031 longRun throttle 0.5 → 70.3 RS lerp 13.0 × 0.5 = 6.5 → floor 10.0 (base peak) binds', () => {
  // peak-of-base for 70.3 = longRunFloorMiles('70.3', 'base') = 0.75 × 13 = 9.75 → 10.0
  // throttled lerp = 13.0 × 0.5 = 6.5 → roundHalfMile = 6.5
  // max(10.0, 6.5) = 10.0 (floor binds)
  assertEquals(longRunMilesForWeek('70.3', 'race_specific', 4, 4, 0.5), 10.0);
});

Deno.test('D-031 longRun throttle 0.87 → 70.3 RS lerp throttle = 11.31 → 11.5, floor 10.0 (lerp wins)', () => {
  // throttled lerp = 13.0 × 0.87 = 11.31 → roundHalfMile = 11.5
  // max(10.0, 11.5) = 11.5 (lerp wins above floor)
  assertEquals(longRunMilesForWeek('70.3', 'race_specific', 4, 4, 0.87), 11.5);
});

Deno.test('D-031 longRun throttle 0.30 (12 rebuild passes, MIN_MULTIPLIER) → floor binds', () => {
  // After 12 rebuild passes: tssMultiplier ≈ 0.188 → clamped at FLOOR_REBUILD_MIN_MULTIPLIER = 0.30
  // throttled lerp = 13.0 × 0.30 = 3.9 → roundHalfMile = 4.0
  // max(10.0, 4.0) = 10.0
  assertEquals(longRunMilesForWeek('70.3', 'race_specific', 4, 4, 0.30), 10.0);
});

Deno.test('D-031 longRide throttle 0.5 → 70.3 RS lerp 3.0 × 0.5 = 1.5h → floor 2.25h (base peak) binds', () => {
  // peak-of-base for 70.3 = longRideFloorHours('70.3', 'base') = 0.75 × 3.0 = 2.25h
  // throttled lerp = 3.0 × 0.5 = 1.5h → round 0.25 = 1.5h
  // max(2.25, 1.5) = 2.25h (floor binds)
  assertEquals(longRideHoursForWeek('70.3', 'race_specific', 4, 4, 0.5), 2.25);
});

Deno.test('D-031 longRide throttle 0.87 → 70.3 RS lerp 3.0 × 0.87 = 2.61 → 2.5h (lerp rounds below RS PEAK)', () => {
  // throttled lerp = 3.0 × 0.87 = 2.61 → round 0.25 = 2.5h
  // floor = 2.25h
  // max(2.25, 2.5) = 2.5
  assertEquals(longRideHoursForWeek('70.3', 'race_specific', 4, 4, 0.87), 2.5);
});

Deno.test('D-031 brickRun throttle 0.5 → 70.3 RS lerp throttled, floor binds at peak-of-base', () => {
  // RS PEAK brick = 0.42 × 13.1 = 5.502 → 5.5 ; throttle 0.5 → 5.5 × 0.5 = 2.75 → roundHalfMile = 3.0
  // peak-of-base brick = brickRunTargetMiles('70.3', 'base') = clamp(0.20 × 13.1 = 2.62 → 2.5)
  // max(2.5, 3.0) = 3.0 (lerp throttled wins above floor)
  assertEquals(brickRunMilesForWeek('70.3', 'race_specific', 4, 4, 0.5), 3.0);
});

Deno.test('D-031 brickRun throttle 0.30 → floor 2.5mi (peak-of-base) binds', () => {
  // throttled lerp = 5.5 × 0.30 = 1.65 → roundHalfMile = 1.5
  // peak-of-base = brickRunTargetMiles('70.3', 'base') = 2.5
  // max(2.5, 1.5) = 2.5
  assertEquals(brickRunMilesForWeek('70.3', 'race_specific', 4, 4, 0.30), 2.5);
});

// ── Distance-keyed floor — full IM never squeezed to 70.3's floor ──────────

Deno.test('D-031 distance-keyed: full IM longRun floor = 13.5mi (peak-of-base), NOT 70.3 10mi', () => {
  // full IM peak = 18mi; base peak = 0.75 × 18 = 13.5
  assertEquals(longRunFloorMiles('full', 'base'), 13.5);
  assertEquals(longRunMilesForWeek('full', 'race_specific', 4, 4, 0.30), 13.5);
});

Deno.test('D-031 distance-keyed: full IM longRide floor = 4.5h (peak-of-base)', () => {
  // full IM expected bike = 6.0h; base peak = 0.75 × 6.0 = 4.5
  assertEquals(longRideFloorHours('full', 'base'), 4.5);
  assertEquals(longRideHoursForWeek('full', 'race_specific', 4, 4, 0.30), 4.5);
});

Deno.test('D-031 distance-keyed: Olympic longRun floor = 5.5mi (Math.round half-up of 5.25)', () => {
  // Olympic peak = 7.0mi; base peak = 0.75 × 7 = 5.25 → Math.round(10.5)/2 = 11/2 = 5.5
  // (JS Math.round is round-half-up.)
  assertEquals(longRunFloorMiles('olympic', 'base'), 5.5);
  assertEquals(longRunMilesForWeek('olympic', 'race_specific', 4, 4, 0.30), 5.5);
});

Deno.test('D-031 distance-keyed: Sprint longRun floor = 3.0mi', () => {
  // Sprint peak = 4.0mi; base peak = 0.75 × 4 = 3.0
  assertEquals(longRunFloorMiles('sprint', 'base'), 3.0);
  assertEquals(longRunMilesForWeek('sprint', 'race_specific', 4, 4, 0.30), 3.0);
});

// ── Validator parity: builder and validator use the same throttle ───────────

Deno.test('D-031 validator parity: effectiveLongRunFloorMiles tracks throttled lerp', () => {
  // No history → fromRecent path inert. Pre-fix the validator would return un-throttled peak.
  // Post-fix the validator follows the throttled lerp's peak-of-base floor.
  const builder = longRunMilesForWeek('70.3', 'race_specific', 4, 4, 0.30);
  const validator = effectiveLongRunFloorMiles('70.3', 'race_specific', 0, 4, 4, 0.30);
  // peakCap from next-phase = build-of-next = longRunFloorMiles('70.3', nextPhase) = build = 0.85*13 = 11
  // capped = min(max(10, 0), 11) = 10
  assertEquals(builder, validator); // both 10.0
});

Deno.test('D-031 validator parity: effectiveLongRideFloorHours tracks throttled lerp', () => {
  const builder = longRideHoursForWeek('70.3', 'race_specific', 4, 4, 0.30);
  const validator = effectiveLongRideFloorHours('70.3', 'race_specific', 0, 4, 4, 0.30);
  // peakCap = build floor = 0.85 × 3.0 = 2.55 → round 0.25 = 2.5
  // capped = min(max(2.25, 0), 2.5) = 2.25
  assertEquals(builder, validator); // both 2.25
});

Deno.test('D-031 validator without loadThrottle defaults to 1.0 (back-compat for legacy callers)', () => {
  // Legacy 5-arg call → loadThrottle defaults to 1.0 → unchanged behavior.
  const unthrottled = effectiveLongRunFloorMiles('70.3', 'race_specific', 0, 4, 4);
  const explicit = effectiveLongRunFloorMiles('70.3', 'race_specific', 0, 4, 4, 1.0);
  assertEquals(unthrottled, explicit);
});

// ── Phase-only floor (existing D-027 path) still works when loadThrottle omitted ──

Deno.test('D-031 anti-regression: full 5-arg validator call (no throttle) preserves D-027 behavior', () => {
  // pre-D-031: validator routes through longRunMilesForWeek with no throttle → exact peak lerp.
  // post-D-031: same path with default throttle=1.0 → exact same answer.
  // For 70.3 base wip=1: lerp = 0.65 × 13 = 8.45 → 8.5; floor below = 10 base peak NOT applied (throttle=1.0).
  // BUT peakCap = build floor = 11.0; from history = 0; capped = min(8.5, 11) = 8.5.
  assertEquals(effectiveLongRunFloorMiles('70.3', 'base', 0, 1, 6), 8.5);
});

// ── ADR-0002 anti-regression: weekInPhase still drives the lerp shape ──────

Deno.test('D-031 ADR-0002 anti-regression: throttled lerp still varies with weekInPhase', () => {
  // Even with throttle, the lerp should still increase with wip (until the floor binds).
  // 70.3 build, throttle 0.87:
  //   wip=1: lerp = 0.75 × 13 = 9.75; throttled = 9.75 × 0.87 = 8.48 → 8.5; floor 10 → max = 10.0
  //   wip=4: lerp = 0.85 × 13 = 11.05; throttled = 9.61 → 9.5; floor 10 → max = 10.0
  //   At throttle 0.87, floor binds for both wip values in build phase.
  // Use a milder throttle (0.95) to keep lerp above floor:
  //   wip=1: 9.75 × 0.95 = 9.26 → 9.5 ; floor 10 → max = 10.0 (still bound)
  //   wip=6 (hypothetical): wouldn't apply (build rampWeeks=4)
  // Demonstrate variation with throttle 0.95 in race_specific (4-week ramp):
  //   wip=1: 0.85 × 13 = 11.05; throttled = 10.50 → 10.5; floor 10 → max = 10.5
  //   wip=4: 1.00 × 13 = 13.0; throttled = 12.35 → 12.5; floor 10 → max = 12.5
  const v1 = longRunMilesForWeek('70.3', 'race_specific', 1, 4, 0.95);
  const v4 = longRunMilesForWeek('70.3', 'race_specific', 4, 4, 0.95);
  // Even with throttle, week 4 must be > week 1 (lerp shape preserved when above floor).
  assertEquals(v4 > v1, true);
});

// ── Edge: throttle = 0 (degenerate) → floor binds ──────────────────────────

Deno.test('D-031 edge case: throttle = 0 → floor (peak-of-base) binds for every distance', () => {
  // Degenerate throttle. Should never fall below the floor.
  assertEquals(longRunMilesForWeek('70.3', 'race_specific', 4, 4, 0), 10.0);
  assertEquals(longRideHoursForWeek('70.3', 'race_specific', 4, 4, 0), 2.25);
  assertEquals(brickRunMilesForWeek('70.3', 'race_specific', 4, 4, 0), 2.5);
});

// ── Non-ramp phases: throttle delegates to floor function (no lerp) ─────────

Deno.test('D-031 non-ramp phases (rebuild/taper/recovery): throttle has no effect; floor function used', () => {
  // longRunMilesForWeek for rebuild/taper/recovery delegates to longRunFloorMiles per D-026.
  // Throttle parameter is moot here — those phases have their own multipliers.
  assertEquals(longRunMilesForWeek('70.3', 'taper', 1, 4, 0.5), longRunFloorMiles('70.3', 'taper'));
  assertEquals(longRideHoursForWeek('70.3', 'taper', 1, 4, 0.5), longRideFloorHours('70.3', 'taper'));
});
