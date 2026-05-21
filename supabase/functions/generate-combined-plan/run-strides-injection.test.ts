/**
 * RUN-PROTOCOL §5.8 — strides as a first-class easy-run modifier (Phase 2).
 *
 * Locks the injection gate at the realized-sessions level:
 *   - Performance-intent tri build / race-spec / late base → strides fire on
 *     the mid-week easy run.
 *   - Race week (phase=taper + raceThisWeek) → NO strides (§5.8 over §9.1).
 *   - Recovery / rebuild week → NO strides.
 *   - Non-performance intent (completion / first_race / comeback) → NO strides.
 *
 * Mirrors the run-volume-ramp.test.ts pattern (drive buildWeek end-to-end and
 * assert on the realized weekly grid).
 *
 * Run from repo root:
 *   deno test --no-check --no-lock --allow-all \
 *     supabase/functions/generate-combined-plan/run-strides-injection.test.ts
 */

import { assert } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { buildPhaseTimeline, blockForWeek } from './phase-structure.ts';
import { buildWeek, weekInPhaseForTimeline, shouldInjectStridesOnEasyRun } from './week-builder.ts';
import type { AthleteState, GoalInput } from './types.ts';

function makeAthleteState(overrides: Partial<AthleteState> = {}): AthleteState {
  return {
    current_ctl: 60,
    weekly_hours_available: 10,
    loading_pattern: '3:1',
    limiter_sport: 'bike',
    rest_days: [1],
    long_run_day: 0,
    long_ride_day: 6,
    swim_easy_day: 1,
    swim_quality_day: 4,
    run_quality_day: 3,
    bike_quality_day: 2,
    bike_easy_day: 3,
    training_intent: 'performance',
    tri_approach: 'race_peak',
    strength_intent: 'performance',
    swim_intent: 'focus',
    ...overrides,
  } as AthleteState;
}

type SessionLite = {
  day: string; type: string; name: string;
  tags?: string[]; duration?: number;
  steps_preset?: string[]; description?: string;
};

const hasStrides = (wk: { sessions: SessionLite[] }): boolean =>
  wk.sessions.some(
    (s) =>
      s.type === 'run' &&
      ((s.tags ?? []).includes('strides') ||
        (s.steps_preset ?? []).some((t) => /^strides_\d+x\d+s?$/.test(t))),
  );

function findBuildWeek(blocks: ReturnType<typeof buildPhaseTimeline>['blocks'], totalWeeks: number): number {
  for (let w = 1; w <= totalWeeks; w++) {
    const blk = blockForWeek(blocks, w);
    if (blk.phase === 'build' && !blk.isRecovery) return w;
  }
  throw new Error('no non-recovery build week found in timeline');
}

function findRaceSpecificWeek(blocks: ReturnType<typeof buildPhaseTimeline>['blocks'], totalWeeks: number): number {
  for (let w = 1; w <= totalWeeks; w++) {
    const blk = blockForWeek(blocks, w);
    if (blk.phase === 'race_specific' && !blk.isRecovery) return w;
  }
  throw new Error('no non-recovery race_specific week found in timeline');
}

function findRecoveryWeek(blocks: ReturnType<typeof buildPhaseTimeline>['blocks'], totalWeeks: number): number | null {
  for (let w = 1; w <= totalWeeks; w++) {
    const blk = blockForWeek(blocks, w);
    if (blk.isRecovery) return w;
  }
  return null;
}

function findEarlyBaseWeek(blocks: ReturnType<typeof buildPhaseTimeline>['blocks'], totalWeeks: number): { w: number; wip: number } {
  for (let w = 1; w <= totalWeeks; w++) {
    const blk = blockForWeek(blocks, w);
    if (blk.phase !== 'base' || blk.isRecovery) continue;
    const wip = weekInPhaseForTimeline(blocks, w, blk);
    if (wip <= 2) return { w, wip };
  }
  throw new Error('no early base week (wip≤2) found');
}

function findRaceWeek(raceAnchors: ReturnType<typeof buildPhaseTimeline>['raceAnchors']): number | null {
  const a = raceAnchors.find((r) => r.priority === 'A') ?? raceAnchors[0];
  return a?.planWeek ?? null;
}

const goal70_3 = (): GoalInput[] => ([
  { id: 'a', event_name: 'A 70.3', event_date: '2026-09-13', distance: '70.3', sport: 'triathlon', priority: 'A' },
]);
const start = () => new Date('2026-05-18T12:00:00Z');

Deno.test('RUN §5.8: build week (perf intent) injects strides on the mid-week easy run', () => {
  const goals = goal70_3();
  const athlete = makeAthleteState();
  const { blocks, totalWeeks, raceAnchors } = buildPhaseTimeline(goals, start(), athlete);
  const w = findBuildWeek(blocks, totalWeeks);
  const wk = buildWeek(w, blockForWeek(blocks, w), 300, goals, athlete, undefined, {
    totalWeeks, raceAnchors, phaseBlocks: blocks,
  }) as unknown as { sessions: SessionLite[]; total_weighted_tss: number };
  assert(hasStrides(wk), `build wk${w} (perf intent) must inject strides on the mid-week easy run; sessions=${JSON.stringify(wk.sessions.map((s) => ({n: s.name, t: s.tags})))}`);
});

Deno.test('RUN §5.8: race_specific week (perf intent) injects strides on the easy run', () => {
  const goals = goal70_3();
  const athlete = makeAthleteState();
  const { blocks, totalWeeks, raceAnchors } = buildPhaseTimeline(goals, start(), athlete);
  const w = findRaceSpecificWeek(blocks, totalWeeks);
  const wk = buildWeek(w, blockForWeek(blocks, w), 300, goals, athlete, undefined, {
    totalWeeks, raceAnchors, phaseBlocks: blocks,
  }) as unknown as { sessions: SessionLite[]; total_weighted_tss: number };
  assert(hasStrides(wk), `race_specific wk${w} (perf intent) must inject strides; sessions=${JSON.stringify(wk.sessions.map((s) => s.name))}`);
});

