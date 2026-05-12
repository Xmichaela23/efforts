/**
 * §3.8 Conformance contract tests (docs/STRENGTH-PROTOCOL.md).
 *
 * Asserts the per-session, per-week, and per-phase invariants from §3.8 against the actual
 * dispatcher output. These tests are the runtime contract — each rule ID below corresponds
 * to a specific identifier in the spec. A failure here means the code contradicts the spec
 * and either the code or the spec needs updating.
 *
 * Scope:
 *   - S-001 / S-002 / S-003 / S-005 / S-006: per-session compound + accessory coverage
 *   - W-001: weekly four-pattern coverage across both upper sessions
 *   - P-002: Hypertrophy weekInPhase clamps at 72% beyond table length
 *
 * Out-of-scope (deferred):
 *   - W-002 (deload week structure) — recovery emission path tested separately
 *   - W-003 (sessions/week per distance) — owned by upstream session frequency defaults
 *   - P-001 (Hypertrophy single contiguous block) — owned by phase-structure.ts; W5 clamp
 *     test below covers the downstream consequence
 *   - P-003 / P-004 (monotonic progression, power-phase start) — covered by progression test
 *   - D-001 / D-002 / D-003 (description/equipment contracts) — covered by progression test
 *   - E-001 / E-002 / E-003 (equipment substitutions) — covered by selector + db_max tests
 *
 * Run from repo root:
 *   deno test --no-lock --allow-all supabase/functions/shared/strength-system/protocols/triathlon_performance.conformance.test.ts
 */

