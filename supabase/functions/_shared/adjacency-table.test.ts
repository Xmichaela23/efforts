/**
 * THE ADJACENCY TABLE (docs/SPEC-week-solver.md §8.2).
 *
 * These pin the cells that were WRONG or MISSING before 2026-07-27, because every one of them was
 * found by reading a generated week rather than by reading the law:
 *   1. `lower_body_strength × long_run = 48h` — the one cell that actually constrains a week.
 *   2. `lower_body_strength × long_ride = 0h` — the contradiction. Two shipped rules said 0h and 48h
 *      about the same pair for two months.
 *   3. Everything the table calls free is free BY RATING, not by omission. A zero that nobody chose
 *      is how the empty cells got there in the first place.
 */
import { assert, assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import {
  ADJACENCY_HOURS,
  ADJACENCY_PENALTIES,
  adjacencyPenaltyReason,
  LEG_LOADED_KINDS,
  requiredAdjacencyHours,
  SAME_DAY_COMPATIBLE,
} from './schedule-session-constraints.ts';

Deno.test('the cell that does the work: heavy legs and the long run are 48h apart, both directions', () => {
  assertEquals(requiredAdjacencyHours('lower_body_strength', 'long_run'), 48);
  assertEquals(requiredAdjacencyHours('long_run', 'lower_body_strength'), 48);
});

Deno.test('a long ride costs the week nothing — its whole row is zero', () => {
  for (const k of LEG_LOADED_KINDS) {
    assertEquals(
      requiredAdjacencyHours('long_ride', k), 0,
      `long_ride -> ${k} should be free: a long ride is concentric, and the damage clearance is for damage`,
    );
  }
  // And the pair that contradicted itself for two months now agrees with the same-day matrix.
  assertEquals(requiredAdjacencyHours('lower_body_strength', 'long_ride'), 0);
  assertEquals(SAME_DAY_COMPATIBLE.lower_body_strength.long_ride, true);
});

Deno.test('quality work is 24h from heavy legs — shared movers, no damage load', () => {
  assertEquals(requiredAdjacencyHours('lower_body_strength', 'quality_run'), 24);
  assertEquals(requiredAdjacencyHours('lower_body_strength', 'quality_bike'), 24);
  assertEquals(requiredAdjacencyHours('quality_run', 'lower_body_strength'), 24);
});

Deno.test('a second heavy day needs the damage window', () => {
  assertEquals(requiredAdjacencyHours('lower_body_strength', 'lower_body_strength'), 48);
});

Deno.test('hours are symmetric — order lives in the penalty list, never in the grid', () => {
  for (const a of LEG_LOADED_KINDS) {
    for (const b of LEG_LOADED_KINDS) {
      assertEquals(
        ADJACENCY_HOURS[a][b], ADJACENCY_HOURS[b][a],
        `${a} -> ${b} disagrees with ${b} -> ${a}; muscle damage does not care which came first`,
      );
    }
  }
});

Deno.test('upper body and both swims constrain nothing — they have no row on purpose', () => {
  for (const k of LEG_LOADED_KINDS) {
    assertEquals(requiredAdjacencyHours('upper_body_strength', k), 0);
    assertEquals(requiredAdjacencyHours('easy_swim', k), 0);
    assertEquals(requiredAdjacencyHours('quality_swim', k), 0);
  }
});

Deno.test('easy rows are free — an easy run is the flush, not a second stimulus', () => {
  for (const k of LEG_LOADED_KINDS) {
    assertEquals(requiredAdjacencyHours('easy_run', k), 0, `easy_run -> ${k}`);
    assertEquals(requiredAdjacencyHours('easy_bike', k), 0, `easy_bike -> ${k}`);
  }
});

Deno.test('the two-running-days conflict is a PENALTY, not a clearance — the week stays buildable', () => {
  // Legal: an athlete really does run hard the day after a long run. It should cost, not throw.
  assertEquals(requiredAdjacencyHours('long_run', 'quality_run'), 0);
  assert(adjacencyPenaltyReason('long_run', 'quality_run'), 'long run -> hard run should be penalised');
  assert(adjacencyPenaltyReason('quality_run', 'long_run'), 'hard run -> long run should be penalised');
});

Deno.test('ride before run, never after — the one penalty that is directional', () => {
  assert(adjacencyPenaltyReason('long_run', 'long_ride'), 'a long ride on run-damaged legs is the costly order');
  assertEquals(adjacencyPenaltyReason('long_ride', 'long_run'), undefined, 'ride first is the free order');
});

Deno.test('the bike is never penalised beside a run — the §2.2 conflict is between two RUNNING sessions', () => {
  assertEquals(adjacencyPenaltyReason('long_run', 'quality_bike'), undefined);
  assertEquals(adjacencyPenaltyReason('quality_bike', 'long_run'), undefined);
  // And two hard days back to back stays with sequentialOk / enforceHardEasy — one ranking, not two.
  assertEquals(adjacencyPenaltyReason('quality_run', 'quality_bike'), undefined);
});

Deno.test('every penalty names a reason an athlete could read', () => {
  for (const p of ADJACENCY_PENALTIES) {
    assert(p.reason.length > 20, `${p.before} -> ${p.after} has no usable reason`);
  }
});
