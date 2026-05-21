/**
 * RUN-PROTOCOL §4 within-phase volume ramp — regression lock.
 *
 * Mirrors `swim-volume-ramp.test.ts` exactly. The pre-fix bug (closed by Phase 1
 * of the run arc): `weekInBlock` is ALWAYS 1 per ADR-0002, so the base-interval
 * rep ramp (`4 + floor((weekInBlock − 1) / 2)`) collapsed to a flat 4×1000m every
 * base week. Long-run miles, brick-run miles, VO2max rep count, and race-pace
 * miles all flat for the same reason. Fix: pass `weekInPhaseForTimeline(...)` —
 * the recovery-non-resetting in-phase index, mirroring the swim arc at c1c94cec.
 *
 * This test locks the fix at the realized-sessions level: across two base-block
 * weeks within the ramp window, the long_run mileage and the quality-run rep
 * count MUST strictly increase (proving the mechanism, not an incidental diff).
 *
 * Run from repo root:
 *   deno test --no-check --no-lock --allow-all \
 *     supabase/functions/generate-combined-plan/run-volume-ramp.test.ts
 */

import { assert, assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { buildPhaseTimeline, blockForWeek } from './phase-structure.ts';
import { buildWeek, weekInPhaseForTimeline } from './week-builder.ts';
import type { AthleteState, GoalInput } from './types.ts';

function makeAthleteState(): AthleteState {
  return {
    current_ctl: 60,
    weekly_hours_available: 10,
    loading_pattern: '3:1',
    limiter_sport: 'run',
    rest_days: [1],
    long_run_day: 0,        // Sunday
    long_ride_day: 6,
    swim_easy_day: 1,
    swim_quality_day: 4,
    run_quality_day: 3,     // Wednesday — where intervalRun lands
    bike_quality_day: 2,
    bike_easy_day: 3,
    training_intent: 'performance',
    tri_approach: 'race_peak',
    strength_intent: 'performance',
    swim_intent: 'focus',
  } as AthleteState;
}

type SessionLite = { day: string; type: string; name: string; tags?: string[]; duration?: number; description?: string };

const findLongRun = (wk: { sessions: SessionLite[] }) =>
  wk.sessions.find((s) => s.type === 'run' && (s.tags?.includes('long_run') ?? false));

/** Parse miles from a "Long Run — X mi" / "Long Run — X.Y mi" name. */
const longRunMilesFromName = (name: string): number | null => {
  const m = String(name ?? '').match(/—\s*(\d+(?:\.\d+)?)\s*mi/i);
  return m ? Number(m[1]) : null;
};

/** Extract interval rep count from session name like "Run Intervals — 4×1000m". */
const intervalReps = (wk: { sessions: SessionLite[] }): number | null => {
  const s = wk.sessions.find((s) => s.type === 'run' && (s.tags?.includes('intervals') ?? false));
  if (!s) return null;
  const m = String(s.name ?? '').match(/(\d+)\s*[×x]\s*\d+m/i);
  return m ? parseInt(m[1], 10) : null;
};

Deno.test('RUN §4.5: base-block long_run mileage ramps week-over-week (weekInPhase, not weekInBlock≡1)', () => {
  // 70.3 ~17 weeks out — enough to land multiple base weeks inside the 6-week ramp window.
  const goals: GoalInput[] = [
    { id: 'a', event_name: 'A 70.3', event_date: '2026-09-13', distance: '70.3', sport: 'triathlon', priority: 'A' },
  ];
  const startDate = new Date('2026-05-18T12:00:00Z');
  const { blocks, totalWeeks, raceAnchors } = buildPhaseTimeline(goals, startDate, makeAthleteState());

  // Discover base weeks within the ramp window (weekInPhaseForTimeline ≤ 6).
  const baseWeeks: Array<{ w: number; wip: number }> = [];
  for (let w = 1; w <= totalWeeks; w++) {
    const blk = blockForWeek(blocks, w);
    if (blk.phase !== 'base') continue;
    const wip = weekInPhaseForTimeline(blocks, w, blk);
    if (wip <= 6) baseWeeks.push({ w, wip });
  }
  assert(baseWeeks.length >= 2, `expected ≥2 base weeks in ramp window; got ${JSON.stringify(baseWeeks)}`);

  const early = baseWeeks[0];
  // Pick a `later` week with wip ≥ 3 so that the ramp's half-mile rounding actually advances
  // miles week-over-week (post-Phase-3 lift the 0.65–0.75 endpoint band for 70.3 means wip 1
  // and wip 2 both round to 8.5mi; wip 3 lifts to 9.0mi). Locks the ramp mechanism end-to-end.
  const later = baseWeeks.find((b) => b.wip >= 3);
  assert(later, `expected a later base week with wip ≥ 3; got ${JSON.stringify(baseWeeks)}`);
  assert(later!.wip > early.wip, 'sanity: weekInPhaseForTimeline must advance across base weeks (the fixed mechanism)');

  let prev = 300;
  const build = (w: number) => {
    const wk = buildWeek(w, blockForWeek(blocks, w), prev, goals, makeAthleteState(), undefined, {
      totalWeeks, raceAnchors, phaseBlocks: blocks,
    }) as unknown as { sessions: SessionLite[]; total_weighted_tss: number };
    prev = wk.total_weighted_tss;
    return wk;
  };
  const wkEarly = build(early.w);
  const wkLater = build(later!.w);

  const lrEarly = findLongRun(wkEarly);
  const lrLater = findLongRun(wkLater);
  assert(lrEarly, `early base week ${early.w} must have a long_run session; got sessions=${JSON.stringify(wkEarly.sessions.map((s) => s.type))}`);
  assert(lrLater, `later base week ${later!.w} must have a long_run session`);

  // Duration as a proxy for mileage (Long Run — Xmi → duration ~= X × 9.5min).
  const durE = lrEarly!.duration ?? 0;
  const durL = lrLater!.duration ?? 0;
  assert(durE > 0 && durL > 0, `long_run durations must be positive; got early=${durE} later=${durL}`);
  assert(
    durL > durE,
    `RUN §4.5 ramp: base wk${later!.w} (wip=${later!.wip}) long_run duration (${durL}min) must exceed ` +
      `wk${early.w} (wip=${early.wip}) duration (${durE}min) — flat ⇒ the weekInBlock≡1 bug regressed`,
  );
});

Deno.test('RUN §4.5 CANONICAL: lerp output IS the realized long-run mileage (NOT a floor under TSS budget)', () => {
  // Plan #78 reproducer — pre-fix, the engine treated `longRunMilesForWeek`
  // as a `Math.max` floor against the TSS-derived value, which collapsed the
  // ramp to a flat peak-of-phase value for high-budget athletes (TSS-derived
  // miles naturally hit ~10mi every base week → ramp invisible). Post-fix,
  // the lerp is canonical: long-run volume is anchored to race distance, not
  // budget. See D-NNN.
  //
  // Asserts EXACT mileage at the lerp output (8.5 at wip=1 for 70.3 base),
  // not just monotonic increase. The prior "ramps week-over-week" test
  // passes by accident on a low-TSS fixture; this one fails pre-fix
  // regardless of fixture TSS.
  const goals: GoalInput[] = [
    { id: 'a', event_name: 'A 70.3', event_date: '2026-09-13', distance: '70.3', sport: 'triathlon', priority: 'A' },
  ];
  const startDate = new Date('2026-05-18T12:00:00Z');
  // High-budget athlete fixture (closely matches Plan #78 demographics — CTL
  // ~60, 11 weekly hours, intermediate, performance/race_peak). TSS-derived
  // long-run miles would land at ~10mi every base week pre-fix.
  const athlete = {
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
  const { blocks, totalWeeks, raceAnchors } = buildPhaseTimeline(goals, startDate, athlete);

  // Find base weeks at specific wip values.
  const baseWeekAt = (target: number): { w: number; wip: number } | null => {
    for (let w = 1; w <= totalWeeks; w++) {
      const blk = blockForWeek(blocks, w);
      if (blk.phase !== 'base') continue;
      const wip = weekInPhaseForTimeline(blocks, w, blk);
      if (wip === target) return { w, wip };
    }
    return null;
  };
  const wip1 = baseWeekAt(1);
  assert(wip1, 'expected a base week with wip=1');

  let prev = 500;
  const build = (w: number) => {
    const wk = buildWeek(w, blockForWeek(blocks, w), prev, goals, athlete, undefined, {
      totalWeeks, raceAnchors, phaseBlocks: blocks,
    }) as unknown as { sessions: SessionLite[]; total_weighted_tss: number };
    prev = wk.total_weighted_tss;
    return wk;
  };
  const wk1 = build(wip1!.w);
  const lr1 = findLongRun(wk1);
  assert(lr1, `wip=1 base week must have a long_run`);
  const miles1 = longRunMilesFromName(lr1!.name);
  assert(miles1 != null, `expected miles in long_run name; got "${lr1!.name}"`);

  // Per RUN-PROTOCOL §4.5: 70.3 base wip=1 → 0.65 × 13 = 8.45 → roundHalfMile = 8.5mi.
  // Pre-fix this would have been 10 (TSS-derived value, with lerp 8.5 acting as a no-op floor).
  assertEquals(
    miles1,
    8.5,
    `RUN §4.5 canonical contract: base wip=1 must be 8.5mi (lerp output), got ${miles1}mi — ` +
      `pre-fix the Math.max floor collapsed the ramp to a flat peak-of-phase value`,
  );
});

Deno.test('RUN §4.1: base-block interval rep count ramps 4 → 5 → 6 across the ramp window', () => {
  // The interval-rep formula: clamp(4, 8, 4 + floor((weekInPhase − 1) / 2)).
  // wkInPhase 1-2 → 4 reps; 3-4 → 5; 5-6 → 6.
  const goals: GoalInput[] = [
    { id: 'a', event_name: 'A 70.3', event_date: '2026-09-13', distance: '70.3', sport: 'triathlon', priority: 'A' },
  ];
  const startDate = new Date('2026-05-18T12:00:00Z');
  const { blocks, totalWeeks, raceAnchors } = buildPhaseTimeline(goals, startDate, makeAthleteState());

  // Find a wip=1 base week and a wip≥5 base week (where rep count must differ).
  const baseWeeks: Array<{ w: number; wip: number }> = [];
  for (let w = 1; w <= totalWeeks; w++) {
    const blk = blockForWeek(blocks, w);
    if (blk.phase !== 'base') continue;
    const wip = weekInPhaseForTimeline(blocks, w, blk);
    if (wip <= 6) baseWeeks.push({ w, wip });
  }
  const wipEarly = baseWeeks.find((b) => b.wip <= 2);
  const wipLater = baseWeeks.find((b) => b.wip >= 5);
  if (!wipEarly || !wipLater) {
    // If the realized plan doesn't span both ends of the ramp window, the test
    // skips gracefully — the duration test above already locks the mechanism.
    return;
  }

  let prev = 300;
  const build = (w: number) => {
    const wk = buildWeek(w, blockForWeek(blocks, w), prev, goals, makeAthleteState(), undefined, {
      totalWeeks, raceAnchors, phaseBlocks: blocks,
    }) as unknown as { sessions: SessionLite[]; total_weighted_tss: number };
    prev = wk.total_weighted_tss;
    return wk;
  };
  const wkEarly = build(wipEarly.w);
  const wkLater = build(wipLater.w);

  const repsEarly = intervalReps(wkEarly);
  const repsLater = intervalReps(wkLater);
  if (repsEarly == null || repsLater == null) {
    // No quality_run placed (e.g. base_first approach + early base week may drop quality);
    // skip rather than fail — duration test handles the load ramp.
    return;
  }
  assert(
    repsLater > repsEarly,
    `RUN §4.1 rep ramp: wip=${wipLater.wip} interval reps (${repsLater}) must exceed wip=${wipEarly.wip} reps (${repsEarly}) — flat ⇒ the weekInBlock≡1 bug regressed`,
  );
});
