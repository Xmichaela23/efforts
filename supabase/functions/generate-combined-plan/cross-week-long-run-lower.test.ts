/**
 * Bug 3 §4.21 cross-week regression lock — Sun(N) long_run → Mon(N+1) lower_body_strength.
 *
 * `sequentialOk` (`_shared/week-optimizer.ts:452-588`) operates intra-week only;
 * day primitives use circular mod-7 so `dayBefore('monday') = 'sunday'` reads from
 * the SAME week's `days` map (`:48-52`). Cross-week (Sun of N → Mon of N+1) is
 * invisible to the optimizer's per-call evaluation.
 *
 * The closing invariant: the reconciler runs the optimizer ONCE
 * (`reconcile-athlete-state-week-optimizer.ts:239`, `index.ts:159`), stamps a
 * single canonical pattern into `AthleteState`, and every subsequent `buildWeek`
 * reuses it. The W-004 unit test
 * (`_shared/week-optimizer.anchor-contract.test.ts:116-137`) proves the optimizer
 * refuses `slot.weekday === 'Monday'` whenever long_run is Sunday — so every
 * cross-week transition inherits the same safe lower-weekday.
 *
 * This test is defense-in-depth at the PLAN level: builds all 17+ weeks of a
 * realistic 70.3 plan, scans every week pair (N, N+1), and asserts no transition
 * realizes the Sun(N)-long_run + Mon(N+1)-lower violation in the materialized
 * sessions. Locks the invariant the unit-level W-004 only implies.
 *
 * Run from repo root:
 *   deno test --no-check --no-lock --allow-all \
 *     supabase/functions/generate-combined-plan/cross-week-long-run-lower.test.ts
 */

import { assert } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { buildPhaseTimeline, blockForWeek } from './phase-structure.ts';
import { buildWeek } from './week-builder.ts';
import type { AthleteState, GoalInput } from './types.ts';

function makeAthleteState(): AthleteState {
  return {
    current_ctl: 60,
    weekly_hours_available: 10,
    loading_pattern: '3:1',
    limiter_sport: 'run',
    rest_days: [1],
    long_run_day: 0, // Sunday — the exact configuration the rule protects.
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

type Session = { day: string; type: string; tags: string[] };

Deno.test('§4.21 cross-week: no Sun(N) long_run → Mon(N+1) lower_body_strength across full 70.3 plan', () => {
  // 70.3 ~17 weeks out → standard plan with base/build/race-spec/taper + race week
  // and at least one 3:1 deload boundary. Covers every realistic phase transition
  // type (base→build, build→race-spec, race-spec→taper, taper→race-week, deload).
  const goals: GoalInput[] = [
    { id: 'a', event_name: 'A 70.3', event_date: '2026-09-13', distance: '70.3', sport: 'triathlon', priority: 'A' },
  ];
  const startDate = new Date('2026-05-18T12:00:00Z');
  const athlete = makeAthleteState();
  const { blocks, totalWeeks, raceAnchors } = buildPhaseTimeline(goals, startDate, athlete);
  assert(totalWeeks >= 15, `expected a multi-week plan (≥15 weeks); got ${totalWeeks}`);

  // Materialize every week so we can scan transitions across the full plan.
  const sessionsByWeek: Session[][] = [];
  let prev = 300;
  for (let w = 1; w <= totalWeeks; w++) {
    const wk = buildWeek(w, blockForWeek(blocks, w), prev, goals, athlete, undefined, {
      totalWeeks, raceAnchors, phaseBlocks: blocks,
    }) as unknown as { sessions: Array<{ day: string; type: string; tags?: string[] }>; total_weighted_tss: number };
    sessionsByWeek.push(
      wk.sessions.map((s) => ({ day: String(s.day).toLowerCase(), type: s.type, tags: s.tags ?? [] })),
    );
    prev = wk.total_weighted_tss;
  }

  // Sweep every (N, N+1) transition: if N has Sunday long_run AND N+1 has Monday
  // lower_body_strength, that's the §4.21 cross-week violation Bug 3 guards against.
  const violations: string[] = [];
  for (let n = 0; n < sessionsByWeek.length - 1; n++) {
    const sunLongRun = sessionsByWeek[n].some(
      (s) => s.day === 'sunday' && s.type === 'run' && s.tags.includes('long_run'),
    );
    const monLower = sessionsByWeek[n + 1].some(
      (s) => s.day === 'monday' && s.type === 'strength' && s.tags.includes('lower_body'),
    );
    if (sunLongRun && monLower) {
      violations.push(`wk${n + 1}→wk${n + 2}: Sun long_run + Mon lower_body_strength`);
    }
  }
  assert(
    violations.length === 0,
    `§4.21 cross-week violation(s) realized: ${violations.join('; ')}`,
  );
});
