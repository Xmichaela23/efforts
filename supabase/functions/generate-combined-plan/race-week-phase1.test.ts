/**
 * Race-week protocol — Phase 1 contract tests (§8.1 carriage + chronology guard).
 *
 * Phase 1 scope (RACE-WEEK-PROTOCOL.md §8.1, decision 2026-05-18):
 *   - RaceAnchor.priority populated priority-driven: 'A' → 'A', 'B'/'C' → 'B'.
 *   - Two-tri A/B is priority-driven, NOT calendar order.
 *   - Chronology guard: priority-A race not chronologically last → hard-fail
 *     (no silent mis-plan), instead of the prior calendar-order assumption.
 *   - PhaseBlock.race_week carriage (annotation only — no load-shaping consumer
 *     yet; that is Phase 3).
 *   - Valid configs (priority + chronology agree) are unchanged (regression).
 *
 * Run from repo root:
 *   deno test --no-check --no-lock --allow-all \
 *     supabase/functions/generate-combined-plan/race-week-phase1.test.ts
 */

import { assert, assertEquals, assertThrows } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { buildPhaseTimeline, blockForWeek } from './phase-structure.ts';
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
  };
}

const START = new Date('2026-05-11T12:00:00Z'); // Monday, plan week 1

// ── §8.1: RaceAnchor.priority is priority-driven ────────────────────────────

Deno.test('§8.1: RaceAnchor.priority — A→A, B→B (valid config: A chronologically last)', () => {
  const goals: GoalInput[] = [
    { id: 'b', event_name: 'B 70.3', event_date: '2026-08-15', distance: '70.3', sport: 'triathlon', priority: 'B' },
    { id: 'a', event_name: 'A 70.3', event_date: '2026-09-12', distance: '70.3', sport: 'triathlon', priority: 'A' },
  ];
  const { raceAnchors } = buildPhaseTimeline(goals, START, makeAthleteState());
  assertEquals(raceAnchors.find((x) => x.goalId === 'b')?.priority, 'B');
  assertEquals(raceAnchors.find((x) => x.goalId === 'a')?.priority, 'A');
});

Deno.test("§8.1: priority 'C' maps to 'B' on the anchor", () => {
  const goals: GoalInput[] = [
    { id: 'c', event_name: 'C tune-up 70.3', event_date: '2026-08-15', distance: '70.3', sport: 'triathlon', priority: 'C' },
    { id: 'a', event_name: 'A 70.3', event_date: '2026-09-12', distance: '70.3', sport: 'triathlon', priority: 'A' },
  ];
  const { raceAnchors } = buildPhaseTimeline(goals, START, makeAthleteState());
  assertEquals(raceAnchors.find((x) => x.goalId === 'c')?.priority, 'B');
  assertEquals(raceAnchors.find((x) => x.goalId === 'a')?.priority, 'A');
});

// ── §8.1: chronology guard (priority-driven, not calendar-order) ────────────

Deno.test('§8.1 chronology guard: priority-A race earlier than a B-race → hard-fail', () => {
  // Misconfigured: the priority-A race is chronologically FIRST, a B-race is LAST.
  // Prior calendar-order code would have silently treated the later B as the A
  // and mis-planned. The guard must throw instead.
  const goals: GoalInput[] = [
    { id: 'a', event_name: 'A 70.3', event_date: '2026-08-15', distance: '70.3', sport: 'triathlon', priority: 'A' },
    { id: 'b', event_name: 'B 70.3', event_date: '2026-09-12', distance: '70.3', sport: 'triathlon', priority: 'B' },
  ];
  assertThrows(
    () => buildPhaseTimeline(goals, START, makeAthleteState()),
    Error,
    '[race-week §8.1]',
  );
});

Deno.test('§8.1: no genuine A-priority tri → season-final tri is de-facto A, no throw (no regression)', () => {
  // Neither tri is genuinely priority A → no guard; the chronologically-last
  // tri is the de-facto A (prior calendar-order season-terminus behavior).
  const goals: GoalInput[] = [
    { id: 'b1', event_name: 'B 70.3', event_date: '2026-08-15', distance: '70.3', sport: 'triathlon', priority: 'B' },
    { id: 'b2', event_name: 'B2 70.3', event_date: '2026-09-12', distance: '70.3', sport: 'triathlon', priority: 'B' },
  ];
  const { raceAnchors } = buildPhaseTimeline(goals, START, makeAthleteState());
  assertEquals(raceAnchors.find((x) => x.goalId === 'b1')?.priority, 'B', 'earlier tri = B');
  assertEquals(raceAnchors.find((x) => x.goalId === 'b2')?.priority, 'A', 'season-final tri = de-facto A');
});

// ── §8.1 carriage: PhaseBlock.race_week + valid-config regression ───────────

Deno.test('§8.1 carriage: PhaseBlock.race_week tags the B and A race weeks; valid handoff unchanged', () => {
  const goals: GoalInput[] = [
    { id: 'g1', event_name: 'B 70.3', event_date: '2026-08-15', distance: '70.3', sport: 'triathlon', priority: 'B' },
    { id: 'g2', event_name: 'A 70.3', event_date: '2026-09-12', distance: '70.3', sport: 'triathlon', priority: 'A' },
  ];
  const { blocks, totalWeeks, raceAnchors } = buildPhaseTimeline(goals, START, makeAthleteState());

  // Valid config (priority + chronology agree) → unchanged: 18-week plan, A=g2.
  assertEquals(totalWeeks, 18);
  const bWeek = raceAnchors.find((x) => x.goalId === 'g1')!.planWeek; // 14
  const aWeek = raceAnchors.find((x) => x.goalId === 'g2')!.planWeek; // 18

  assertEquals(blockForWeek(blocks, bWeek).race_week, 'B', 'B-race week block tagged B');
  assertEquals(blockForWeek(blocks, aWeek).race_week, 'A', 'A-race week block tagged A');

  // A non-race week carries no race_week tag.
  assert(!blockForWeek(blocks, 2).race_week, 'non-race week has no race_week tag');
});
