/**
 * Race-week protocol — Phase 3 contract tests (§8.1/§8.2/§8.5 load-shaping).
 *
 * Phase 3 (RACE-WEEK-PROTOCOL.md §8, decisions 2026-05-18):
 *   - §8.2: the A-race taper is the FULL distance-driven width and is NEVER
 *     compressed. Backward allocation reserves it before rebuild grows.
 *   - §8.5: ≥1 rebuild week always exists between post-B recovery and the
 *     A-race; never B-recovery → A-base/taper directly.
 *   - Decision A: an infeasible B→A window hard-fails (covered in
 *     rebuild-phase.test.ts; asserted here too for the §8.2/§8.5 message).
 *   - Wide-window plans are unchanged (regression guard).
 *   - §8.1-B: 70.3-B taper is already 1wk (no-op); IM-B untouched (Decision B).
 *
 * Run from repo root:
 *   deno test --no-check --no-lock --allow-all \
 *     supabase/functions/generate-combined-plan/race-week-phase3.test.ts
 */

import { assert, assertEquals, assertThrows } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { buildPhaseTimeline, blockForWeek } from './phase-structure.ts';
import { taperWeeks } from './science.ts';
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
const START = new Date('2026-05-11T12:00:00Z');

// ── §8.2: the A-race taper is full width and never compressed ───────────────

Deno.test('§8.2: two-70.3 — A-taper is the FULL 2-week 70.3-A taper, not compressed to 1', () => {
  const goals: GoalInput[] = [
    { id: 'g1', event_name: 'B 70.3', event_date: '2026-08-15', distance: '70.3', sport: 'triathlon', priority: 'B' },
    { id: 'g2', event_name: 'A 70.3', event_date: '2026-09-12', distance: '70.3', sport: 'triathlon', priority: 'A' },
  ];
  const { blocks } = buildPhaseTimeline(goals, START, makeAthleteState());

  assertEquals(taperWeeks('70.3', 'A'), 2, 'sanity: 70.3-A taper is 2 weeks');

  // A-race = week 18 (per the rebuild-phase fixture geometry). The A-taper must
  // be exactly weeks 17–18 (full 2), NOT a single compressed week 18.
  assertEquals(blockForWeek(blocks, 18).phase, 'taper', 'wk18 A-taper');
  assertEquals(blockForWeek(blocks, 18).primaryGoalId, 'g2');
  assertEquals(blockForWeek(blocks, 17).phase, 'taper', 'wk17 A-taper (§8.2: full 2wk, not compressed)');
  assertEquals(blockForWeek(blocks, 17).primaryGoalId, 'g2');
  // Taper is EXACTLY 2 — week 16 must NOT also be taper (that would be 3, and
  // would mean rebuild got squeezed out instead of the base/RS remainder).
  assert(blockForWeek(blocks, 16).phase !== 'taper', 'A-taper is exactly 2 weeks (wk16 is not taper)');
});

// ── §8.5: ≥1 rebuild week always between recovery and the A-race ────────────

Deno.test('§8.5: exactly one rebuild week sits between post-B recovery and the A-race', () => {
  const goals: GoalInput[] = [
    { id: 'g1', event_name: 'B 70.3', event_date: '2026-08-15', distance: '70.3', sport: 'triathlon', priority: 'B' },
    { id: 'g2', event_name: 'A 70.3', event_date: '2026-09-12', distance: '70.3', sport: 'triathlon', priority: 'A' },
  ];
  const { blocks } = buildPhaseTimeline(goals, START, makeAthleteState());

  const rebuildBlocks = blocks.filter((b) => b.phase === 'rebuild');
  assert(rebuildBlocks.length >= 1, '§8.5: at least one rebuild block exists');

  // wk15 recovery → wk16 rebuild → never recovery directly into A base/taper.
  assertEquals(blockForWeek(blocks, 15).phase, 'recovery', 'wk15 post-B recovery');
  assertEquals(blockForWeek(blocks, 16).phase, 'rebuild', 'wk16 rebuild — the §8.5 bridge week');
  assertEquals(blockForWeek(blocks, 16).primaryGoalId, 'g2', 'rebuild serves the A-goal');
  assertEquals(blockForWeek(blocks, 16).tssMultiplier, 0.85);
});

// ── Decision A: infeasible window hard-fails with the §8.2/§8.5 message ─────

Deno.test('Decision A: B→A window too tight → hard-fail [race-week §8.2/§8.5]', () => {
  const goals: GoalInput[] = [
    { id: 'g1', event_name: 'B 70.3', event_date: '2026-08-15', distance: '70.3', sport: 'triathlon', priority: 'B' },
    { id: 'g2', event_name: 'A 70.3', event_date: '2026-08-29', distance: '70.3', sport: 'triathlon', priority: 'A' },
  ];
  assertThrows(
    () => buildPhaseTimeline(goals, START, makeAthleteState()),
    Error,
    '[race-week §8.2/§8.5]',
  );
});

// ── Regression: wide window (full-IM B → 70.3 A) is unchanged ──────────────

Deno.test('regression: wide window (IM-B → 70.3-A) still gets rebuild + full 2wk A-taper', () => {
  const goals: GoalInput[] = [
    { id: 'g1', event_name: 'B IM', event_date: '2026-08-29', distance: 'ironman', sport: 'triathlon', priority: 'B' },
    { id: 'g2', event_name: 'A 70.3', event_date: '2026-10-17', distance: '70.3', sport: 'triathlon', priority: 'A' },
  ];
  const { blocks } = buildPhaseTimeline(goals, START, makeAthleteState());

  assert(blocks.some((b) => b.phase === 'rebuild'), 'wide window still emits a rebuild block');
  // A-race week = last week; its block + the one before are the full 2-week taper.
  const aWeek = Math.max(...blocks.map((b) => b.endWeek));
  assertEquals(blockForWeek(blocks, aWeek).phase, 'taper', 'A-race week is taper');
  assertEquals(blockForWeek(blocks, aWeek - 1).phase, 'taper', 'full 2-week A-taper preserved on wide windows');
  assertEquals(blockForWeek(blocks, aWeek).primaryGoalId, 'g2');
});
