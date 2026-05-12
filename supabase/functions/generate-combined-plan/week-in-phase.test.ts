/**
 * P-002 regression test (docs/STRENGTH-PROTOCOL.md §3.8): `weekInPhaseForTimeline` must
 * preserve the count across mid-phase recovery weeks. Pre-fix behavior reset to 1 at the
 * first active week after a recovery, which caused Hypertrophy W5 to read as W1 and emit
 * 65% instead of clamping to 72%.
 *
 * Run from repo root:
 *   deno test --no-lock --allow-all supabase/functions/generate-combined-plan/week-in-phase.test.ts
 */

import { assert, assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { weekInPhaseForTimeline } from './week-builder.ts';
import type { PhaseBlock, Sport } from './types.ts';

function block(opts: Partial<PhaseBlock> & { startWeek: number; isRecovery?: boolean }): PhaseBlock {
  return {
    phase: opts.phase ?? 'base',
    startWeek: opts.startWeek,
    endWeek: opts.startWeek,
    primaryGoalId: opts.primaryGoalId ?? 'g1',
    isRecovery: opts.isRecovery ?? false,
    tssMultiplier: opts.tssMultiplier ?? 1.0,
    sportDistribution: opts.sportDistribution ?? { run: 0.3, bike: 0.5, swim: 0.2 } as Partial<Record<Sport, number>>,
  };
}

Deno.test('P-002: contiguous active weeks count up correctly', () => {
  const timeline: PhaseBlock[] = [
    block({ startWeek: 1 }),
    block({ startWeek: 2 }),
    block({ startWeek: 3 }),
    block({ startWeek: 4 }),
  ];
  for (let w = 1; w <= 4; w++) {
    assertEquals(weekInPhaseForTimeline(timeline, w, timeline[w - 1]), w, `week ${w} should return ${w}`);
  }
});

Deno.test('P-002: recovery week in the middle does NOT reset the count (pre-fix bug)', () => {
  // Plan 54 shape: base W1-W3 active, W4 recovery, W5 active. Pre-fix: W5 reset to 1.
  const timeline: PhaseBlock[] = [
    block({ startWeek: 1 }),
    block({ startWeek: 2 }),
    block({ startWeek: 3 }),
    block({ startWeek: 4, isRecovery: true }),
    block({ startWeek: 5 }),
  ];
  assertEquals(
    weekInPhaseForTimeline(timeline, 5, timeline[4]),
    5,
    'W5 should be the 5th week of base, not reset to 1 after recovery',
  );
});

Deno.test('P-002: phase change DOES reset the count', () => {
  // Base W1-W3, then build W4. W4 should be W1 of build.
  const timeline: PhaseBlock[] = [
    block({ startWeek: 1 }),
    block({ startWeek: 2 }),
    block({ startWeek: 3 }),
    block({ startWeek: 4, phase: 'build' }),
  ];
  assertEquals(weekInPhaseForTimeline(timeline, 4, timeline[3]), 1, 'phase boundary resets count');
});

Deno.test('P-002: different goal DOES reset the count', () => {
  const timeline: PhaseBlock[] = [
    block({ startWeek: 1, primaryGoalId: 'g1' }),
    block({ startWeek: 2, primaryGoalId: 'g1' }),
    block({ startWeek: 3, primaryGoalId: 'g2' }),
  ];
  assertEquals(weekInPhaseForTimeline(timeline, 3, timeline[2]), 1, 'goal boundary resets count');
});

Deno.test('P-002: multiple recovery weeks in a phase preserve count past each one', () => {
  // Edge case: long phase with two recovery weeks (e.g., 4+1+3+1 shape).
  const timeline: PhaseBlock[] = [
    block({ startWeek: 1 }),
    block({ startWeek: 2 }),
    block({ startWeek: 3 }),
    block({ startWeek: 4, isRecovery: true }),
    block({ startWeek: 5 }),
    block({ startWeek: 6 }),
    block({ startWeek: 7 }),
    block({ startWeek: 8, isRecovery: true }),
    block({ startWeek: 9 }),
  ];
  assertEquals(weekInPhaseForTimeline(timeline, 9, timeline[8]), 9, 'W9 should be 9th week of base, not reset across two recoveries');
});
