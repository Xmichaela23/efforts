// D-210 Cut 3 — the maintain clamp + the §3 collapse, tested on getBaseDistribution directly.
// Run: ~/.deno/bin/deno test --no-check supabase/functions/generate-combined-plan/posture-distribution.test.ts
import { assertEquals, assert, assertAlmostEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { getBaseDistribution, effectiveDisciplinePosture } from './science.ts';
import { buildPhaseTimeline, blockForWeek } from './phase-structure.ts';
import { buildWeek } from './week-builder.ts';
import { validatePlan } from './validator.ts';
import type { AthleteState, GoalInput, GeneratedWeek, PerDisciplinePosture } from './types.ts';

const sum = (d: Record<string, number>) => Object.values(d).reduce((a, b) => a + (b || 0), 0);
// shorthand: tri 70.3, no limiter/swim shift, at the given phase + posture
const dist = (phase: any, posture?: any) =>
  getBaseDistribution('triathlon', '70.3', undefined, undefined, undefined, phase, posture);

Deno.test('effectiveDisciplinePosture — collapses at every terminal; absent → {}', () => {
  assertEquals(effectiveDisciplinePosture({ bike: 'maintain' }, 'build'), { bike: 'maintain' });
  assertEquals(effectiveDisciplinePosture({ bike: 'maintain' }, 'race_specific'), { bike: 'maintain' });
  assertEquals(effectiveDisciplinePosture({ bike: 'maintain' }, 'taper'), {});      // §3 collapse
  assertEquals(effectiveDisciplinePosture({ bike: 'maintain' }, 'recovery'), {});   // §3 collapse
  assertEquals(effectiveDisciplinePosture({ bike: 'maintain' }, 'rebuild'), {});    // §3 collapse
  assertEquals(effectiveDisciplinePosture({ bike: 'maintain' }, 'retest'), {});     // §3 collapse (D-213 Cut 4)
  assertEquals(effectiveDisciplinePosture(undefined, 'build'), {});                 // absent ≡ all-develop
  // D-210 Cut 4: 'out' is a PRESENCE flag — it persists at terminals (maintain collapses to develop, out does not).
  assertEquals(effectiveDisciplinePosture({ swim: 'out' }, 'taper'), { swim: 'out' });
  assertEquals(effectiveDisciplinePosture({ swim: 'out', bike: 'maintain' }, 'taper'), { swim: 'out' }); // bike→develop, swim stays out
});

Deno.test('out flag — 0 share; freed budget redistributes zero-sum to the develop set (excl. out)', () => {
  const base = dist('build');
  const out  = dist('build', { swim: 'out' });
  assert(base.swim > 0, 'precondition: tri 70.3 base swim > 0');
  assertEquals(out.swim, 0);                              // out → 0 share
  assertAlmostEquals(sum(out), sum(base), 1e-9);          // zero-sum: total preserved
  assert(out.run > base.run, 'run (develop) claims freed budget');
  assert(out.bike > base.bike, 'bike (develop) claims freed budget');
});

Deno.test('maintain clamp — discipline drops to its floor; freed budget redistributes zero-sum', () => {
  const base  = dist('build');
  const maint = dist('build', { bike: 'maintain' });
  assert(base.bike > 0.12, 'precondition: tri 70.3 base bike > the 0.12 floor');
  assertAlmostEquals(maint.bike, 0.12, 1e-9);                 // clamped to MAINTENANCE_FLOORS.bike.pct
  assertAlmostEquals(sum(maint), sum(base), 1e-9);            // zero-sum: total preserved
  assert(maint.run > base.run, 'run (develop) claims freed budget');
  assert(maint.swim > base.swim, 'swim (develop) claims freed budget');
});

Deno.test('maintain clamp — §3 collapse: maintain is ignored at a terminal block', () => {
  const base = dist('build');
  const taperMaint = dist('taper', { bike: 'maintain' });    // collapsed → all-develop → NOT clamped
  assertEquals(taperMaint.bike, base.bike);
});

Deno.test('default (absent posture) is byte-parity with the no-posture call', () => {
  assertEquals(dist('build'), dist('build', undefined));
});

// ── Integration: out flag end-to-end through the generator (D-210 Cut 4) ─────
function makeTriAthlete(posture?: PerDisciplinePosture): AthleteState {
  return {
    current_ctl: 60, weekly_hours_available: 11, loading_pattern: '3:1', limiter_sport: 'run',
    rest_days: [1], long_run_day: 0, long_ride_day: 6, swim_easy_day: 1, swim_quality_day: 4,
    run_quality_day: 3, bike_quality_day: 2, bike_easy_day: 3,
    training_intent: 'performance', tri_approach: 'race_peak', strength_intent: 'performance',
    swim_intent: 'focus', training_fitness: 'intermediate',
    per_discipline_posture: posture,
  } as AthleteState;
}

Deno.test('integration — tri plan with swim:out → 0 swim share, 0 swim sessions, validates', () => {
  const goals: GoalInput[] = [
    { id: 'a', event_name: 'A 70.3', event_date: '2026-09-13', distance: '70.3', sport: 'triathlon', priority: 'A' },
  ];
  const startDate = new Date('2026-05-18T12:00:00Z');
  const athlete = makeTriAthlete({ swim: 'out' });
  const { blocks, totalWeeks, raceAnchors } = buildPhaseTimeline(goals, startDate, athlete);

  // (1) 0 swim share on EVERY block — out persists across phases incl. taper
  for (const b of blocks) {
    assertEquals(b.sportDistribution.swim ?? 0, 0, `block ${b.phase}@w${b.startWeek}: swim share must be 0`);
  }

  // build the whole plan through buildWeek
  let prev = 500;
  const weeks: GeneratedWeek[] = [];
  for (let w = 1; w <= totalWeeks; w++) {
    const wk = buildWeek(w, blockForWeek(blocks, w), prev, goals, athlete, undefined, {
      totalWeeks, raceAnchors, phaseBlocks: blocks,
    }) as unknown as GeneratedWeek;
    prev = (wk as unknown as { total_weighted_tss?: number }).total_weighted_tss ?? prev;
    weeks.push(wk);
  }

  // (2) 0 swim sessions across the entire plan
  const swimSessions = weeks.flatMap((w) => w.sessions).filter((s) => s.type === 'swim');
  assertEquals(swimSessions.length, 0, 'swim:out must emit zero swim sessions plan-wide');

  // (3) it validates — the out swim is exempt from the session floor (would FAIL without Cut 4)
  const validation = validatePlan(
    weeks, blocks, athlete.current_ctl, athlete.weekly_hours_available,
    athlete.loading_pattern, true /* hasTriGoal */, undefined, athlete.per_discipline_posture,
  );
  assertEquals(validation.maintenance_floors_met, true, 'out swim must be exempt from the maintenance floor');

  // sanity — develop disciplines still produce sessions (not an empty/broken plan)
  assert(weeks.flatMap((w) => w.sessions).filter((s) => s.type === 'run').length > 0, 'run (develop) must still have sessions');
  assert(weeks.flatMap((w) => w.sessions).filter((s) => s.type === 'bike').length > 0, 'bike (develop) must still have sessions');
});
