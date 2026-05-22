/**
 * CYCLING-PROTOCOL §4.5 / §10.4 within-phase volume ramp — regression lock.
 *
 * Mirrors `run-volume-ramp.test.ts` and `swim-volume-ramp.test.ts`. The pre-fix
 * bug (closed by Phase 1 of the cycling arc): cycling session generation had no
 * `weekInPhase` plumbing at all — `groupRideQualityBikeSession` was phase-only,
 * the long-ride was derived from TSS budget × constant phase share, and rep
 * counts (sweet spot 2×15, threshold 3×20, VO2 6×5) were hardcoded literals.
 * Result: flat sessions every week within each phase. Fix: thread
 * `weekInPhaseForTimeline(...)` through the cycling path, add the
 * `longRideHoursForWeek` lerp helper, and ramp rep counts per §10.4 + §5.6.
 *
 * Validator parity: `effectiveLongRideFloorHours` extended with optional
 * `weekInPhase` + `rampWeeks` mirroring D-027 (the run-side Bundle C fix).
 * Without this, the hard enforcer would bump rides back to peak-of-phase.
 *
 * Run from repo root:
 *   deno test --no-check --no-lock --allow-all \
 *     supabase/functions/generate-combined-plan/bike-volume-ramp.test.ts
 */

import { assert, assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { buildPhaseTimeline, blockForWeek } from './phase-structure.ts';
import { buildWeek, weekInPhaseForTimeline } from './week-builder.ts';
import {
  effectiveLongRideFloorHours,
  enforceLongDayFloors,
} from './validate-training-floors.ts';
import {
  longRideFloorHours,
  longRideHoursForWeek,
  rampWeeksForPhase,
} from './science.ts';
import { groupRideQualityBikeSession } from './session-factory.ts';
import type { AthleteState, GeneratedWeek, GoalInput } from './types.ts';

function makeAthleteState(): AthleteState {
  return {
    current_ctl: 60,
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
    training_fitness: 'intermediate',
  } as AthleteState;
}

type SessionLite = { day: string; type: string; name: string; tags?: string[]; duration?: number };

const findLongRide = (wk: { sessions: SessionLite[] }) =>
  wk.sessions.find((s) => s.type === 'bike' && (s.tags?.includes('long_ride') ?? false));

const longRideHoursFromName = (name: string): number | null => {
  const m = String(name ?? '').match(/—\s*(\d+(?:\.\d+)?)\s*hr/i);
  return m ? Number(m[1]) : null;
};

// ── §4.5 longRideHoursForWeek lerp — unit-level pinning ─────────────────────

Deno.test('§4.5 longRideHoursForWeek: 70.3 base lerp 0.65→0.75 × 3.0h, rounded 0.25hr', () => {
  // peak = 3.0, start = 1.95, target = 2.25 across 6-week ramp.
  // wip=1 → 1.95 → round(7.8)/4 = 2.0
  // wip=4 → 2.13 → round(8.52)/4 = 2.25
  // wip=6 → 2.25 → 2.25
  assertEquals(longRideHoursForWeek('70.3', 'base', 1, 6), 2.0);
  assertEquals(longRideHoursForWeek('70.3', 'base', 4, 6), 2.25);
  assertEquals(longRideHoursForWeek('70.3', 'base', 6, 6), 2.25);
});

Deno.test('§4.5 longRideHoursForWeek: 70.3 build lerp 0.75→0.85 × 3.0h, rounded 0.25hr', () => {
  // peak = 3.0, start = 2.25, target = 2.55 across 4-week ramp.
  // wip=1 → 2.25
  // wip=4 → 2.55 → round(10.2)/4 = 2.5
  assertEquals(longRideHoursForWeek('70.3', 'build', 1, 4), 2.25);
  assertEquals(longRideHoursForWeek('70.3', 'build', 4, 4), 2.5);
});

Deno.test('§4.5 longRideHoursForWeek: 70.3 race_specific lerp 0.85→1.00 × 3.0h', () => {
  // peak = 3.0, start = 2.55, target = 3.00 across 4-week ramp.
  // wip=1 → 2.55 → round(10.2)/4 = 2.5
  // wip=4 → 3.0
  assertEquals(longRideHoursForWeek('70.3', 'race_specific', 1, 4), 2.5);
  assertEquals(longRideHoursForWeek('70.3', 'race_specific', 4, 4), 3.0);
});

Deno.test('§4.5 longRideHoursForWeek: full IM base ramps 4.0 → 4.5 across 6 weeks', () => {
  // peak = 6.0, start = 3.9, target = 4.5.
  // wip=1 → 3.9 → round(15.6)/4 = 4.0
  // wip=6 → 4.5
  assertEquals(longRideHoursForWeek('ironman', 'base', 1, 6), 4.0);
  assertEquals(longRideHoursForWeek('ironman', 'base', 6, 6), 4.5);
});

Deno.test('§4.5 longRideHoursForWeek: sprint + olympic ramp endpoints', () => {
  // sprint peak = 1.0; base start 0.65 = 0.65 → round 0.75. wip=6 → 0.75.
  assertEquals(longRideHoursForWeek('sprint', 'base', 6, 6), 0.75);
  // olympic peak = 1.5; base start 0.975 → 1.0. wip=6 → 1.125 → 1.25.
  assertEquals(longRideHoursForWeek('olympic', 'base', 6, 6), 1.25);
});

Deno.test('§4.5 longRideHoursForWeek: non-ramp phases delegate to longRideFloorHours', () => {
  // rebuild/taper/recovery — peak-of-phase semantics preserved.
  assertEquals(
    longRideHoursForWeek('70.3', 'rebuild', 3, 4),
    longRideFloorHours('70.3', 'rebuild'),
  );
  assertEquals(longRideHoursForWeek('70.3', 'taper', 1, 4), 0);
  assertEquals(longRideHoursForWeek('70.3', 'recovery', 1, 4), 0);
});

// ── §10.4 / §5.6 rep ramps — unit-level pinning ─────────────────────────────

const repsFromName = (name: string): { reps: number; minEach: number } | null => {
  const m = String(name ?? '').match(/(\d+)\s*[×x]\s*(\d+)\s*min/i);
  return m ? { reps: parseInt(m[1], 10), minEach: parseInt(m[2], 10) } : null;
};

Deno.test('§10.4 sweet spot reps ramp across base: 2 → 3 → 4 (slow plateau)', () => {
  // clamp(2, 4, 2 + floor((wip-1)/2)): wip=1→2, wip=2→2, wip=3→3, wip=4→3, wip=5→4, wip=6→4
  const at = (wip: number) => groupRideQualityBikeSession('Tuesday', 'base', wip, 'a');
  assertEquals(repsFromName(at(1).name), { reps: 2, minEach: 15 });
  assertEquals(repsFromName(at(2).name), { reps: 2, minEach: 15 });
  assertEquals(repsFromName(at(3).name), { reps: 3, minEach: 15 });
  assertEquals(repsFromName(at(5).name), { reps: 4, minEach: 15 });
});

Deno.test('§10.4 threshold reps ramp across build: 2 → 3 → 4 (same shape as sweet spot)', () => {
  const at = (wip: number) => groupRideQualityBikeSession('Tuesday', 'build', wip, 'a');
  assertEquals(repsFromName(at(1).name), { reps: 2, minEach: 20 });
  assertEquals(repsFromName(at(3).name), { reps: 3, minEach: 20 });
  assertEquals(repsFromName(at(5).name), { reps: 4, minEach: 20 });
});

Deno.test('§5.6 VO2 reps ramp across race_specific: 3 → 4 → 5 → 6', () => {
  // clamp(3, 6, 3 + (wip-1)): wip=1→3, wip=2→4, wip=3→5, wip=4→6, wip=5→6
  const at = (wip: number) => groupRideQualityBikeSession('Tuesday', 'race_specific', wip, 'a');
  assertEquals(repsFromName(at(1).name), { reps: 3, minEach: 5 });
  assertEquals(repsFromName(at(2).name), { reps: 4, minEach: 5 });
  assertEquals(repsFromName(at(3).name), { reps: 5, minEach: 5 });
  assertEquals(repsFromName(at(4).name), { reps: 6, minEach: 5 });
  assertEquals(repsFromName(at(5).name), { reps: 6, minEach: 5 });
});

Deno.test('ADR-0002 anti-regression: groupRideQualityBikeSession wip=1 vs wip=4 produce different reps', () => {
  for (const phase of ['base', 'build', 'race_specific'] as const) {
    const a = groupRideQualityBikeSession('Tuesday', phase, 1, 'a');
    const b = groupRideQualityBikeSession('Tuesday', phase, 4, 'a');
    assert(
      a.name !== b.name,
      `${phase}: wip=1 (${a.name}) vs wip=4 (${b.name}) must differ — flat ⇒ ADR-0002 weekInBlock≡1 regressed`,
    );
  }
});

// ── End-to-end: realized sessions through buildWeek ─────────────────────────

Deno.test('§4.5 buildWeek: 70.3 base long_ride ramps week-over-week (weekInPhase, not weekInBlock≡1)', () => {
  const goals: GoalInput[] = [
    { id: 'a', event_name: 'A 70.3', event_date: '2026-09-13', distance: '70.3', sport: 'triathlon', priority: 'A' },
  ];
  const startDate = new Date('2026-05-18T12:00:00Z');
  const athlete = makeAthleteState();
  const { blocks, totalWeeks, raceAnchors } = buildPhaseTimeline(goals, startDate, athlete);

  const baseWeekAt = (target: number) => {
    for (let w = 1; w <= totalWeeks; w++) {
      const blk = blockForWeek(blocks, w);
      if (blk.phase !== 'base') continue;
      const wip = weekInPhaseForTimeline(blocks, w, blk);
      if (wip === target) return { w, wip };
    }
    return null;
  };
  const wip1 = baseWeekAt(1);
  const wip4 = baseWeekAt(4);
  assert(wip1 && wip4, `expected base weeks at wip=1 and wip=4`);

  let prev = 500;
  const build = (w: number) => {
    const wk = buildWeek(w, blockForWeek(blocks, w), prev, goals, athlete, undefined, {
      totalWeeks, raceAnchors, phaseBlocks: blocks,
    }) as unknown as { sessions: SessionLite[]; total_weighted_tss: number };
    prev = wk.total_weighted_tss;
    return wk;
  };
  const wk1 = build(wip1.w);
  const wk4 = build(wip4.w);
  const lr1 = findLongRide(wk1);
  const lr4 = findLongRide(wk4);
  assert(lr1 && lr4, `both weeks must have a long_ride session`);
  const h1 = lr1!.duration ? lr1!.duration / 60 : 0;
  const h4 = lr4!.duration ? lr4!.duration / 60 : 0;
  assert(
    h4 > h1,
    `CYCLING §4.5 ramp: base wip=4 long_ride (${h4}hr) must exceed wip=1 (${h1}hr) — ` +
      `flat ⇒ the weekInBlock≡1 bug regressed (or longRideHoursForWeek not wired)`,
  );
});

Deno.test('§4.5 CANONICAL: lerp output IS realized long-ride hours at base wip=1 (70.3)', () => {
  // Pre-fix the engine derived long-ride hours from TSS budget × constant phase share —
  // result was always near peak-of-phase for high-budget athletes (the lerp had no
  // way to bind because there was no lerp). Post-fix, the lerp is canonical.
  const goals: GoalInput[] = [
    { id: 'a', event_name: 'A 70.3', event_date: '2026-09-13', distance: '70.3', sport: 'triathlon', priority: 'A' },
  ];
  const startDate = new Date('2026-05-18T12:00:00Z');
  const athlete = makeAthleteState();
  const { blocks, totalWeeks, raceAnchors } = buildPhaseTimeline(goals, startDate, athlete);

  let baseWip1: number | null = null;
  for (let w = 1; w <= totalWeeks; w++) {
    const blk = blockForWeek(blocks, w);
    if (blk.phase !== 'base') continue;
    if (weekInPhaseForTimeline(blocks, w, blk) === 1) { baseWip1 = w; break; }
  }
  assert(baseWip1 != null, 'expected a base week at wip=1');

  const wk = buildWeek(baseWip1!, blockForWeek(blocks, baseWip1!), 500, goals, athlete, undefined, {
    totalWeeks, raceAnchors, phaseBlocks: blocks,
  }) as unknown as { sessions: SessionLite[] };
  const lr = findLongRide(wk);
  assert(lr, 'wip=1 base week must have a long_ride');
  const hours = longRideHoursFromName(lr!.name);
  assertEquals(
    hours,
    2.0,
    `§4.5 canonical contract: 70.3 base wip=1 must be 2.0hr (lerp output), got ${hours}hr`,
  );
});

// ── Validator parity (D-NNN — mirror of D-027 for cycling) ──────────────────

Deno.test('Validator parity: effectiveLongRideFloorHours follows lerp when weekInPhase+rampWeeks provided', () => {
  // Without threading → peak-of-phase (legacy backward-compat path).
  // longRideFloorHours('70.3', 'base') = 0.75 × 3.0 = 2.25, peakCap = build floor = 2.5
  // → effective without threading = min(max(2.25, 0), 2.5) = 2.25.
  assertEquals(effectiveLongRideFloorHours('70.3', 'base', 0), 2.25);

  // With threading at wip=1 → lerp output = 2.0.
  assertEquals(effectiveLongRideFloorHours('70.3', 'base', 0, 1, 6), 2.0);

  // With threading at wip=6 (peak of base ramp) → 2.25.
  assertEquals(effectiveLongRideFloorHours('70.3', 'base', 0, 6, 6), 2.25);
});

Deno.test('Validator parity: enforceLongDayFloors respects within-phase ramp at base wip=1 (no peak-bump)', () => {
  // Pre-fix the validator's hard enforcer would bump the lerp's 2.0hr UP to 2.25hr
  // (peak-of-base) because longRideFloorHours('70.3', 'base') = 2.25. Post-fix
  // (mirror of D-027), the validator floor follows the lerp when phaseBlocks are
  // threaded.
  const goals: GoalInput[] = [
    { id: 'a', event_name: 'A 70.3', event_date: '2026-09-13', distance: '70.3', sport: 'triathlon', priority: 'A' },
  ];
  const startDate = new Date('2026-05-18T12:00:00Z');
  const athlete = makeAthleteState();
  const { blocks, totalWeeks, raceAnchors } = buildPhaseTimeline(goals, startDate, athlete);

  let baseWip1: number | null = null;
  for (let w = 1; w <= totalWeeks; w++) {
    const blk = blockForWeek(blocks, w);
    if (blk.phase !== 'base') continue;
    if (weekInPhaseForTimeline(blocks, w, blk) === 1) { baseWip1 = w; break; }
  }
  assert(baseWip1 != null, 'expected a base week at wip=1');

  const wk = buildWeek(baseWip1!, blockForWeek(blocks, baseWip1!), 500, goals, athlete, undefined, {
    totalWeeks, raceAnchors, phaseBlocks: blocks,
  }) as unknown as GeneratedWeek;

  enforceLongDayFloors([wk], {
    hasTri: true,
    primaryDistance: '70.3',
    raceWeekNums: raceAnchors.map((a) => a.planWeek),
    recentLongestRunMi: 0,
    recentLongestRideHr: 0,
    phaseBlocks: blocks,
  });

  const lrAfter = (wk.sessions as unknown as SessionLite[])
    .find((s) => s.type === 'bike' && (s.tags?.includes('long_ride') ?? false));
  assert(lrAfter, 'long_ride must survive enforcement');
  const hoursAfter = longRideHoursFromName(lrAfter!.name);
  assertEquals(
    hoursAfter,
    2.0,
    `Validator parity: enforceLongDayFloors must respect the lerp's within-phase ramp ` +
      `(2.0hr at base wip=1 for 70.3), got ${hoursAfter}hr — pre-fix the validator's ` +
      `peak-of-phase floor (2.25hr) bumped this up`,
  );
});

Deno.test('Validator no-regression: effectiveLongRideFloorHours WITHOUT phaseBlocks unchanged (peak-of-phase)', () => {
  // Legacy callers that don't pass weekInPhase/rampWeeks see prior behavior.
  // sprint base peak-of-phase = 0.75 × 1.0 = 0.75, peakCap = build floor = 0.85 → 0.75.
  assertEquals(effectiveLongRideFloorHours('sprint', 'base', 0), 0.75);
  // sanity: ramp window length matches expectation.
  assertEquals(rampWeeksForPhase('base'), 6);
  assertEquals(rampWeeksForPhase('build'), 4);
});
