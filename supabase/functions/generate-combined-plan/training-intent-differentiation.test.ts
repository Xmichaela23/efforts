/**
 * D-061 / Item 1 — `training_intent` produces materially-different plans.
 *
 * Per WIZARD-AUDIT.md G4 + the 2026-05-26 audit: the wizard offered three
 * options (performance / completion / first_race) but the engine only
 * differentiated on `performance` vs not-performance. `completion` and
 * `first_race` produced identical combined-plan output. D-061 closes the
 * differentiation gap on three axes:
 *
 *   recovery cadence (loading pattern):
 *     performance  → '3:1' (every 4th week)
 *     completion   → '2:1' (every 3rd week)
 *     first_race   → '1:1' (every 2nd week)
 *
 *   base-phase interval reps (run quality):
 *     performance / completion → standard ramp (4→8 reps across base)
 *     first_race / comeback    → 80% cap (max 6 reps)
 *
 *   build-phase VO2 gating (race_peak path):
 *     performance               → full VO2 ramp
 *     completion                → no VO2 (downgrade to tempo)
 *     first_race / comeback     → no VO2 until weekInPhase ≥ 4
 *
 * Run from repo root:
 *   deno test supabase/functions/generate-combined-plan/training-intent-differentiation.test.ts --no-check --allow-read
 */

