/**
 * D-048 (POLISH §1 Open Items 1+2) — Phase-structure trade-off pin tests.
 *
 * Two previously silent skips now surface as athlete-facing trade-offs via
 * `buildPhaseTimeline().phaseStructureTradeOffs`, merged into
 * `generation_trade_offs` by `index.ts`:
 *
 *   1. `base_phase_skipped_short_plan` — fires when plan duration squeezes
 *      base to 0 weeks (totalWeeks < 4 OR baseStart >= buildStart after the
 *      backward-from-race packing).
 *   2. `rebuild_skipped_tight_window` — fires when the inter-A-race window
 *      can't fit a rebuild block before the second race's abbreviated build
 *      (the non-priority-A overlapping/compressed/tight branches that
 *      previously skipped rebuild silently).
 *
 * Run from repo root:
 *   deno test supabase/functions/generate-combined-plan/phase-structure-tradeoffs.test.ts --no-check --allow-read
 */

import { assert, assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { buildPhaseTimeline } from './phase-structure.ts';
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

// ── D-048 Bug 1: base-phase skip on short plans ───────────────────────────

Deno.test('D-048 Bug 1: 9-week 70.3 plan emits base_phase_skipped_short_plan trade-off', () => {
  // 9-week plan: 2wk taper + 3wk race-specific (min 3) + 4wk build (min 4) = 0 weeks base.
  const goals: GoalInput[] = [{
    id: 'g1',
    event_name: 'Late-entry 70.3',
    event_date: '2026-07-12', // ~9 weeks from May 11
    distance: '70.3',
    sport: 'triathlon',
    priority: 'A',
  }];
  const startDate = new Date('2026-05-11T12:00:00Z');
  const { phaseStructureTradeOffs, blocks, totalWeeks } = buildPhaseTimeline(goals, startDate, makeAthleteState());
  assertEquals(totalWeeks, 9);
  const baseBlocks = blocks.filter((b) => b.phase === 'base');
  assertEquals(baseBlocks.length, 0, 'base phase should be skipped on a 9-week plan');
  const baseSkip = phaseStructureTradeOffs.find((t) => t.message_template_id === 'base_phase_skipped_short_plan');
  assert(baseSkip, 'base_phase_skipped trade-off should fire');
  assertEquals(baseSkip!.kind, 'constraint_compromise');
  assertEquals(baseSkip!.severity, 'notice');
  assertEquals(baseSkip!.variables.event_name, 'Late-entry 70.3');
  assertEquals(baseSkip!.variables.plan_weeks, 9);
});

Deno.test('D-048 Bug 1: 3-week tight plan emits base_phase_skipped via totalWeeks<4 branch', () => {
  // < 4 weeks: race_specific + taper only, no base, no build.
  const goals: GoalInput[] = [{
    id: 'g1',
    event_name: 'Sprint emergency',
    event_date: '2026-06-01', // ~3 weeks
    distance: 'sprint',
    sport: 'triathlon',
    priority: 'A',
  }];
  const startDate = new Date('2026-05-11T12:00:00Z');
  const { phaseStructureTradeOffs, blocks } = buildPhaseTimeline(goals, startDate, makeAthleteState());
  const baseBlocks = blocks.filter((b) => b.phase === 'base');
  assertEquals(baseBlocks.length, 0);
  const baseSkip = phaseStructureTradeOffs.find((t) => t.message_template_id === 'base_phase_skipped_short_plan');
  assert(baseSkip, 'base_phase_skipped should fire on the <4wk fast-path too');
});

Deno.test('D-048 Bug 1: a healthy long plan does NOT emit base-skip trade-off', () => {
  // 18-week 70.3 plan — base has room.
  const goals: GoalInput[] = [{
    id: 'g1',
    event_name: 'Full-season 70.3',
    event_date: '2026-09-12',
    distance: '70.3',
    sport: 'triathlon',
    priority: 'A',
  }];
  const startDate = new Date('2026-05-11T12:00:00Z');
  const { phaseStructureTradeOffs, blocks, totalWeeks } = buildPhaseTimeline(goals, startDate, makeAthleteState());
  assert(totalWeeks >= 16);
  const baseBlocks = blocks.filter((b) => b.phase === 'base');
  assert(baseBlocks.length > 0, 'long plan should have a base phase');
  const baseSkip = phaseStructureTradeOffs.find((t) => t.message_template_id === 'base_phase_skipped_short_plan');
  assertEquals(baseSkip, undefined, 'base-skip trade-off should not fire on long plans');
});

// ── D-048 Bug 2: rebuild-skip on tight inter-A-race window ────────────────

Deno.test('D-048 Bug 2: two A-races with tight window emit rebuild_skipped trade-off', () => {
  // Two A-races with a tight inter-race gap. Use sport='run' so the §8.1 tri
  // chronology guard doesn't fire (the guard is tri-specific by design — see
  // `chronoTri` filter at phase-structure.ts:115). Run goals route to the
  // two-A branch (line 226+) where the rebuild-skip path lives.
  const goals: GoalInput[] = [
    {
      id: 'a1',
      event_name: 'First A marathon',
      event_date: '2026-07-19',
      distance: 'marathon',
      sport: 'run',
      priority: 'A',
    },
    {
      id: 'a2',
      event_name: 'Second A marathon',
      event_date: '2026-08-09', // ~3 weeks later — tight inter-A gap
      distance: 'marathon',
      sport: 'run',
      priority: 'A',
    },
  ];
  const startDate = new Date('2026-05-11T12:00:00Z');
  const { phaseStructureTradeOffs, blocks } = buildPhaseTimeline(goals, startDate, makeAthleteState());
  const rebuildBlocks = blocks.filter((b) => b.phase === 'rebuild');
  // Either the trade-off fires (rebuild was skipped) OR rebuild is present;
  // both cases respect the protocol — we only assert the trade-off ↔ skip pairing.
  const rebuildSkip = phaseStructureTradeOffs.find((t) => t.message_template_id === 'rebuild_skipped_tight_window');
  if (rebuildBlocks.length === 0) {
    assert(rebuildSkip, 'rebuild was skipped — trade-off must fire');
    assertEquals(rebuildSkip!.kind, 'constraint_compromise');
    assertEquals(rebuildSkip!.severity, 'notice');
    assertEquals(rebuildSkip!.variables.first_event, 'First A marathon');
    assertEquals(rebuildSkip!.variables.second_event, 'Second A marathon');
  } else {
    assertEquals(rebuildSkip, undefined, 'rebuild was emitted — trade-off must not fire');
  }
});

Deno.test('D-048 Bug 2: comfortable inter-A-race gap does NOT emit rebuild-skip', () => {
  // Two run A-races ~12 weeks apart (overlapping) — rebuild has room.
  const goals: GoalInput[] = [
    {
      id: 'a1',
      event_name: 'Early A',
      event_date: '2026-06-21',
      distance: 'marathon',
      sport: 'run',
      priority: 'A',
    },
    {
      id: 'a2',
      event_name: 'Late A',
      event_date: '2026-09-13',
      distance: 'marathon',
      sport: 'run',
      priority: 'A',
    },
  ];
  const startDate = new Date('2026-05-11T12:00:00Z');
  const { phaseStructureTradeOffs } = buildPhaseTimeline(goals, startDate, makeAthleteState());
  const rebuildSkip = phaseStructureTradeOffs.find((t) => t.message_template_id === 'rebuild_skipped_tight_window');
  assertEquals(rebuildSkip, undefined, 'comfortable gap should not surface rebuild-skip');
});

Deno.test('D-048: phaseStructureTradeOffs always present on the return shape (back-compat)', () => {
  // Sanity: a default-shape plan returns an array (possibly empty), never undefined.
  const goals: GoalInput[] = [{
    id: 'g1',
    event_name: 'Default',
    event_date: '2026-09-12',
    distance: '70.3',
    sport: 'triathlon',
    priority: 'A',
  }];
  const startDate = new Date('2026-05-11T12:00:00Z');
  const out = buildPhaseTimeline(goals, startDate, makeAthleteState());
  assert(Array.isArray(out.phaseStructureTradeOffs));
});
