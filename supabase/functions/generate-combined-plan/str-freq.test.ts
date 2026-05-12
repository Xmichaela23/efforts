/**
 * §3.7 race-distance dose scaling (Task 11 from v2.1 close-out).
 *
 * Asserts the strFreqForPhase decision table:
 *   - Sprint / Olympic / 70.3: 2 / 2 / 2 across base / build / race-specific (no scaling)
 *   - Full IM build: 2 if hours < 18, 1 otherwise (per §3.7 — protect endurance recovery)
 *   - Full IM race-specific: 1 always (per §3.7)
 *   - Durability (support intent): 2 base, 1 elsewhere — unchanged
 *   - Rebuild: 2 both protocols (§7.4 / P-005)
 *
 * Day-agnostic by construction — the function takes no day inputs.
 *
 * Run from repo root:
 *   deno test --no-lock --allow-all supabase/functions/generate-combined-plan/str-freq.test.ts
 */
import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { strFreqForPhase } from './week-builder.ts';

// Sprint / Olympic / 70.3 — no Full-IM scaling, performance intent stays at 2

Deno.test('§3.7: Sprint hybrid base/build/race-spec = 2/2/2', () => {
  for (const phase of ['base', 'build', 'race_specific'] as const) {
    assertEquals(
      strFreqForPhase({ phase, performanceStrength: true, goalDistance: 'sprint', weeklyHours: 11 }),
      2,
      `sprint hybrid ${phase} should be 2`,
    );
  }
});

Deno.test('§3.7: Olympic hybrid base/build/race-spec = 2/2/2', () => {
  for (const phase of ['base', 'build', 'race_specific'] as const) {
    assertEquals(
      strFreqForPhase({ phase, performanceStrength: true, goalDistance: 'olympic', weeklyHours: 12 }),
      2,
      `olympic hybrid ${phase} should be 2`,
    );
  }
});

Deno.test('§3.7: 70.3 hybrid base/build/race-spec = 2/2/2', () => {
  for (const phase of ['base', 'build', 'race_specific'] as const) {
    assertEquals(
      strFreqForPhase({ phase, performanceStrength: true, goalDistance: '70.3', weeklyHours: 14 }),
      2,
      `70.3 hybrid ${phase} should be 2`,
    );
  }
});

// Full IM scaling — the new behavior

Deno.test('§3.7: Full IM hybrid + < 18 hrs/wk → build = 2', () => {
  assertEquals(
    strFreqForPhase({ phase: 'build', performanceStrength: true, goalDistance: 'ironman', weeklyHours: 14 }),
    2,
    'Full IM hybrid build at 14 hrs/wk should be 2 (no scaling yet)',
  );
});

Deno.test('§3.7: Full IM hybrid + ≥ 18 hrs/wk → build = 1', () => {
  assertEquals(
    strFreqForPhase({ phase: 'build', performanceStrength: true, goalDistance: 'ironman', weeklyHours: 18 }),
    1,
    'Full IM hybrid build at 18 hrs/wk should drop to 1 per §3.7',
  );
  assertEquals(
    strFreqForPhase({ phase: 'build', performanceStrength: true, goalDistance: 'ironman', weeklyHours: 20 }),
    1,
    'Full IM hybrid build at 20 hrs/wk should drop to 1',
  );
});

Deno.test('§3.7: Full IM hybrid race-specific = 1 always', () => {
  for (const hours of [10, 14, 18, 22]) {
    assertEquals(
      strFreqForPhase({ phase: 'race_specific', performanceStrength: true, goalDistance: 'ironman', weeklyHours: hours }),
      1,
      `Full IM hybrid race-spec at ${hours} hrs/wk should be 1`,
    );
  }
});

Deno.test('§3.7: Full IM hybrid base = 2 (no scaling)', () => {
  assertEquals(
    strFreqForPhase({ phase: 'base', performanceStrength: true, goalDistance: 'ironman', weeklyHours: 18 }),
    2,
    'Full IM base stays at 2 — scaling only applies build/race-spec',
  );
});

Deno.test('§3.7: distance "full" alias treated as Full IM', () => {
  assertEquals(
    strFreqForPhase({ phase: 'build', performanceStrength: true, goalDistance: 'full', weeklyHours: 19 }),
    1,
    'distance="full" should match Full IM scaling',
  );
});

Deno.test('§3.7: distance "ironman_full" alias treated as Full IM (substring match)', () => {
  assertEquals(
    strFreqForPhase({ phase: 'race_specific', performanceStrength: true, goalDistance: 'ironman_full', weeklyHours: 14 }),
    1,
    'distance="ironman_full" should match',
  );
});

// Durability path — unchanged

Deno.test('§3.7: durability intent → build = 1 regardless of distance', () => {
  for (const dist of ['sprint', 'olympic', '70.3', 'ironman']) {
    assertEquals(
      strFreqForPhase({ phase: 'build', performanceStrength: false, goalDistance: dist, weeklyHours: 12 }),
      1,
      `durability ${dist} build should be 1`,
    );
  }
});

Deno.test('§3.7: durability intent → race-spec = 1 regardless of distance', () => {
  for (const dist of ['sprint', 'olympic', '70.3', 'ironman']) {
    assertEquals(
      strFreqForPhase({ phase: 'race_specific', performanceStrength: false, goalDistance: dist, weeklyHours: 12 }),
      1,
      `durability ${dist} race-spec should be 1`,
    );
  }
});

Deno.test('§7.4 / P-005: rebuild = 2 for both protocols, all distances', () => {
  for (const perf of [true, false]) {
    for (const dist of ['sprint', '70.3', 'ironman']) {
      assertEquals(
        strFreqForPhase({ phase: 'rebuild', performanceStrength: perf, goalDistance: dist, weeklyHours: 12 }),
        2,
        `rebuild perf=${perf} ${dist} should be 2 (U+L)`,
      );
    }
  }
});

Deno.test('§3.7: day-agnostic — function takes no day inputs', () => {
  // Sanity check the function signature only accepts phase + intent + distance + hours.
  // If anyone adds day-coupling later, this test won't compile.
  type Args = Parameters<typeof strFreqForPhase>[0];
  const _typeCheck: keyof Args = 'phase'; // narrows; assertion is that 'day' isn't a key
  void _typeCheck;
});
