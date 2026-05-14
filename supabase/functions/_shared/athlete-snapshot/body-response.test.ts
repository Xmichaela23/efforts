/**
 * Tests for fatigue-weight helpers in body-response.ts.
 *
 * Run from repo root:
 *   deno test supabase/functions/_shared/athlete-snapshot/body-response.test.ts --no-check --allow-read
 *
 * Initial coverage focused on `getCyclingFatigueWeight` (Tier 4 item 11 of
 * running→cycling delta map). Anchors `getRunningFatigueWeight` with a
 * regression-pin so the parallel sport-fatigue weighting model stays consistent
 * as either function evolves.
 */
import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { getCyclingFatigueWeight, getRunningFatigueWeight } from './body-response.ts';

// ── §1 getCyclingFatigueWeight — direct cycling load ──────────────────────

Deno.test('getCyclingFatigueWeight: ride is 1.0 (direct cycling load)', () => {
  assertEquals(getCyclingFatigueWeight({ type: 'ride' }), 1.0);
  assertEquals(getCyclingFatigueWeight({ type: 'cycling' }), 1.0, 'normalizes synonyms');
  assertEquals(getCyclingFatigueWeight({ type: 'bike' }), 1.0);
});

// ── §2 cross-discipline fatigue carryover ─────────────────────────────────

Deno.test('getCyclingFatigueWeight: run is 0.4 (eccentric leg loading carries over)', () => {
  assertEquals(getCyclingFatigueWeight({ type: 'run' }), 0.4);
  assertEquals(getCyclingFatigueWeight({ type: 'running' }), 0.4);
});

Deno.test('getCyclingFatigueWeight: swim is 0.1 (low cycling carryover)', () => {
  assertEquals(getCyclingFatigueWeight({ type: 'swim' }), 0.1);
});

Deno.test('getCyclingFatigueWeight: mobility is 0 (net-positive recovery)', () => {
  assertEquals(getCyclingFatigueWeight({ type: 'mobility' }), 0);
});

Deno.test('getCyclingFatigueWeight: unknown / other types fall through to 0.3', () => {
  assertEquals(getCyclingFatigueWeight({ type: 'walk' }), 0.3);
  assertEquals(getCyclingFatigueWeight({ type: '' }), 0.3);
  assertEquals(getCyclingFatigueWeight({ type: 'rollerblading' }), 0.3);
});

// ── §3 strength sub-classification by name ────────────────────────────────

Deno.test('getCyclingFatigueWeight: lower-body strength is 0.7 (same prime movers as cycling)', () => {
  assertEquals(getCyclingFatigueWeight({ type: 'strength', name: 'Lower body strength' }), 0.7);
  assertEquals(getCyclingFatigueWeight({ type: 'strength', name: 'lower-body lift' }), 0.7);
  assertEquals(getCyclingFatigueWeight({ type: 'strength', name: 'Leg day' }), 0.7);
});

Deno.test('getCyclingFatigueWeight: upper-body strength is 0.2 (minimal cycling carryover)', () => {
  assertEquals(getCyclingFatigueWeight({ type: 'strength', name: 'Upper body strength' }), 0.2);
  assertEquals(getCyclingFatigueWeight({ type: 'strength', name: 'upper-body lift' }), 0.2);
});

Deno.test('getCyclingFatigueWeight: full-body strength is 0.5', () => {
  assertEquals(getCyclingFatigueWeight({ type: 'strength', name: 'Full body strength' }), 0.5);
  assertEquals(getCyclingFatigueWeight({ type: 'strength', name: 'full-body circuit' }), 0.5);
});

Deno.test('getCyclingFatigueWeight: unspecified strength defaults to 0.5', () => {
  assertEquals(getCyclingFatigueWeight({ type: 'strength' }), 0.5);
  assertEquals(getCyclingFatigueWeight({ type: 'strength', name: 'Strength' }), 0.5);
});

// ── §4 asymmetry vs running fatigue weighting (regression-pin both) ───────

Deno.test('cycling vs running fatigue weights — asymmetric per design', () => {
  // For an upper-body strength session: low cycling carryover (arms don't pedal),
  // moderate running carryover (running is also legs-driven but upper body is along
  // for the ride). Both are designed to discount upper-body strength.
  assertEquals(getCyclingFatigueWeight({ type: 'strength', name: 'Upper body' }), 0.2);
  assertEquals(getRunningFatigueWeight({ type: 'strength', name: 'Upper body' }), 0.3);

  // Lower-body strength weighting: identical 0.7 in both directions because
  // quad/glute/ham loading carries over heavily to either sport.
  assertEquals(getCyclingFatigueWeight({ type: 'strength', name: 'Lower body' }), 0.7);
  assertEquals(getRunningFatigueWeight({ type: 'strength', name: 'Lower body' }), 0.7);

  // Cross-discipline cycling↔running carryover is asymmetric:
  // - run contributes 0.4 to cycling fatigue
  // - ride contributes 0.6 to running fatigue (running's weight for ride)
  // Reflects that cycling's high-cadence concentric work is more "drainable" toward
  // subsequent running than running's eccentric load is toward cycling.
  assertEquals(getCyclingFatigueWeight({ type: 'run' }), 0.4);
  assertEquals(getRunningFatigueWeight({ type: 'ride' }), 0.6);

  // Swim and mobility: nearly-symmetric (both sports treat them as low-load).
  assertEquals(getCyclingFatigueWeight({ type: 'swim' }), 0.1);
  assertEquals(getRunningFatigueWeight({ type: 'swim' }), 0.2);
  assertEquals(getCyclingFatigueWeight({ type: 'mobility' }), 0);
  assertEquals(getRunningFatigueWeight({ type: 'mobility' }), 0);
});
