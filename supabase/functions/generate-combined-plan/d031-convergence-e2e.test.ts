/**
 * D-031 end-to-end convergence — the test that proves the fix works.
 *
 * Pre-D-031 failure mode: a high-budget tri athlete generating a plan where
 * within-phase lerps compound into a >20% week-over-week spike. The rebuild
 * loop couldn't throttle the long sessions (canonical lerps were independent
 * of `block.tssMultiplier`), so passes maxed out and the plan was rejected
 * with `WEEK_OVER_WEEK_TSS_RAMP`.
 *
 * Reproducer fixture (verified via fixture-search): **Olympic 13-wk close,
 * CTL=65, 11hr/wk, advanced race_peak**. Initial generation produces
 * `Week 8: 22.9% vs prior week` — a fatal violation.
 *
 * Post-D-031: `tightenPhaseBlocksForFloorRebuild` shrinks `block.tssMultiplier`,
 * which is now threaded into the canonical lerps as `loadThrottle`. The lerps
 * floor at peak-of-base (distance-aware), so plans never lose their durability
 * anchor, but the rebuild loop now has traction on the long sessions and can
 * converge. On the reproducer fixture, **convergence happens in 1 rebuild pass**
 * — proving the throttle path is actually engaged and load-bearing.
 *
 * This test exercises the FULL rebuild loop (same logic as index.ts:200-272):
 *   1. Generate all weeks at the initial block.tssMultiplier.
 *   2. Run enforceLongDayFloors (hard floor enforcement).
 *   3. Run validateTrainingFloors. If fails: shrink tssMultiplier × 0.87, regenerate, repeat.
 *   4. After up to 12 passes + 1 deep pass, assert convergence.
 *   5. Assert no week-over-week ramp exceeds the 20% guardrail.
 *
 * Run from repo root:
 *   deno test --no-check --no-lock --allow-all \
 *     supabase/functions/generate-combined-plan/d031-convergence-e2e.test.ts
 */

