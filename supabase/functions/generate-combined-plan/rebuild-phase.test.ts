/**
 * Rebuild-phase contract tests.
 *
 * Closes the post-B-race regression where strength loads, swim ceilings, and long-day floors
 * silently reset to base-week-1 values after a recovery block, because the next goal's `base`
 * phase had no way to encode "we're ramping back from a race." The architectural fix introduces
 * an explicit `rebuild` phase emitted by `phase-structure.ts:insertRebuildBlock` between
 * recovery and the next goal's abbreviated cycle. Consumers (science.ts long-day floors,
 * swim-protocol-volumes bands, triathlon_performance strength dispatcher) read `phase === 'rebuild'`
 * and apply pre-race phase × 0.85 (or +5%/wk ramp) instead of fresh-start values.
 *
 * Run from repo root:
 *   deno test --no-lock --allow-all supabase/functions/generate-combined-plan/rebuild-phase.test.ts
 */

import { assert, assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { buildPhaseTimeline, blockForWeek } from './phase-structure.ts';
import { BRICKS_PER_WEEK, longRideFloorHours, longRunFloorMiles } from './science.ts';
import { getProtocolVolumeBand, normalizePhaseToSwimProtocolBand } from './swim-protocol-volumes.ts';
import { triathlonPerformanceProtocol } from '../shared/strength-system/protocols/triathlon_performance.ts';
import type { ProtocolContext, IntentSession } from '../shared/strength-system/protocols/types.ts';
import type { AthleteState, GoalInput, PhaseBlock } from './types.ts';

function makeAthleteState(): AthleteState {
  return {
    current_ctl: 60,
    weekly_hours_available: 10,
    loading_pattern: '3:1',
    limiter_sport: 'run',
    rest_days: [1],
    long_run_day: 0, // Sunday
    long_ride_day: 6, // Saturday
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

// ── §1 phase-structure: rebuild emission post-B-race ────────────────────────

Deno.test('rebuild emission: 18-week plan with B-race week 14 + A-race week 18 emits rebuild block', () => {
  const goals: GoalInput[] = [
    {
      id: 'g1',
      event_name: 'B-race 70.3',
      event_date: '2026-08-15', // Saturday — week 14 of plan starting 2026-05-11
      distance: '70.3',
      sport: 'triathlon',
      priority: 'B',
    },
    {
      id: 'g2',
      event_name: 'A-race 70.3',
      event_date: '2026-09-12', // Saturday — week 18
      distance: '70.3',
      sport: 'triathlon',
      priority: 'A',
    },
  ];
  const startDate = new Date('2026-05-11T12:00:00Z'); // Monday week 1
  const { blocks, totalWeeks } = buildPhaseTimeline(goals, startDate, makeAthleteState());
  assertEquals(totalWeeks, 18);

  const w14 = blockForWeek(blocks, 14);
  const w15 = blockForWeek(blocks, 15);
  const w16 = blockForWeek(blocks, 16);
  const w17 = blockForWeek(blocks, 17);
  const w18 = blockForWeek(blocks, 18);

  // Week 14: race week (g1 anchor — taper or race_specific)
  assertEquals(w14.primaryGoalId, 'g1', 'week 14 should serve g1 (B-race)');

  // Week 15: recovery, weeksSinceRaceIncludingRebuild = 1
  assertEquals(w15.phase, 'recovery', 'week 15 should be recovery post-B-race');
  assertEquals(w15.isRecovery, true);
  assertEquals(w15.weeksSinceRaceIncludingRebuild, 1);
  assertEquals(w15.primaryGoalId, 'g1', 'recovery still tagged to the race that just finished');

  // Weeks 16-17: rebuild for g2, weeksSinceRaceIncludingRebuild = 2, 3
  assertEquals(w16.phase, 'rebuild', 'week 16 should be rebuild (post-recovery ramp)');
  assertEquals(w16.isRecovery, false);
  assertEquals(w16.primaryGoalId, 'g2', 'rebuild serves the next goal');
  assertEquals(w16.weeksSinceRaceIncludingRebuild, 2);
  assertEquals(w16.tssMultiplier, 0.85);

  assertEquals(w17.phase, 'rebuild', 'week 17 should be rebuild week 2');
  assertEquals(w17.weeksSinceRaceIncludingRebuild, 3);

  // Week 18: taper for g2
  assertEquals(w18.phase, 'taper', 'week 18 should be taper for the A-race');
  assertEquals(w18.primaryGoalId, 'g2');
});

Deno.test('rebuild emission: short post-B-race window (2 weeks) skips rebuild — leaves room for taper', () => {
  // B-race week 14, A-race week 16. Window after recovery = 1 week → not enough for rebuild + taper.
  // Rebuild = 0; abbreviated block fills the window directly.
  const goals: GoalInput[] = [
    {
      id: 'g1',
      event_name: 'B-race 70.3',
      event_date: '2026-08-15',
      distance: '70.3',
      sport: 'triathlon',
      priority: 'B',
    },
    {
      id: 'g2',
      event_name: 'A-race 70.3',
      event_date: '2026-08-29', // 2 weeks after B-race
      distance: '70.3',
      sport: 'triathlon',
      priority: 'A',
    },
  ];
  const startDate = new Date('2026-05-11T12:00:00Z');
  const { blocks } = buildPhaseTimeline(goals, startDate, makeAthleteState());
  const rebuildWeeks = blocks.filter((b) => b.phase === 'rebuild');
  assertEquals(rebuildWeeks.length, 0, 'tight schedule should not insert rebuild');
});

Deno.test('rebuild emission: sequential non-tri A-races (full new macrocycle) do NOT get rebuild — base IS the ramp', () => {
  // For non-tri sequential A-races > 16 weeks apart, `buildPhaseTimeline` calls
  // `buildSingleEventBlocks` (full macrocycle) for the second goal — not `buildAbbreviatedBlocks`.
  // No rebuild is needed because the second goal's base IS the post-race ramp.
  // (Tri goals always go through the chronoTri abbreviated branch, which DOES emit rebuild —
  // covered by the 18-week B-race test above.)
  const goals: GoalInput[] = [
    {
      id: 'g1',
      event_name: 'Marathon A',
      event_date: '2026-08-15',
      distance: 'marathon',
      sport: 'run',
      priority: 'A',
    },
    {
      id: 'g2',
      event_name: 'Marathon B',
      event_date: '2027-01-15', // > 16 weeks later — classifies as sequential
      distance: 'marathon',
      sport: 'run',
      priority: 'A',
    },
  ];
  const startDate = new Date('2026-05-11T12:00:00Z');
  const { blocks } = buildPhaseTimeline(goals, startDate, makeAthleteState());
  const rebuildWeeks = blocks.filter((b) => b.phase === 'rebuild');
  assertEquals(rebuildWeeks.length, 0, 'sequential non-tri A-races should not insert rebuild — second cycle is fresh base');
});

Deno.test('rebuild emission: weeksSinceRaceIncludingRebuild is monotonic across recovery → rebuild', () => {
  // Verify the running counter is consistent. Recovery weeks 1, 2, …; rebuild continues 3, 4, …
  const goals: GoalInput[] = [
    {
      id: 'g1',
      event_name: 'B-race full IM',
      event_date: '2026-08-29', // week 16 of plan (full IM has longer recovery)
      distance: 'full',
      sport: 'triathlon',
      priority: 'B',
    },
    {
      id: 'g2',
      event_name: 'A-race 70.3',
      event_date: '2026-10-17', // ~7 weeks later — gives room for recovery + rebuild + abbreviated
      distance: '70.3',
      sport: 'triathlon',
      priority: 'A',
    },
  ];
  const startDate = new Date('2026-05-11T12:00:00Z');
  const { blocks } = buildPhaseTimeline(goals, startDate, makeAthleteState());
  const recoveryAndRebuild = blocks
    .filter((b) => b.phase === 'recovery' || b.phase === 'rebuild')
    .sort((a, b) => a.startWeek - b.startWeek);

  for (let i = 1; i < recoveryAndRebuild.length; i++) {
    const prev = recoveryAndRebuild[i - 1].weeksSinceRaceIncludingRebuild ?? 0;
    const cur = recoveryAndRebuild[i].weeksSinceRaceIncludingRebuild ?? 0;
    assert(
      cur > prev,
      `weeksSinceRaceIncludingRebuild should be monotonic across recovery → rebuild — got ${prev} → ${cur} between weeks ${recoveryAndRebuild[i - 1].startWeek} and ${recoveryAndRebuild[i].startWeek}`,
    );
  }
});

// ── §2 science.ts: long-day floors honor rebuild ────────────────────────────

Deno.test('long-run floor: 70.3 rebuild = 9.5mi (continues build progression, not base reset)', () => {
  // Pre-race build was 9.5mi (11 × 0.85). Rebuild reads through build multiplier so the long-run
  // ramp continues post-race instead of dropping to 8.5mi (base × 0.75).
  assertEquals(longRunFloorMiles('70.3', 'rebuild'), 9.5);
});

Deno.test('long-ride floor: 70.3 rebuild = 2.5h (continues build progression)', () => {
  // Pre-race build was 2.5h (3 × 0.85). Rebuild = 2.5h, not 0 (taper/recovery sentinel).
  assertEquals(longRideFloorHours('70.3', 'rebuild'), 2.5);
});

Deno.test('long-run floor: rebuild uses build-equivalent multiplier across distances', () => {
  // Sanity — rebuild multiplier 0.85 should match build multiplier 0.85 for each distance.
  assertEquals(longRunFloorMiles('sprint', 'rebuild'), longRunFloorMiles('sprint', 'build'));
  assertEquals(longRunFloorMiles('olympic', 'rebuild'), longRunFloorMiles('olympic', 'build'));
  assertEquals(longRunFloorMiles('70.3', 'rebuild'), longRunFloorMiles('70.3', 'build'));
  assertEquals(longRunFloorMiles('ironman', 'rebuild'), longRunFloorMiles('ironman', 'build'));
});

Deno.test('long-ride floor: rebuild uses build-equivalent multiplier; distinct from taper/recovery sentinel 0', () => {
  assertEquals(longRideFloorHours('70.3', 'rebuild'), longRideFloorHours('70.3', 'build'));
  // Confirm it is NOT 0 (which would mean "skipped phase" — wrong for rebuild).
  assert(longRideFloorHours('70.3', 'rebuild') > 0);
});

// ── §3 swim-protocol-volumes: rebuild bands = race_specific × 0.85 ──────────

Deno.test('swim band: 70.3 intermediate rebuild = race_specific × 0.85', () => {
  const rs = getProtocolVolumeBand('70.3', 'intermediate', 'race_specific');
  const reb = getProtocolVolumeBand('70.3', 'intermediate', 'rebuild');
  assert(rs && reb, 'both bands must exist');
  assertEquals(reb.min, Math.round(rs.min * 0.85));
  assertEquals(reb.max, Math.round(rs.max * 0.85));
});

Deno.test('swim band: rebuild reads through race_specific via normalizePhaseToSwimProtocolBand', () => {
  assertEquals(normalizePhaseToSwimProtocolBand('rebuild'), 'race_specific');
});

Deno.test('swim band: rebuild yardage continues pre-race ramp, not base week-1 reset', () => {
  // Concrete bug-reproduction guard: rebuild yards should sit ABOVE base yards (continuity)
  // rather than dropping to base values (silent regression).
  const baseBand = getProtocolVolumeBand('70.3', 'intermediate', 'base');
  const rebuildBand = getProtocolVolumeBand('70.3', 'intermediate', 'rebuild');
  assert(baseBand && rebuildBand);
  // race_specific intermediate 70.3: min 2400, max 3400 → rebuild 2040, 2890.
  // base intermediate 70.3: min 2000, max 2800.
  // Rebuild min (2040) should be ≥ base min (2000) — at least continuity, not regression.
  assert(
    rebuildBand.min >= baseBand.min,
    `rebuild min (${rebuildBand.min}) should be ≥ base min (${baseBand.min}) — otherwise post-race ramp regresses`,
  );
});

// ── §4 strength: rebuild dispatcher scales %1RM strings ────────────────────

function rebuildContext(weekInPhase: number): ProtocolContext {
  return {
    weekIndex: 16,
    weekInPhase,
    phase: { name: 'Rebuild', start_week: 1, end_week: 4, weeks_in_phase: 4 },
    totalWeeks: 18,
    isRecovery: false,
    primarySchedule: {
      longSessionDays: ['Sunday'],
      qualitySessionDays: ['Wednesday'],
      easySessionDays: ['Friday'],
    },
    userBaselines: {
      squat1RM: 200,
      deadlift1RM: 250,
      bench1RM: 150,
      overhead1RM: 100,
      equipment: 'commercial_gym',
      equipmentTier: 'full_barbell',
      hasCable: true,
      hasGHD: false,
      hasKettlebell: false,
      hasPullUpBar: true,
      hasBench: true,
      hasBox: true,
    },
    strengthFrequency: 2,
    constraints: {},
    triathlonContext: {
      strengthIntent: 'performance',
      limiterSport: 'run',
      disciplineEmphasis: 'balanced',
    },
  };
}

function findExerciseWeight(session: IntentSession, namePattern: RegExp): string | null {
  const ex = session.exercises.find((e) => namePattern.test(e.name));
  if (!ex) return null;
  return typeof ex.weight === 'string' ? ex.weight : null;
}

Deno.test('strength rebuild week 1: %1RM scaled to 0.90× of build (e.g., 80% → 72%)', () => {
  const sessions = triathlonPerformanceProtocol.createWeekSessions(rebuildContext(1));
  // Lower session: Conventional Deadlift in build is 80% 1RM. Rebuild week 1 → 80 × 0.90 = 72.
  const lower = sessions.find((s) => /Lower/i.test(s.name));
  assert(lower, `expected a lower-body rebuild session — got ${sessions.map((s) => s.name).join(', ')}`);
  const dl = findExerciseWeight(lower, /Deadlift/i);
  assert(dl, `expected deadlift weight string — got ${JSON.stringify(lower.exercises.map((e) => e.name))}`);
  assertEquals(dl, '72% 1RM');
  const sq = findExerciseWeight(lower, /Squat/i);
  // Squat in build is 78% 1RM. Rebuild week 1 → 78 × 0.90 = 70.2 → 70.
  assertEquals(sq, '70% 1RM');
});

Deno.test('strength rebuild week 2: ramp +5% (e.g., 80% × 0.95 = 76%)', () => {
  const sessions = triathlonPerformanceProtocol.createWeekSessions(rebuildContext(2));
  const lower = sessions.find((s) => /Lower/i.test(s.name));
  assert(lower);
  const dl = findExerciseWeight(lower, /Deadlift/i);
  // 80 × 0.95 = 76.
  assertEquals(dl, '76% 1RM');
  // Squat: 78 × 0.95 = 74.1 → 74.
  const sq = findExerciseWeight(lower, /Squat/i);
  assertEquals(sq, '74% 1RM');
});

Deno.test('strength rebuild: session name + tags reflect rebuild semantics, not "Build"', () => {
  const sessions = triathlonPerformanceProtocol.createWeekSessions(rebuildContext(1));
  for (const s of sessions) {
    assert(!/^.*— Strength Build/i.test(s.name), `expected rename — got ${s.name}`);
    assert(/Rebuild/i.test(s.name), `expected Rebuild in name — got ${s.name}`);
    assert(s.tags.includes('phase:rebuild'), `expected phase:rebuild tag — got ${s.tags.join(', ')}`);
    assert(!s.tags.some((t) => t === 'phase:build'), 'phase:build tag should be replaced');
  }
});

Deno.test('strength rebuild: bug reproducer — pre-fix would emit base hypertrophy 65% loads at week 16', () => {
  // Concrete reproduction of the Push Press / Trap Bar regression. Pre-fix, week 16 for the next
  // goal landed in `base` phase week 1, which `perfBaseLower` reads as 65% 1RM (e.g., 200 × 0.65
  // = 130lb deadlift). With rebuild week 1 (this fix), deadlift = 80 × 0.90 = 72% 1RM
  // (200 × 0.72 = 144lb) — preserving more of the pre-race build progression.
  const sessions = triathlonPerformanceProtocol.createWeekSessions(rebuildContext(1));
  const lower = sessions.find((s) => /Lower/i.test(s.name))!;
  const dl = findExerciseWeight(lower, /Deadlift/i)!;
  const dlPct = Number(dl.match(/(\d+)%/)?.[1]);
  // Must be > 65% (pre-fix base value). Rebuild week 1 lands at 72%.
  assert(dlPct > 65, `rebuild deadlift % (${dlPct}) must exceed pre-fix base value (65%)`);
});

// ── §4b regression: ReRebuild rename bug ────────────────────────────────────

Deno.test('strength rebuild: session name is "Rebuild" (Lower/Upper), not "ReRebuild"', () => {
  // Bug: case-insensitive `.replace(/Build/gi, 'Rebuild')` after a first `Strength Build →
  // Rebuild` replace was matching "build" *inside* the already-renamed "Rebuild", producing
  // "ReRebuild". The second replace was redundant (perfBuildLower / perfBuildUpper both emit
  // "Strength Build" so the first replace handles them). Dropped the second replace.
  for (const wip of [1, 2]) {
    const sessions = triathlonPerformanceProtocol.createWeekSessions(rebuildContext(wip));
    for (const s of sessions) {
      assert(
        !/Re ?Rebuild/i.test(s.name),
        `session name leaked double prefix — got "${s.name}" for wip=${wip}`,
      );
      assert(
        /Tri Performance — Rebuild \((Lower|Upper)\)/.test(s.name),
        `expected clean "Tri Performance — Rebuild (Lower|Upper)" — got "${s.name}"`,
      );
    }
  }
});

// ── §4c regression: description matches delivered loads ────────────────────

Deno.test('strength rebuild: description text quotes the actually-emitted %1RM, not the factor', () => {
  // Bug: previously description text was generated from `Math.round(factor * 100)` while the
  // emitted exercise weights came from `Math.round(sourcePct * factor)`. Per-exercise integer
  // rounding could put the emitted % a couple of points off the factor. The fix derives the
  // description from the first compound-lift's scaled `%1RM`, so description and delivered
  // can't drift.
  const wk2Sessions = triathlonPerformanceProtocol.createWeekSessions(rebuildContext(2));
  const lower = wk2Sessions.find((s) => /Lower/i.test(s.name))!;
  // Deadlift in build is 80% 1RM. Rebuild week 2 emits 80 × 0.95 = 76% 1RM.
  const dl = findExerciseWeight(lower, /Deadlift/i)!;
  const dlPctEmitted = Number(dl.match(/(\d+)%/)?.[1]);
  assertEquals(dlPctEmitted, 76);
  // Description must reference the literal emitted % (76) and the source % (80), not just "95%".
  assert(
    lower.description.includes('76% 1RM'),
    `description must quote the literal emitted %1RM — got "${lower.description}"`,
  );
  assert(
    lower.description.includes('80%'),
    `description must reference the pre-race build source % (80%) — got "${lower.description}"`,
  );
});

Deno.test('strength rebuild: description quotes source 80% / scaled 72% for week 1', () => {
  const wk1Sessions = triathlonPerformanceProtocol.createWeekSessions(rebuildContext(1));
  const lower = wk1Sessions.find((s) => /Lower/i.test(s.name))!;
  // Week 1: factor 0.90, deadlift 80 × 0.90 = 72.
  assert(
    lower.description.includes('72% 1RM'),
    `description must quote scaled 72% — got "${lower.description}"`,
  );
  assert(
    lower.description.includes('80%'),
    `description must reference source 80% — got "${lower.description}"`,
  );
  assert(
    lower.description.includes('Rebuild Week 1'),
    `description must label as Rebuild Week 1 — got "${lower.description}"`,
  );
});

// ── §4d regression: BRICKS_PER_WEEK['rebuild'] is 0 ────────────────────────

Deno.test('BRICKS_PER_WEEK[rebuild] = 0 — no bricks in rebuild so long_ride floor enforces', () => {
  // When BRICKS_PER_WEEK['rebuild'] was 1, the week-builder scheduled a brick in rebuild
  // weeks. Bricks are excluded from `enforceLongDayFloors` (correctly — a brick's bike leg
  // shouldn't be flagged against the standalone long_ride floor). But that exclusion meant
  // a rebuild week's brick could leave a 1.8h bike leg in place when the rebuild long_ride
  // floor expects 2.5h for 70.3. Setting bricks=0 in rebuild forces a standalone long_ride
  // session that enforceLongDayFloors can lift to the rebuild floor.
  // Pulled directly from the test plan regression: week 16 long ride was 1.8hr instead of 2.5hr.
  assertEquals(
    BRICKS_PER_WEEK.rebuild,
    0,
    'rebuild bricks must be 0 — see test plan regression where week 16 long ride was 1.8hr instead of 2.5hr',
  );
});

// ── §5 PhaseBlock contract: weeksSinceRaceIncludingRebuild semantics ────────

Deno.test('PhaseBlock contract: standalone phases (base/build/race_specific) have undefined weeksSinceRaceIncludingRebuild', () => {
  const goals: GoalInput[] = [
    {
      id: 'g1',
      event_name: 'A-race 70.3',
      event_date: '2026-09-12',
      distance: '70.3',
      sport: 'triathlon',
      priority: 'A',
    },
  ];
  const startDate = new Date('2026-05-11T12:00:00Z');
  const { blocks } = buildPhaseTimeline(goals, startDate, makeAthleteState());
  const baseBlocks = blocks.filter((b) => b.phase === 'base');
  for (const b of baseBlocks) {
    assertEquals(
      b.weeksSinceRaceIncludingRebuild,
      undefined,
      `standalone base block (week ${b.startWeek}) should not carry weeksSinceRaceIncludingRebuild`,
    );
  }
});