import { assert, assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { applyLoadingPattern, loadingPatternForIntent } from './phase-structure.ts';
import { blockWeekMultiplier } from './science.ts';
import type { PhaseBlock } from './types.ts';

// ── loadingPatternForIntent ─────────────────────────────────────────────────

Deno.test('D-061: performance keeps athlete pattern (default 3:1)', () => {
  assertEquals(loadingPatternForIntent('performance', null), '3:1');
  assertEquals(loadingPatternForIntent('performance', '3:1'), '3:1');
  assertEquals(loadingPatternForIntent('performance', '2:1'), '2:1');
});

Deno.test('D-061: completion forces 2:1 (every 3rd week recovery)', () => {
  assertEquals(loadingPatternForIntent('completion', null), '2:1');
  assertEquals(loadingPatternForIntent('completion', '3:1'), '2:1');
  assertEquals(loadingPatternForIntent('completion', '2:1'), '2:1');
});

Deno.test('D-061: first_race forces 1:1 (every 2nd week recovery)', () => {
  assertEquals(loadingPatternForIntent('first_race', null), '1:1');
  assertEquals(loadingPatternForIntent('first_race', '3:1'), '1:1');
  assertEquals(loadingPatternForIntent('first_race', '2:1'), '1:1');
});

Deno.test('D-061: comeback also forces 1:1 (conservative ramp)', () => {
  assertEquals(loadingPatternForIntent('comeback', null), '1:1');
});

Deno.test('D-061: case-insensitive + unknown intent falls back to athlete pattern', () => {
  assertEquals(loadingPatternForIntent('PERFORMANCE', null), '3:1');
  assertEquals(loadingPatternForIntent('Completion', null), '2:1');
  assertEquals(loadingPatternForIntent(null, '2:1'), '2:1');
  assertEquals(loadingPatternForIntent(undefined, null), '3:1');
  assertEquals(loadingPatternForIntent('garbage_value', '2:1'), '2:1');
});

// ── blockWeekMultiplier '1:1' support ───────────────────────────────────────

Deno.test('D-061: blockWeekMultiplier(1, "1:1") = 1.00 (build week)', () => {
  assertEquals(blockWeekMultiplier(1, '1:1'), 1.00);
});

Deno.test('D-061: blockWeekMultiplier(2, "1:1") = 0.65 (recovery week)', () => {
  assertEquals(blockWeekMultiplier(2, '1:1'), 0.65);
});

Deno.test('D-061: existing 3:1 / 2:1 multipliers unchanged (no regression)', () => {
  assertEquals(blockWeekMultiplier(1, '3:1'), 1.00);
  assertEquals(blockWeekMultiplier(4, '3:1'), 0.65);
  assertEquals(blockWeekMultiplier(1, '2:1'), 1.00);
  assertEquals(blockWeekMultiplier(3, '2:1'), 0.65);
});

// ── applyLoadingPattern recovery-week counts in a 12-week build ────────────

function fakeBuildBlocks(weeks: number): PhaseBlock[] {
  // 12 consecutive 1-week 'build' blocks (ADR-0002 one-row-per-week shape).
  return Array.from({ length: weeks }, (_, i) => ({
    phase: 'build' as const,
    startWeek: i + 1,
    endWeek: i + 1,
    primaryGoalId: 'g1',
    isRecovery: false,
    tssMultiplier: 1.0,
    sportDistribution: { run: 0.4, bike: 0.3, swim: 0.2, strength: 0.1 },
  }));
}

function countRecoveryWeeks(blocks: PhaseBlock[]): number {
  return blocks.filter((b) => b.isRecovery).length;
}

Deno.test('D-061: 12-week build under 3:1 (performance) → 3 recovery weeks (W4, W8, W12)', () => {
  const out = applyLoadingPattern(fakeBuildBlocks(12), '3:1');
  assertEquals(countRecoveryWeeks(out), 3);
  // Block size 4: recovery on weeks 4, 8, 12 (1-indexed positions inside block).
  assertEquals(out[3]!.isRecovery, true);
  assertEquals(out[7]!.isRecovery, true);
  assertEquals(out[11]!.isRecovery, true);
});

Deno.test('D-061: 12-week build under 2:1 (completion) → 4 recovery weeks (W3, W6, W9, W12)', () => {
  const out = applyLoadingPattern(fakeBuildBlocks(12), '2:1');
  assertEquals(countRecoveryWeeks(out), 4);
  assertEquals(out[2]!.isRecovery, true);
  assertEquals(out[5]!.isRecovery, true);
  assertEquals(out[8]!.isRecovery, true);
  assertEquals(out[11]!.isRecovery, true);
});

Deno.test('D-061: 12-week build under 1:1 (first_race) → 6 recovery weeks (every 2nd)', () => {
  const out = applyLoadingPattern(fakeBuildBlocks(12), '1:1');
  assertEquals(countRecoveryWeeks(out), 6);
  // Block size 2: recovery on weeks 2, 4, 6, 8, 10, 12.
  for (const wi of [1, 3, 5, 7, 9, 11]) {
    assertEquals(out[wi]!.isRecovery, true, `week ${wi + 1} should be recovery under 1:1`);
  }
});

Deno.test('D-061: 3-way differentiation — performance / completion / first_race produce distinct recovery counts', () => {
  const blocks = fakeBuildBlocks(12);
  const perf = countRecoveryWeeks(applyLoadingPattern(blocks, '3:1'));
  const comp = countRecoveryWeeks(applyLoadingPattern(blocks, '2:1'));
  const first = countRecoveryWeeks(applyLoadingPattern(blocks, '1:1'));
  assert(perf < comp, `performance ${perf} should have fewer recovery weeks than completion ${comp}`);
  assert(comp < first, `completion ${comp} should have fewer recovery weeks than first_race ${first}`);
  // Exact values lock the contract.
  assertEquals(perf, 3);
  assertEquals(comp, 4);
  assertEquals(first, 6);
});

Deno.test('D-061: taper / recovery / rebuild blocks bypass the loading-pattern overlay', () => {
  const blocks: PhaseBlock[] = [
    ...fakeBuildBlocks(4),
    {
      phase: 'taper' as const,
      startWeek: 5,
      endWeek: 5,
      primaryGoalId: 'g1',
      isRecovery: false,
      tssMultiplier: 1.0,
      sportDistribution: { run: 0.4, bike: 0.3, swim: 0.2, strength: 0.1 },
    },
    {
      phase: 'recovery' as const,
      startWeek: 6,
      endWeek: 6,
      primaryGoalId: 'g1',
      isRecovery: true,
      tssMultiplier: 0.5,
      sportDistribution: { run: 0.4, bike: 0.3, swim: 0.2, strength: 0.1 },
    },
  ];
  const out = applyLoadingPattern(blocks, '1:1');
  // First 4 are build blocks under 1:1: weeks 2 + 4 are recovery (block-size 2).
  assertEquals(out[1]!.isRecovery, true);
  assertEquals(out[3]!.isRecovery, true);
  // Taper + recovery blocks pass through unchanged (the overlay no-ops them).
  assertEquals(out[4]!.phase, 'taper');
  assertEquals(out[4]!.isRecovery, false);
  assertEquals(out[5]!.phase, 'recovery');
  assertEquals(out[5]!.isRecovery, true);
});