import { assert, assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { buildPhaseTimeline, blockForWeek } from './phase-structure.ts';
import { buildWeek } from './week-builder.ts';
import {
  enforceLongDayFloors,
  tightenPhaseBlocksForFloorRebuild,
  validateTrainingFloors,
  WEEK_OVER_WEEK_RAW_TSS_RAMP_MAX_TRI,
} from './validate-training-floors.ts';
import type { AthleteState, GeneratedWeek, GoalInput, PhaseBlock } from './types.ts';

/**
 * The reproducer fixture — high-budget Olympic athlete with a close race date.
 *
 * Why this specific combination triggers a >20% WoW spike pre-fix:
 *  - **13-week plan** → short window → tighter base / build phases → lerp PEAK
 *    values hit on weeks that overlap with the 3:1 weekInBlock=2 step (mult=1.08).
 *  - **CTL=65, 11hr/wk, advanced** → high TSS budget magnifies the absolute step
 *    when other-session pool ramps with the 3:1 multiplier.
 *  - **race_peak tri_approach** → no brick-swap toggle dampener; consistent quality.
 *  - **Olympic distance** → race-specific phase VO2 reps step 3→4→5→6 (high-TSS Z5)
 *    across consecutive weeks; combined with long-ride lerp = race-specific buildup.
 *
 * Empirically verified (via `_d031-fixture-search.test.ts`): initial generation
 * produces `Week 8: 22.9% vs prior week` — a fatal WoW violation. Pre-D-031 the
 * rebuild loop couldn't throttle the canonical lerps and convergence failed.
 * Post-D-031 the loop converges in 1 pass.
 */
function makeSpikeReproducer(): { athlete: AthleteState; goals: GoalInput[]; startDate: Date } {
  return {
    athlete: {
      current_ctl: 65,
      weekly_hours_available: 11,
      loading_pattern: '3:1',
      limiter_sport: 'run',
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
      training_fitness: 'advanced',
    } as AthleteState,
    goals: [
      {
        id: 'a',
        event_name: 'A Oly',
        event_date: '2026-08-16',
        distance: 'olympic',
        sport: 'triathlon',
        priority: 'A',
      },
    ],
    startDate: new Date('2026-05-18T12:00:00Z'),
  };
}

/**
 * Build the initial (no-rebuild) generation — single pass with tssMultiplier defaults.
 * Used by the headline test to confirm the fixture triggers a violation BEFORE the
 * rebuild loop has a chance to throttle it.
 */
function buildInitialWeeks(
  goals: GoalInput[],
  athlete: AthleteState,
  startDate: Date,
): { weeks: GeneratedWeek[]; blocks: PhaseBlock[] } {
  const { blocks, totalWeeks, raceAnchors } = buildPhaseTimeline(goals, startDate, athlete);
  const out: GeneratedWeek[] = [];
  let prevTSS = athlete.current_ctl * 7;
  for (let w = 1; w <= totalWeeks; w++) {
    const blk = blockForWeek(blocks, w);
    const wk = buildWeek(w, blk, prevTSS, goals, athlete, undefined, {
      totalWeeks,
      raceAnchors,
      phaseBlocks: blocks,
    }) as unknown as GeneratedWeek;
    out.push(wk);
    prevTSS = wk.total_weighted_tss;
  }
  return { weeks: out, blocks };
}

/**
 * Replicates the rebuild loop from `generate-combined-plan/index.ts:200-272`.
 * Returns { ok, weeks, blocks, passes } so the test can assert convergence.
 */
function runRebuildLoop(
  goals: GoalInput[],
  athlete: AthleteState,
  startDate: Date,
): {
  ok: boolean;
  weeks: GeneratedWeek[];
  blocks: PhaseBlock[];
  passes: number;
  violations: string[];
} {
  const timeline = buildPhaseTimeline(goals, startDate, athlete);
  let blocks = timeline.blocks;
  const { totalWeeks, raceAnchors } = timeline;
  const hasTriGoal = goals.some((g) => g.sport === 'triathlon');

  const generateAllWeeks = (blocksArg: PhaseBlock[], rebuild: false | 'normal' | 'deep' = false): GeneratedWeek[] => {
    const out: GeneratedWeek[] = [];
    let prevWeightedTSS = athlete.current_ctl * 7;
    for (let w = 1; w <= totalWeeks; w++) {
      const block = blockForWeek(blocksArg, w);
      const week = buildWeek(w, block, prevWeightedTSS, goals, athlete, undefined, {
        totalWeeks,
        raceAnchors,
        phaseBlocks: blocksArg,
        ...(rebuild === 'deep'
          ? { physiologicalFloorRebuild: true, physiologicalFloorRebuildDeep: true }
          : rebuild === 'normal'
            ? { physiologicalFloorRebuild: true }
            : {}),
      }) as unknown as GeneratedWeek;
      out.push(week);
      prevWeightedTSS = week.total_weighted_tss;
    }
    return out;
  };

  const floorOpts = { hasTri: hasTriGoal };
  let longDayFloorOpts = {
    hasTri: hasTriGoal,
    primaryDistance: (goals.find((g) => g.priority === 'A') ?? goals[0])!.distance,
    raceWeekNums: raceAnchors.map((a) => a.planWeek),
    recentLongestRunMi: 0,
    recentLongestRideHr: 0,
    phaseBlocks: blocks,
  };

  let weeks = generateAllWeeks(blocks);
  enforceLongDayFloors(weeks, longDayFloorOpts);
  let floors = validateTrainingFloors(weeks, floorOpts);
  let passes = 0;
  while (!floors.ok && passes < 12) {
    blocks = tightenPhaseBlocksForFloorRebuild(blocks);
    passes += 1;
    weeks = generateAllWeeks(blocks, 'normal');
    longDayFloorOpts = { ...longDayFloorOpts, phaseBlocks: blocks };
    enforceLongDayFloors(weeks, longDayFloorOpts);
    floors = validateTrainingFloors(weeks, floorOpts);
  }
  if (!floors.ok) {
    weeks = generateAllWeeks(blocks, 'deep');
    longDayFloorOpts = { ...longDayFloorOpts, phaseBlocks: blocks };
    enforceLongDayFloors(weeks, longDayFloorOpts);
    floors = validateTrainingFloors(weeks, floorOpts);
    passes += 1;
  }

  return {
    ok: floors.ok,
    weeks,
    blocks,
    passes,
    violations: floors.violations.map((v) => v.message),
  };
}

// ── The headline pin: reproducer fixture exercises the rebuild loop ─────────

Deno.test('D-031 e2e HEADLINE: spike-reproducer fixture triggers WoW violation AND the rebuild loop resolves it', () => {
  // Step 1: confirm the fixture genuinely reproduces the pre-fix failure mode.
  //         Initial generation (no rebuild) must produce a fatal WoW violation
  //         — otherwise this test isn't load-bearing for the D-031 fix.
  const { athlete, goals, startDate } = makeSpikeReproducer();
  const { weeks: initialWeeks, blocks: initialBlocks } = buildInitialWeeks(goals, athlete, startDate);
  enforceLongDayFloors(initialWeeks, {
    hasTri: true,
    primaryDistance: goals[0].distance,
    raceWeekNums: [],
    recentLongestRunMi: 0,
    recentLongestRideHr: 0,
    phaseBlocks: initialBlocks,
  });
  const initialFloors = validateTrainingFloors(initialWeeks, { hasTri: true });
  assert(
    !initialFloors.ok,
    `Fixture must reproduce the pre-fix failure mode (initial generation should fail WoW). ` +
      `If this passes ok=true, the fixture no longer triggers the rebuild loop and this test ` +
      `does not actually exercise the D-031 throttle path. ` +
      `violations=${JSON.stringify(initialFloors.violations.map((v) => v.message))}`,
  );
  const wowViolation = initialFloors.violations.find((v) => v.code === 'WEEK_OVER_WEEK_TSS_RAMP');
  assert(
    wowViolation,
    `Fixture must reproduce a WEEK_OVER_WEEK_TSS_RAMP specifically. ` +
      `Got: ${JSON.stringify(initialFloors.violations.map((v) => v.code))}`,
  );

  // Step 2: confirm the rebuild loop (with D-031 throttle active) resolves it.
  //         passes > 0 proves the throttle path is engaged and load-bearing.
  const result = runRebuildLoop(goals, athlete, startDate);
  assert(
    result.ok,
    `D-031 must converge — pre-fix this failed with rebuild-loop-exhausted. ` +
      `passes=${result.passes}, violations=${JSON.stringify(result.violations)}`,
  );
  assert(
    result.passes > 0,
    `Rebuild loop must engage (passes > 0) for this test to exercise the throttle path. ` +
      `Got passes=${result.passes} — the initial generation violated WoW but the loop didn't run.`,
  );
});

// ── WoW ramp guardrail satisfied for every same-phase pair ─────────────────

Deno.test('D-031 e2e: every same-phase week-over-week ramp is within the 20% TRI limit', () => {
  const { athlete, goals, startDate } = makeSpikeReproducer();
  const result = runRebuildLoop(goals, athlete, startDate);

  assert(result.ok, 'plan must converge before checking WoW ramps');

  // Mirror the validator's same-phase / non-recovery / non-taper / week>=2 / prior>=120 gating.
  const violations: { weekNum: number; prevTss: number; curTss: number; ramp: number }[] = [];
  for (let i = 1; i < result.weeks.length; i++) {
    const prev = result.weeks[i - 1]!;
    const cur = result.weeks[i]!;
    if (prev.weekNum === 1) continue;
    if (prev.isRecovery) continue;
    if (prev.phase === 'taper') continue;
    if (prev.phase !== cur.phase) continue;
    const p = Math.max(0, prev.total_raw_tss);
    if (p < 120) continue;
    const ramp = (cur.total_raw_tss - p) / p;
    if (ramp > WEEK_OVER_WEEK_RAW_TSS_RAMP_MAX_TRI + 1e-9) {
      violations.push({ weekNum: cur.weekNum, prevTss: p, curTss: cur.total_raw_tss, ramp });
    }
  }
  assertEquals(
    violations,
    [],
    `No week-over-week ramp may exceed ${(WEEK_OVER_WEEK_RAW_TSS_RAMP_MAX_TRI * 100).toFixed(0)}%; ` +
      `got: ${JSON.stringify(violations)}`,
  );
});

// ── Durability anchor preserved: throttled weeks honor the peak-of-base floor ──

Deno.test('D-031 e2e: throttle-protected weeks honor the peak-of-base long_run floor', () => {
  // After the rebuild loop runs (proved by the headline test), block.tssMultiplier < 1.0
  // for some load-phase weeks. The throttled lerp would pull the long_run below peak-of-base;
  // the floor protects it. Non-throttled weeks use the natural lerp curve (which can be
  // below peak-of-base by design — peak-of-base is a rebuild-mode floor, not a normal-mode
  // minimum). Both states satisfy the D-031 contract.
  //   - Olympic peak-of-base = longRunFloorMiles('olympic', 'base') = Math.round(0.75 × 7 × 2)/2 = 5.5mi
  const { athlete, goals, startDate } = makeSpikeReproducer();
  const result = runRebuildLoop(goals, athlete, startDate);
  assert(result.ok, 'plan must converge before checking durability anchor');
  assert(result.passes > 0, 'rebuild loop must have engaged');

  type SessionLite = { type: string; name: string; duration?: number; tags?: string[] };
  const PEAK_OF_BASE_OLY_LONG_RUN = 5.5;
  const SANITY_FLOOR_OLY_LONG_RUN = 3.0;
  let throttledWeeksInspected = 0;
  for (const w of result.weeks) {
    if (w.isRecovery) continue;
    if (w.phase === 'taper') continue;
    if (w.phase === 'recovery') continue;
    const sessions = w.sessions as unknown as SessionLite[];
    const lr = sessions.find((s) => s.type === 'run' && (s.tags?.includes('long_run') ?? false));
    if (!lr) continue;
    const miles = (lr.duration ?? 0) / 9.5;
    assert(
      miles >= SANITY_FLOOR_OLY_LONG_RUN,
      `Week ${w.weekNum} long_run (${miles.toFixed(2)}mi) below sanity floor (${SANITY_FLOOR_OLY_LONG_RUN}mi). ` +
        `phase=${w.phase}; passes=${result.passes}`,
    );
    const blk = result.blocks.find((b) => b.startWeek <= w.weekNum && b.endWeek >= w.weekNum);
    const throttle = blk
      ? (blk.phase === 'base' || blk.phase === 'build' || blk.phase === 'race_specific')
        ? Math.min(1.0, blk.tssMultiplier)
        : 1.0
      : 1.0;
    if (throttle < 1.0) {
      throttledWeeksInspected += 1;
      assert(
        miles >= PEAK_OF_BASE_OLY_LONG_RUN - 0.6, // 0.5mi roundHalfMile tolerance
        `Week ${w.weekNum} long_run (${miles.toFixed(2)}mi) was throttle-protected ` +
          `(throttle=${throttle.toFixed(3)}); must be ≥ peak-of-base floor (${PEAK_OF_BASE_OLY_LONG_RUN}mi). phase=${w.phase}`,
      );
    }
  }
  assert(
    throttledWeeksInspected > 0,
    'Test must inspect at least one throttle-protected week — got 0',
  );
});

Deno.test('D-031 e2e: throttle-protected weeks honor the peak-of-base long_ride floor', () => {
  //   - Olympic peak-of-base = longRideFloorHours('olympic', 'base') = Math.round(0.75 × 1.5 × 4)/4 = 1.25h
  const { athlete, goals, startDate } = makeSpikeReproducer();
  const result = runRebuildLoop(goals, athlete, startDate);
  assert(result.ok && result.passes > 0, 'rebuild loop must have engaged');

  type SessionLite = { type: string; duration?: number; tags?: string[] };
  const PEAK_OF_BASE_OLY_LONG_RIDE_HOURS = 1.25;
  const SANITY_FLOOR_OLY_LONG_RIDE_HOURS = 0.75;
  let throttledWeeksInspected = 0;
  for (const w of result.weeks) {
    if (w.isRecovery) continue;
    if (w.phase === 'taper') continue;
    if (w.phase === 'recovery') continue;
    const sessions = w.sessions as unknown as SessionLite[];
    const lride = sessions.find((s) => s.type === 'bike' && (s.tags?.includes('long_ride') ?? false));
    if (!lride) continue;
    const hours = (lride.duration ?? 0) / 60;
    assert(
      hours >= SANITY_FLOOR_OLY_LONG_RIDE_HOURS,
      `Week ${w.weekNum} long_ride (${hours.toFixed(2)}h) below sanity floor (${SANITY_FLOOR_OLY_LONG_RIDE_HOURS}h). ` +
        `phase=${w.phase}; passes=${result.passes}`,
    );
    const blk = result.blocks.find((b) => b.startWeek <= w.weekNum && b.endWeek >= w.weekNum);
    const throttle = blk
      ? (blk.phase === 'base' || blk.phase === 'build' || blk.phase === 'race_specific')
        ? Math.min(1.0, blk.tssMultiplier)
        : 1.0
      : 1.0;
    if (throttle < 1.0) {
      throttledWeeksInspected += 1;
      assert(
        hours >= PEAK_OF_BASE_OLY_LONG_RIDE_HOURS - 0.1,
        `Week ${w.weekNum} long_ride (${hours.toFixed(2)}h) was throttle-protected ` +
          `(throttle=${throttle.toFixed(3)}); must be ≥ peak-of-base floor (${PEAK_OF_BASE_OLY_LONG_RIDE_HOURS}h). phase=${w.phase}`,
      );
    }
  }
  assert(throttledWeeksInspected > 0, 'Test must inspect at least one throttle-protected week');
});