import { assert, assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { triathlonPerformanceProtocol } from './triathlon_performance.ts';
import type { ProtocolContext, IntentSession, StrengthExercise } from './types.ts';

function ctxWithPhase(phaseName: string, weekInPhase: number, opts: Partial<ProtocolContext> = {}): ProtocolContext {
  return {
    weekIndex: weekInPhase,
    weekInPhase,
    phase: { name: phaseName, start_week: 1, end_week: 4, weeks_in_phase: 4 },
    totalWeeks: 18,
    isRecovery: false,
    primarySchedule: {
      longSessionDays: ['Sunday'],
      qualitySessionDays: ['Wednesday'],
      easySessionDays: ['Friday'],
    },
    userBaselines: {
      squat1RM: 200,
      deadlift1RM: 150,
      bench1RM: 175,
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
    ...opts,
  };
}

function findByName(session: IntentSession, pattern: RegExp): StrengthExercise | undefined {
  return session.exercises.find((e) => pattern.test(e.name));
}

function exerciseNames(session: IntentSession): string {
  return session.exercises.map((e) => e.name).join(', ');
}

function lowerOf(sessions: IntentSession[]): IntentSession {
  const s = sessions.find((x) => /Lower/i.test(x.name));
  if (!s) throw new Error(`no lower-body session; got ${sessions.map((x) => x.name).join(', ')}`);
  return s;
}

function upperOf(sessions: IntentSession[]): IntentSession {
  const s = sessions.find((x) => /Upper/i.test(x.name));
  if (!s) throw new Error(`no upper-body session; got ${sessions.map((x) => x.name).join(', ')}`);
  return s;
}

// ── §3.8 S-001 / S-002 — Lower session compound coverage ───────────────────

Deno.test('S-001 / S-002 (base lower): every Hypertrophy lower includes Squat AND Deadlift', () => {
  for (const wip of [1, 2, 3, 4]) {
    const lower = lowerOf(triathlonPerformanceProtocol.createWeekSessions(ctxWithPhase('base', wip)));
    assert(findByName(lower, /Squat/i), `base wip=${wip}: missing Squat — got [${exerciseNames(lower)}]`);
    assert(findByName(lower, /Deadlift/i), `base wip=${wip}: missing Deadlift — got [${exerciseNames(lower)}]`);
  }
});

Deno.test('S-001 / S-002 (build lower): every Build lower includes Squat AND Deadlift', () => {
  for (const wip of [1, 2, 3, 4]) {
    const lower = lowerOf(triathlonPerformanceProtocol.createWeekSessions(ctxWithPhase('build', wip)));
    assert(findByName(lower, /Squat/i), `build wip=${wip}: missing Squat — got [${exerciseNames(lower)}]`);
    assert(findByName(lower, /Deadlift/i), `build wip=${wip}: missing Deadlift — got [${exerciseNames(lower)}]`);
  }
});

// ── §3.8 S-003 — Upper session has push + pull (this session) ───────────────

Deno.test('S-003 (base upper): every Hypertrophy upper has horizontal push + horizontal pull + vertical push + vertical pull', () => {
  for (const wip of [1, 2, 3, 4]) {
    const upper = upperOf(triathlonPerformanceProtocol.createWeekSessions(ctxWithPhase('base', wip)));
    // Horizontal push: Bench Press (full_barbell) or DB Bench/Floor Press (DB tier).
    assert(
      findByName(upper, /Bench Press|Floor Press/i),
      `base wip=${wip}: missing horizontal push (Bench) — got [${exerciseNames(upper)}]`,
    );
    // Horizontal pull: Barbell Row / DB Row.
    assert(
      findByName(upper, /\bRow\b/i),
      `base wip=${wip}: missing horizontal pull (Row) — got [${exerciseNames(upper)}]`,
    );
    // Vertical push: OHP / DB Shoulder Press (S-003 fix).
    assert(
      findByName(upper, /Overhead Press|Shoulder Press/i),
      `base wip=${wip}: missing vertical push (OHP) — got [${exerciseNames(upper)}]`,
    );
    // Vertical pull: Pull-ups / Lat Pull-Down / Band Pull-Down.
    assert(
      findByName(upper, /Pull-?ups|Pull-?Down/i),
      `base wip=${wip}: missing vertical pull (Pull-ups/Pull-Down) — got [${exerciseNames(upper)}]`,
    );
  }
});

Deno.test('S-003 (build upper): every Build upper has horizontal push + horizontal pull + vertical push + vertical pull', () => {
  for (const wip of [1, 2, 3, 4]) {
    const upper = upperOf(triathlonPerformanceProtocol.createWeekSessions(ctxWithPhase('build', wip)));
    assert(
      findByName(upper, /Bench Press|Floor Press/i),
      `build wip=${wip}: missing horizontal push (Bench) — got [${exerciseNames(upper)}]`,
    );
    assert(
      findByName(upper, /\bRow\b/i),
      `build wip=${wip}: missing horizontal pull (Row) — got [${exerciseNames(upper)}]`,
    );
    assert(
      findByName(upper, /Overhead Press|Shoulder Press/i),
      `build wip=${wip}: missing vertical push (OHP) — got [${exerciseNames(upper)}]`,
    );
    assert(
      findByName(upper, /Pull-?ups|Pull-?Down/i),
      `build wip=${wip}: missing vertical pull (Pull-ups/Pull-Down) — got [${exerciseNames(upper)}]`,
    );
  }
});

// ── §3.8 S-004 — Required upper-day accessories ─────────────────────────────

Deno.test('S-004 (base upper): includes Band Face Pulls and Band Pull-Aparts', () => {
  for (const wip of [1, 2, 3, 4]) {
    const upper = upperOf(triathlonPerformanceProtocol.createWeekSessions(ctxWithPhase('base', wip)));
    assert(findByName(upper, /Face Pulls/i), `base wip=${wip}: missing Face Pulls — got [${exerciseNames(upper)}]`);
    assert(findByName(upper, /Pull-Aparts/i), `base wip=${wip}: missing Band Pull-Aparts — got [${exerciseNames(upper)}]`);
  }
});

Deno.test('S-004 (build upper): includes Band Face Pulls and Band Pull-Aparts', () => {
  for (const wip of [1, 2, 3, 4]) {
    const upper = upperOf(triathlonPerformanceProtocol.createWeekSessions(ctxWithPhase('build', wip)));
    assert(findByName(upper, /Face Pulls/i), `build wip=${wip}: missing Face Pulls — got [${exerciseNames(upper)}]`);
    assert(findByName(upper, /Pull-Aparts/i), `build wip=${wip}: missing Band Pull-Aparts — got [${exerciseNames(upper)}]`);
  }
});

// ── §3.8 S-005 — Hip Thrusts required in base + build lower ─────────────────

Deno.test('S-005 (base lower): includes Hip Thrusts (or Glute Bridges substitute without bench)', () => {
  for (const wip of [1, 2, 3, 4]) {
    const lower = lowerOf(triathlonPerformanceProtocol.createWeekSessions(ctxWithPhase('base', wip)));
    assert(
      findByName(lower, /Hip Thrusts|Glute Bridges/i),
      `base wip=${wip}: missing Hip Thrusts — got [${exerciseNames(lower)}]`,
    );
  }
});

Deno.test('S-005 (build lower): includes Hip Thrusts (or Glute Bridges substitute without bench)', () => {
  for (const wip of [1, 2, 3, 4]) {
    const lower = lowerOf(triathlonPerformanceProtocol.createWeekSessions(ctxWithPhase('build', wip)));
    assert(
      findByName(lower, /Hip Thrusts|Glute Bridges/i),
      `build wip=${wip}: missing Hip Thrusts — got [${exerciseNames(lower)}]`,
    );
  }
});

Deno.test('S-005 (no bench fallback): athlete without bench gets Glute Bridges in base lower', () => {
  const ctx = ctxWithPhase('base', 1, {
    userBaselines: {
      ...ctxWithPhase('base', 1).userBaselines,
      hasBench: false,
      equipmentTier: 'dumbbell_based',
    },
  });
  const lower = lowerOf(triathlonPerformanceProtocol.createWeekSessions(ctx));
  assert(findByName(lower, /Glute Bridges/i), `no-bench: expected Glute Bridges — got [${exerciseNames(lower)}]`);
  assert(!findByName(lower, /^Hip Thrusts/i), `no-bench: should NOT have Hip Thrusts — got [${exerciseNames(lower)}]`);
});

// ── §3.8 S-006 — Core finisher on every session ─────────────────────────────

Deno.test('S-006 (base lower): includes a core finisher (Dead Bug or Copenhagen Plank)', () => {
  for (const wip of [1, 2, 3, 4]) {
    const lower = lowerOf(triathlonPerformanceProtocol.createWeekSessions(ctxWithPhase('base', wip)));
    assert(
      findByName(lower, /Dead Bug|Copenhagen|Pallof/i),
      `base wip=${wip}: missing core finisher — got [${exerciseNames(lower)}]`,
    );
  }
});

Deno.test('S-006 (base upper): includes Pallof Press as core finisher', () => {
  for (const wip of [1, 2, 3, 4]) {
    const upper = upperOf(triathlonPerformanceProtocol.createWeekSessions(ctxWithPhase('base', wip)));
    assert(
      findByName(upper, /Pallof Press|Dead Bug/i),
      `base wip=${wip}: missing core finisher — got [${exerciseNames(upper)}]`,
    );
  }
});

// ── §3.8 W-001 — Weekly four-pattern coverage ──────────────────────────────

Deno.test('W-001 (base): hypertrophy upper covers all four patterns within the single session', () => {
  // Plan 54 surfaced the gap: only one upper session per week today carries all four patterns
  // when needed. Verify the session itself spans all four — sessions are run twice per week
  // so the rotation is implicit on the session payload not on the planning layer yet.
  const upper = upperOf(triathlonPerformanceProtocol.createWeekSessions(ctxWithPhase('base', 1)));
  const patterns = {
    horizontal_push: findByName(upper, /Bench Press|Floor Press/i),
    horizontal_pull: findByName(upper, /\bRow\b/i),
    vertical_push: findByName(upper, /Overhead Press|Shoulder Press/i),
    vertical_pull: findByName(upper, /Pull-?ups|Pull-?Down/i),
  };
  for (const [k, v] of Object.entries(patterns)) {
    assert(v, `base upper missing pattern ${k} — got [${exerciseNames(upper)}]`);
  }
});

Deno.test('W-001 (build): build upper covers all four patterns within the single session', () => {
  const upper = upperOf(triathlonPerformanceProtocol.createWeekSessions(ctxWithPhase('build', 1)));
  const patterns = {
    horizontal_push: findByName(upper, /Bench Press|Floor Press/i),
    horizontal_pull: findByName(upper, /\bRow\b/i),
    vertical_push: findByName(upper, /Overhead Press|Shoulder Press/i),
    vertical_pull: findByName(upper, /Pull-?ups|Pull-?Down/i),
  };
  for (const [k, v] of Object.entries(patterns)) {
    assert(v, `build upper missing pattern ${k} — got [${exerciseNames(upper)}]`);
  }
});

// ── §3.8 P-002 — Phase extension clamps to high %1RM, doesn't reset ─────────

Deno.test('P-002 (base): wip=5 emits 72% deadlift (clamps to last table entry, does not reset to 65%)', () => {
  // Plan 54 W5 was emitting 65% (table index 1) — the dispatcher's pctForActiveWeek already
  // clamps, but `weekInPhaseForTimeline` was resetting weekInPhase to 1 across recovery
  // boundaries. The week-builder fix (commit landed alongside this test) preserves
  // weekInPhase across recovery, so wip=5 reaches the dispatcher and clamps to index 3 (72%).
  const lower = lowerOf(triathlonPerformanceProtocol.createWeekSessions(ctxWithPhase('base', 5)));
  const dl = findByName(lower, /Deadlift/i);
  assertEquals(dl?.weight, '72% 1RM', 'base wip=5 should clamp to 72%, not reset to 65%');
});

Deno.test('P-002 (build): wip=5 emits 85% deadlift (clamps to last table entry)', () => {
  const lower = lowerOf(triathlonPerformanceProtocol.createWeekSessions(ctxWithPhase('build', 5)));
  const dl = findByName(lower, /Deadlift/i);
  assertEquals(dl?.weight, '85% 1RM', 'build wip=5 should clamp to 85%, not reset to 78%');
});

// ── DB tier sanity (E-001 / E-003 surface) ──────────────────────────────────

Deno.test('S-003 DB tier (base upper): DB tier has DB Shoulder Press as vertical push', () => {
  const ctx = ctxWithPhase('base', 1, {
    userBaselines: {
      ...ctxWithPhase('base', 1).userBaselines,
      equipmentTier: 'dumbbell_based',
      hasBench: true,
    },
  });
  const upper = upperOf(triathlonPerformanceProtocol.createWeekSessions(ctx));
  assert(findByName(upper, /Shoulder Press/i), `DB base upper: missing DB Shoulder Press — got [${exerciseNames(upper)}]`);
});

Deno.test('S-003 DB tier (build upper): DB tier has DB Bench Press as horizontal push', () => {
  const ctx = ctxWithPhase('build', 1, {
    userBaselines: {
      ...ctxWithPhase('build', 1).userBaselines,
      equipmentTier: 'dumbbell_based',
      hasBench: true,
    },
  });
  const upper = upperOf(triathlonPerformanceProtocol.createWeekSessions(ctx));
  assert(findByName(upper, /DB Bench Press|Floor Press/i), `DB build upper: missing DB Bench — got [${exerciseNames(upper)}]`);
});