Deno.test('RUN §5.8: race week (taper + raceThisWeek) does NOT inject strides', () => {
  const goals = goal70_3();
  const athlete = makeAthleteState();
  const { blocks, totalWeeks, raceAnchors } = buildPhaseTimeline(goals, start(), athlete);
  const w = findRaceWeek(raceAnchors);
  assert(w != null, 'expected a realized A-race week');
  const wk = buildWeek(w!, blockForWeek(blocks, w!), 300, goals, athlete, undefined, {
    totalWeeks, raceAnchors, phaseBlocks: blocks,
  }) as unknown as { sessions: SessionLite[]; total_weighted_tss: number };
  assert(!hasStrides(wk), `race wk${w} must NOT have strides — §5.8 NEVER race week; sessions=${JSON.stringify(wk.sessions.map((s) => s.name))}`);
});

Deno.test('RUN §5.8: recovery week does NOT inject strides', () => {
  const goals = goal70_3();
  const athlete = makeAthleteState();
  const { blocks, totalWeeks, raceAnchors } = buildPhaseTimeline(goals, start(), athlete);
  const w = findRecoveryWeek(blocks, totalWeeks);
  if (w == null) return;
  const wk = buildWeek(w, blockForWeek(blocks, w), 300, goals, athlete, undefined, {
    totalWeeks, raceAnchors, phaseBlocks: blocks,
  }) as unknown as { sessions: SessionLite[]; total_weighted_tss: number };
  assert(!hasStrides(wk), `recovery wk${w} must NOT have strides — recovery-flush, not neuromuscular`);
});

Deno.test('RUN §5.8: early base week (wip≤2) does NOT inject strides (foundation-focused)', () => {
  const goals = goal70_3();
  const athlete = makeAthleteState();
  const { blocks, totalWeeks, raceAnchors } = buildPhaseTimeline(goals, start(), athlete);
  const { w } = findEarlyBaseWeek(blocks, totalWeeks);
  const wk = buildWeek(w, blockForWeek(blocks, w), 300, goals, athlete, undefined, {
    totalWeeks, raceAnchors, phaseBlocks: blocks,
  }) as unknown as { sessions: SessionLite[]; total_weighted_tss: number };
  assert(!hasStrides(wk), `early base wk${w} (wip≤2) must NOT have strides — §4.1 base is foundation-focused`);
});

Deno.test('RUN §5.8: non-performance intent (completion) gets NO strides in build', () => {
  const goals = goal70_3();
  const athlete = makeAthleteState({ training_intent: 'completion' });
  const { blocks, totalWeeks, raceAnchors } = buildPhaseTimeline(goals, start(), athlete);
  const w = findBuildWeek(blocks, totalWeeks);
  const wk = buildWeek(w, blockForWeek(blocks, w), 300, goals, athlete, undefined, {
    totalWeeks, raceAnchors, phaseBlocks: blocks,
  }) as unknown as { sessions: SessionLite[]; total_weighted_tss: number };
  assert(!hasStrides(wk), `build wk${w} (completion intent) must NOT have strides — §2 protocol table restricts strides to performance intent`);
});

Deno.test('RUN §5.8 predicate: pure unit tests of the gate', () => {
  // Performance + build + non-race + non-recovery → true
  assert(shouldInjectStridesOnEasyRun({
    phase: 'build', runWeekInPhase: 1,
    raceThisWeek: false, isRecovery: false,
    recoveryRebuildWeek1: false, recoveryRebuildWeek2EasyRunOnly: false,
    training_intent: 'performance',
  }) === true);
  // Race week ALWAYS false (overrides everything else)
  assert(shouldInjectStridesOnEasyRun({
    phase: 'taper', runWeekInPhase: 1,
    raceThisWeek: true, isRecovery: false,
    recoveryRebuildWeek1: false, recoveryRebuildWeek2EasyRunOnly: false,
    training_intent: 'performance',
  }) === false);
  // Recovery suppresses even in build
  assert(shouldInjectStridesOnEasyRun({
    phase: 'build', runWeekInPhase: 1,
    raceThisWeek: false, isRecovery: true,
    recoveryRebuildWeek1: false, recoveryRebuildWeek2EasyRunOnly: false,
    training_intent: 'performance',
  }) === false);
  // Comeback / completion / first_race intents → false in build
  for (const intent of ['completion', 'first_race', 'comeback'] as const) {
    assert(shouldInjectStridesOnEasyRun({
      phase: 'build', runWeekInPhase: 1,
      raceThisWeek: false, isRecovery: false,
      recoveryRebuildWeek1: false, recoveryRebuildWeek2EasyRunOnly: false,
      training_intent: intent,
    }) === false, `${intent} intent should not get strides`);
  }
  // Base wip=2 → false; base wip=4 → true (§4.1 late-base allowance for perf)
  assert(shouldInjectStridesOnEasyRun({
    phase: 'base', runWeekInPhase: 2,
    raceThisWeek: false, isRecovery: false,
    recoveryRebuildWeek1: false, recoveryRebuildWeek2EasyRunOnly: false,
    training_intent: 'performance',
  }) === false);
  assert(shouldInjectStridesOnEasyRun({
    phase: 'base', runWeekInPhase: 4,
    raceThisWeek: false, isRecovery: false,
    recoveryRebuildWeek1: false, recoveryRebuildWeek2EasyRunOnly: false,
    training_intent: 'performance',
  }) === true);
});
