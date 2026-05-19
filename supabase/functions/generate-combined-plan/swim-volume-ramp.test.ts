/**
 * SWIM-PROTOCOL §4.1 within-phase volume ramp — regression lock.
 *
 * The bug (fixed 2026-05-19): buildWeek passed `weekInBlock` (ALWAYS 1 per
 * ADR 0002) as the swim ramp's in-phase week index, so the dormant designed
 * start→peak curve never advanced — swim volume was flat across base/build/
 * race-specific. Fix: pass `weekInPhaseForTimeline(phaseBlocks, weekNum,
 * block)` (the recovery-non-resetting in-phase index, mirroring the brick
 * idiom). This test locks it: across two base-block weeks within the ramp
 * window, total swim `target_yards` must STRICTLY INCREASE (and the in-phase
 * index must actually advance — proving the mechanism, not an incidental diff).
 *
 * Run from repo root:
 *   deno test --no-check --no-lock --allow-all \
 *     supabase/functions/generate-combined-plan/swim-volume-ramp.test.ts
 */

import { assert } from 'https://deno.land/std@0.224.0/assert/mod.ts';
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
  } as AthleteState;
}

const swimYards = (wk: { sessions: Array<Record<string, unknown>> }) =>
  wk.sessions
    .filter((s) => s.type === 'swim')
    .reduce((sum, s) => sum + (typeof s.target_yards === 'number' ? s.target_yards : 0), 0);

Deno.test('SWIM §4.1: base-block swim volume ramps week-over-week (weekInPhase, not weekInBlock≡1)', () => {
  // 70.3 ~30 weeks out → a long base block (multiple weeks in the 6-week ramp window).
  const goals: GoalInput[] = [
    { id: 'a', event_name: 'A 70.3', event_date: '2026-12-12', distance: '70.3', sport: 'triathlon', priority: 'A' },
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
  assert(baseWeeks.length >= 2, `expected ≥2 base weeks in the ramp window; got ${JSON.stringify(baseWeeks)}`);

  const early = baseWeeks[0];
  const later = baseWeeks.find((b) => b.wip > early.wip);
  assert(later, `expected a later base week with a higher in-phase index; got ${JSON.stringify(baseWeeks)}`);
  assert(later!.wip > early.wip, 'sanity: weekInPhaseForTimeline must advance across base weeks (the fixed mechanism)');

  let prev = 300;
  const build = (w: number) => {
    const wk = buildWeek(w, blockForWeek(blocks, w), prev, goals, makeAthleteState(), undefined, {
      totalWeeks, raceAnchors, phaseBlocks: blocks,
    }) as unknown as { sessions: Array<Record<string, unknown>>; total_weighted_tss: number };
    prev = wk.total_weighted_tss;
    return wk;
  };
  // Build in week order so prevWeightedTSS threads naturally.
  const wkEarly = build(early.w);
  let wkLater = build(later!.w);
  // If a non-base week sits between, the loop above only built two — rebuild
  // `later` fresh off its own prior week isn't required for the yards assertion
  // (yards come from the phase ramp, not prevTSS), so this is sufficient.
  void wkLater;
  wkLater = build(later!.w);

  const yEarly = swimYards(wkEarly);
  const yLater = swimYards(wkLater);
  assert(yEarly > 0, `base swim must generate yards (harness sanity); got ${yEarly}`);
  assert(
    yLater > yEarly,
    `SWIM §4.1 ramp: base wk${later!.w} (wip=${later!.wip}) swim yards (${yLater}) must exceed ` +
      `wk${early.w} (wip=${early.wip}) yards (${yEarly}) — flat ⇒ the weekInBlock≡1 bug regressed`,
  );
});
