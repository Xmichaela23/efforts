// 5×5 Cut 4 — integration: a five_by_five choice routes to 5×5 sessions via BOTH resolver paths
// (runStrength / Cut 1 + triathlonStrength→resolveTriCombinedStrengthProtocol / Cut 2), not durability,
// AND a 5×5 plan materializes end-to-end. Run:
//   ~/.deno/bin/deno test --no-check supabase/functions/generate-combined-plan/five-by-five-integration.test.ts
import { assertEquals, assert } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { runStrength, triathlonStrength } from './session-factory.ts';
import { buildPhaseTimeline, blockForWeek } from './phase-structure.ts';
import { buildWeek } from './week-builder.ts';
import type { AthleteState, GoalInput, GeneratedWeek } from './types.ts';

// A materialized 5×5 session is tagged protocol:five_by_five and named "5×5 Workout …".
const is5x5 = (s: any) =>
  (s.tags ?? []).includes('protocol:five_by_five') || String(s.name ?? '').includes('5×5');
const pctOf = (s: any) => Number(String(s.strength_exercises?.[0]?.weight ?? '0% 1RM').replace('% 1RM', ''));

// ── Direct resolver-path checks: the exact factory functions the week-builder dispatch calls ──
Deno.test('run path (runStrength / Cut 1) — five_by_five → a materialized 5×5 session, not durability', () => {
  const s = runStrength('Tuesday', 'base', 'g1', { strengthProtocolId: 'five_by_five', weekInPhase: 5, weekIndex: 5, totalWeeks: 16 });
  assertEquals(s.type, 'strength');
  assert(is5x5(s), `expected a 5×5 session, got "${s.name}"`);
  assert(s.strength_exercises?.some((e: any) => /squat/i.test(e.name) && e.sets === 5), '5×5 squat (5 sets) present');
});

Deno.test('tri path (triathlonStrength → resolveTriCombinedStrengthProtocol / Cut 2) — five_by_five → 5×5', () => {
  const s = triathlonStrength('Tuesday', 'base', 'g1', { strengthProtocolId: 'five_by_five', weekInPhase: 5, weekIndex: 5, totalWeeks: 16, sessionIndex: 0 });
  assertEquals(s.type, 'strength');
  assert(is5x5(s), `expected a 5×5 session, got "${s.name}"`);
});

Deno.test('control — no protocol → NOT 5×5 (run→durability, tri→triathlon); routing is gated on the choice', () => {
  const run = runStrength('Tuesday', 'base', 'g1', { weekInPhase: 5, weekIndex: 5, totalWeeks: 16 });
  const tri = triathlonStrength('Tuesday', 'base', 'g1', { weekInPhase: 5, weekIndex: 5, totalWeeks: 16, sessionIndex: 0 });
  assert(!is5x5(run), `default run strength must not be 5×5, got "${run.name}"`);
  assert(!is5x5(tri), `default tri strength must not be 5×5, got "${tri.name}"`);
});

Deno.test('Cut 4 curve reaches the materialized session — week-in-block load climbs (wk1=70 < wk8)', () => {
  const wk1 = runStrength('Tuesday', 'base', 'g1', { strengthProtocolId: 'five_by_five', weekInPhase: 1, weekIndex: 1, totalWeeks: 16 });
  const wk8 = runStrength('Tuesday', 'base', 'g1', { strengthProtocolId: 'five_by_five', weekInPhase: 8, weekIndex: 8, totalWeeks: 16 });
  assertEquals(pctOf(wk1), 70);
  assert(pctOf(wk8) > pctOf(wk1), `curve climbs into the session: wk1 ${pctOf(wk1)} → wk8 ${pctOf(wk8)}`);
});

// ── End-to-end: a 5×5 plan materializes through buildWeek (the tri dispatch path) ──
function makeTriAthlete(): AthleteState {
  return {
    current_ctl: 60, weekly_hours_available: 11, loading_pattern: '3:1', limiter_sport: 'run',
    rest_days: [1], long_run_day: 0, long_ride_day: 6, swim_easy_day: 1, swim_quality_day: 4,
    run_quality_day: 3, bike_quality_day: 2, bike_easy_day: 3,
    training_intent: 'performance', tri_approach: 'race_peak', strength_intent: 'performance',
    swim_intent: 'focus', training_fitness: 'intermediate',
    strength_protocol: 'five_by_five',
    strength_optimizer_slots: [
      { weekday: 'Tuesday', session_index: 0 },
      { weekday: 'Friday', session_index: 1 },
    ],
  } as unknown as AthleteState;
}

Deno.test('integration end-to-end — tri plan with strength_protocol=five_by_five → 5×5 strength reaches the plan, none durability', () => {
  const goals: GoalInput[] = [
    { id: 'a', event_name: 'A 70.3', event_date: '2026-09-13', distance: '70.3', sport: 'triathlon', priority: 'A' },
  ];
  const startDate = new Date('2026-05-18T12:00:00Z');
  const athlete = makeTriAthlete();
  const { blocks, totalWeeks, raceAnchors } = buildPhaseTimeline(goals, startDate, athlete);

  let prev = 500;
  const weeks: GeneratedWeek[] = [];
  for (let w = 1; w <= totalWeeks; w++) {
    const wk = buildWeek(w, blockForWeek(blocks, w), prev, goals, athlete, undefined, {
      totalWeeks, raceAnchors, phaseBlocks: blocks,
    }) as unknown as GeneratedWeek;
    prev = (wk as unknown as { total_weighted_tss?: number }).total_weighted_tss ?? prev;
    weeks.push(wk);
  }

  const strength = weeks.flatMap((w) => w.sessions).filter((s: any) => s.type === 'strength');
  assert(strength.length > 0, 'plan must emit strength sessions');
  const non5x5 = strength.filter((s: any) => !is5x5(s)).map((s: any) => s.name);
  assertEquals(non5x5.length, 0, `every strength session must be 5×5; found non-5×5: ${non5x5.slice(0, 3).join(', ')}`);
});
