// Q-089 regression — the RUN path must emit TWO DISTINCT strength sessions (sessions[0] AND sessions[1]),
// not the same session twice. Before the fix, runStrength returned sessions[0] for every slot, so a
// 2×/week run-path strength week was a duplicate (e.g. 5×5 Workout A twice, no B). The tri path was
// already index-aware (covered by five-by-five-integration.test.ts) — this is the run-path guard that
// was missing. Run: ~/.deno/bin/deno test --no-check runstrength-session-index.test.ts
import { assertEquals, assert } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { buildPhaseTimeline, blockForWeek } from './phase-structure.ts';
import { buildWeek } from './week-builder.ts';
import type { AthleteState, GoalInput, GeneratedWeek } from './types.ts';

// A RUN-shaped athlete (single run goal → hasTri false → the runStrength dispatch), 5×5 strength, two
// optimizer strength slots (Tue session_index 0, Fri session_index 1).
function makeRunAthlete(): AthleteState {
  return {
    current_ctl: 50, weekly_hours_available: 8, loading_pattern: '3:1', limiter_sport: 'run',
    rest_days: [1], long_run_day: 0, run_quality_day: 3, bike_quality_day: 2, bike_easy_day: 3,
    training_intent: 'performance', tri_approach: 'race_peak',
    strength_intent: 'performance', strength_protocol: 'five_by_five', training_fitness: 'intermediate',
    strength_optimizer_slots: [
      { weekday: 'Tuesday', session_index: 0 },
      { weekday: 'Friday', session_index: 1 },
    ],
  } as unknown as AthleteState;
}

Deno.test('Q-089 — run-path 2×/week strength emits TWO DISTINCT sessions (not sessions[0] twice)', () => {
  const goals: GoalInput[] = [
    { id: 'r', event_name: 'A Marathon', event_date: '2026-09-13', distance: 'marathon', sport: 'run', priority: 'A' },
  ];
  const startDate = new Date('2026-05-18T12:00:00Z');
  const athlete = makeRunAthlete();
  const { blocks, totalWeeks, raceAnchors } = buildPhaseTimeline(goals, startDate, athlete);

  // a base-phase week is where strength frequency is 2 (two slots); build/race_specific are 1×.
  let baseWeek = -1;
  for (let w = 1; w <= totalWeeks; w++) {
    if (blockForWeek(blocks, w)?.phase === 'base') { baseWeek = w; break; }
  }
  assert(baseWeek > 0, 'plan must have a base-phase week');

  let prev = 400;
  let strengthNames: string[] = [];
  for (let w = 1; w <= totalWeeks; w++) {
    const wk = buildWeek(w, blockForWeek(blocks, w), prev, goals, athlete, undefined, {
      totalWeeks, raceAnchors, phaseBlocks: blocks,
    }) as unknown as GeneratedWeek;
    prev = (wk as unknown as { total_weighted_tss?: number }).total_weighted_tss ?? prev;
    if (w === baseWeek) {
      strengthNames = wk.sessions.filter((s: { type: string }) => s.type === 'strength').map((s: { name: string }) => s.name);
    }
  }

  assertEquals(strengthNames.length, 2, 'base-phase week must have 2 strength sessions');
  assertEquals(
    new Set(strengthNames).size, 2,
    `the 2 strength sessions must be DISTINCT (Q-089), got duplicates: ${strengthNames.join(', ')}`,
  );
});
