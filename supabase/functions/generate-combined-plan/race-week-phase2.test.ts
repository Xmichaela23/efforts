/**
 * Race-week protocol — Phase 2 contract tests (§8.3 distance-aware race-day
 * session + §8.4 hard-guarantee predicate + always-materialize-on-rest-slot).
 *
 * Phase 2 scope (RACE-WEEK-PROTOCOL.md §8, decisions 2026-05-18):
 *   - §8.3: raceDaySessionSpec is distance-driven (no event-name string match);
 *     sprint/olympic/70.3/ironman + aliases; unknown → 70.3 fallback.
 *   - §8.4: findMissingRaceDaySessions detects missing/duplicate/misplaced race
 *     sessions (enforced as a hard-fail in generate-combined-plan/index.ts).
 *   - §8.4: the race session ALWAYS materializes on the anchor dayName even when
 *     that day is a rest day (the prior `!slot.isRest` gate silently dropped it).
 *
 * Run from repo root:
 *   deno test --no-check --no-lock --allow-all \
 *     supabase/functions/generate-combined-plan/race-week-phase2.test.ts
 */

import { assert, assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { raceDaySessionSpec } from './science.ts';
import { findMissingRaceDaySessions } from './validator.ts';
import { buildPhaseTimeline, blockForWeek } from './phase-structure.ts';
import { buildWeek } from './week-builder.ts';
import type { AthleteState, GoalInput } from './types.ts';

// ── §8.3: raceDaySessionSpec is distance-aware ──────────────────────────────

Deno.test('§8.3: per-distance legs + duration + description (sprint/olympic/70.3/ironman)', () => {
  const sprint = raceDaySessionSpec('sprint');
  assertEquals(sprint.legs, { swim_mi: 0.47, bike_mi: 12.4, run_mi: 3.1 });
  assertEquals(sprint.duration_min, 90);
  assert(sprint.description.includes('Swim 0.47mi → Bike 12.4mi → Run 3.1mi'));

  const oly = raceDaySessionSpec('olympic');
  assertEquals(oly.legs, { swim_mi: 0.93, bike_mi: 24.8, run_mi: 6.2 });
  assertEquals(oly.duration_min, 165);

  const half = raceDaySessionSpec('70.3');
  assertEquals(half.legs, { swim_mi: 1.2, bike_mi: 56, run_mi: 13.1 });
  assertEquals(half.duration_min, 330, '70.3 anchored to prior 330 for continuity');
  assert(half.description.includes('Swim 1.2mi → Bike 56mi → Run 13.1mi'));

  const full = raceDaySessionSpec('ironman');
  assertEquals(full.legs, { swim_mi: 2.4, bike_mi: 112, run_mi: 26.2 });
  assertEquals(full.duration_min, 760);
});

Deno.test('§8.3: tss is distance-driven and scales with duration (sprint < 70.3 < ironman)', () => {
  const s = raceDaySessionSpec('sprint').tss;
  const h = raceDaySessionSpec('70.3').tss;
  const i = raceDaySessionSpec('ironman').tss;
  assert(s > 0 && s < h && h < i, `expected sprint<70.3<ironman tss; got ${s}/${h}/${i}`);
  // 70.3 continuity: round(estimateSessionTSS('race','MODERATE',330) * 0.9)
  // = round((330 * 70/60) * 0.9) = round(385 * 0.9) = 347
  assertEquals(h, 347, '70.3 tss preserves the prior 330-min computation');
});

Deno.test('§8.3: aliases (half→70.3, full/140.6→ironman) and unknown/empty → 70.3 fallback', () => {
  assertEquals(raceDaySessionSpec('half').legs, raceDaySessionSpec('70.3').legs);
  assertEquals(raceDaySessionSpec('full').legs, raceDaySessionSpec('ironman').legs);
  assertEquals(raceDaySessionSpec('140.6').legs, raceDaySessionSpec('ironman').legs);
  assertEquals(raceDaySessionSpec('SPRINT' as string).legs, raceDaySessionSpec('sprint').legs);
  assertEquals(raceDaySessionSpec('banana' as string).legs, raceDaySessionSpec('70.3').legs);
  assertEquals(raceDaySessionSpec('' as string).legs, raceDaySessionSpec('70.3').legs);
});

// ── §8.4: findMissingRaceDaySessions predicate ──────────────────────────────

const anchor = (o: Partial<Record<string, unknown>>) =>
  ({ goalId: 'g', eventName: 'R', eventDate: '2026-09-12', planWeek: 5, dayName: 'Sunday', priority: 'A', ...o }) as any;
const week = (weekNum: number, sessions: unknown[]) => ({ weekNum, phase: 'taper', isRecovery: false, sessions } as any);
const raceSession = (o: Partial<Record<string, unknown>> = {}) =>
  ({ type: 'race', day: 'Sunday', serves_goal: 'g', ...o });

Deno.test('§8.4 predicate: exactly-one race session on dayName → no violation', () => {
  const v = findMissingRaceDaySessions([week(5, [raceSession()])], [anchor({})]);
  assertEquals(v, []);
});

Deno.test('§8.4 predicate: missing race session → violation', () => {
  const v = findMissingRaceDaySessions([week(5, [{ type: 'run', day: 'Sunday' }])], [anchor({})]);
  assertEquals(v.length, 1);
  assert(v[0].includes('has 0 race session'));
});

Deno.test('§8.4 predicate: week not generated → violation', () => {
  const v = findMissingRaceDaySessions([week(4, [raceSession()])], [anchor({ planWeek: 5 })]);
  assertEquals(v.length, 1);
  assert(v[0].includes('was not generated'));
});

Deno.test('§8.4 predicate: duplicate / wrong-day / wrong-goal → violation', () => {
  assertEquals(
    findMissingRaceDaySessions([week(5, [raceSession(), raceSession()])], [anchor({})]).length, 1,
    'duplicate race session',
  );
  assertEquals(
    findMissingRaceDaySessions([week(5, [raceSession({ day: 'Saturday' })])], [anchor({})]).length, 1,
    'race session on the wrong day',
  );
  assertEquals(
    findMissingRaceDaySessions([week(5, [raceSession({ serves_goal: 'other' })])], [anchor({})]).length, 1,
    'race session for the wrong goal',
  );
});

Deno.test('§8.4 predicate: multi-anchor (B + A) both present → no violation', () => {
  const a = anchor({ goalId: 'a', planWeek: 17, dayName: 'Sunday', priority: 'A' });
  const b = anchor({ goalId: 'b', planWeek: 13, dayName: 'Saturday', priority: 'B' });
  const weeks = [
    week(13, [raceSession({ day: 'Saturday', serves_goal: 'b' })]),
    week(17, [raceSession({ day: 'Sunday', serves_goal: 'a' })]),
  ];
  assertEquals(findMissingRaceDaySessions(weeks, [b, a]), []);
});

// ── §8.4: race session ALWAYS materializes even on a rest day (integration) ──

function makeAthleteState(): AthleteState {
  return {
    current_ctl: 60,
    weekly_hours_available: 10,
    loading_pattern: '3:1',
    limiter_sport: 'run',
    rest_days: [0, 1, 2, 3, 4, 5, 6], // every day a rest day — incl. the race day
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
  };
}

Deno.test('§8.4: race week with the anchor day as a rest day still materializes the race session', () => {
  const goals: GoalInput[] = [
    { id: 'a', event_name: 'A 70.3', event_date: '2026-10-04', distance: '70.3', sport: 'triathlon', priority: 'A' },
  ];
  const startDate = new Date('2026-05-11T12:00:00Z');
  const { blocks, totalWeeks, raceAnchors } = buildPhaseTimeline(goals, startDate, makeAthleteState());
  const rw = raceAnchors[0].planWeek;
  const week = buildWeek(rw, blockForWeek(blocks, rw), 300, goals, makeAthleteState(), undefined, {
    totalWeeks,
    raceAnchors,
    phaseBlocks: blocks,
  });
  const races = week.sessions.filter(
    (s) => s.type === 'race' && s.day === raceAnchors[0].dayName && s.serves_goal === 'a',
  );
  assertEquals(races.length, 1, `expected exactly one race session on the all-rest race week; got ${
    JSON.stringify(week.sessions.map((s) => ({ day: s.day, type: s.type })))
  }`);
  assertEquals(races[0].duration, 330, '70.3 distance-driven duration');
  // The hard-fail predicate must agree (no violation for the generated week).
  assertEquals(findMissingRaceDaySessions([week], raceAnchors), []);
});
