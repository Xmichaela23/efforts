/**
 * Within-phase progression contract (docs/STRENGTH-PROTOCOL.md §3.1).
 *
 * Dispatcher emits a different %1RM each active week within base/build/race phases. The same
 * `weekInPhase` value drives both the exercise `weight` field AND the description text — they
 * are computed from a single source (BASE_PCT_TABLE / BUILD_PCT_TABLE / RACE_PCT_TABLE) so the
 * description CANNOT drift from the materializer's resolution.
 *
 * Recovery weeks divert to `createPerfRecoverySession` upstream of the within-phase emit; that
 * arm is exercised separately (see `isRecovery` gate at triathlon_performance.ts:101).
 *
 * Run from repo root:
 *   deno test --no-lock --allow-all supabase/functions/shared/strength-system/protocols/triathlon_performance.progression.test.ts
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

function find(session: IntentSession, pattern: RegExp): StrengthExercise | undefined {
  return session.exercises.find((e) => pattern.test(e.name));
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

// ── §1 Hypertrophy phase — linear 65/68/70/72 across active weeks 1-4 ─────

Deno.test('base hypertrophy: deadlift %1RM ramps 65→68→70→72 across active weeks 1-4', () => {
  const expected = [65, 68, 70, 72];
  for (let wip = 1; wip <= 4; wip++) {
    const sessions = triathlonPerformanceProtocol.createWeekSessions(ctxWithPhase('base', wip));
    const dl = find(lowerOf(sessions), /Deadlift/i);
    assertEquals(dl?.weight, `${expected[wip - 1]}% 1RM`, `base wip=${wip}`);
  }
});

Deno.test('base hypertrophy: squat tracks the same compound progression as deadlift', () => {
  const expected = [65, 68, 70, 72];
  for (let wip = 1; wip <= 4; wip++) {
    const sessions = triathlonPerformanceProtocol.createWeekSessions(ctxWithPhase('base', wip));
    const sq = find(lowerOf(sessions), /Squat/i);
    assertEquals(sq?.weight, `${expected[wip - 1]}% 1RM`, `squat base wip=${wip}`);
  }
});

Deno.test('base hypertrophy: row + bench track the same progression', () => {
  const expected = [65, 68, 70, 72];
  for (let wip = 1; wip <= 4; wip++) {
    const sessions = triathlonPerformanceProtocol.createWeekSessions(ctxWithPhase('base', wip));
    const row = find(upperOf(sessions), /Barbell Row/i);
    const bench = find(upperOf(sessions), /Bench Press/i);
    assertEquals(row?.weight, `${expected[wip - 1]}% 1RM (bench anchor)`, `row base wip=${wip}`);
    assertEquals(bench?.weight, `${expected[wip - 1]}% 1RM`, `bench base wip=${wip}`);
  }
});

Deno.test('base hypertrophy: OHP ramps with the base table (regression: the flat-80lb bug)', () => {
  // The reported bug: OHP flat at 80 lb across base W1-9 while every other lift
  // progressed. OHP now tracks the base %1RM table (S-003 required compound;
  // STRENGTH-PROTOCOL §3.1/P-003 — no OHP carve-out). Locks both barbell + DB.
  const expected = [65, 68, 70, 72];
  for (let wip = 1; wip <= 4; wip++) {
    const sessions = triathlonPerformanceProtocol.createWeekSessions(ctxWithPhase('base', wip));
    const ohp = find(upperOf(sessions), /Overhead Press/i);
    assertEquals(ohp?.weight, `${expected[wip - 1]}% 1RM`, `OHP base wip=${wip}`);
  }
});

Deno.test('base hypertrophy: description quotes the emitted %1RM literally', () => {
  for (const wip of [1, 2, 3, 4]) {
    const pct = [65, 68, 70, 72][wip - 1];
    const sessions = triathlonPerformanceProtocol.createWeekSessions(ctxWithPhase('base', wip));
    const lower = lowerOf(sessions);
    assert(
      String(lower.description).includes(`${pct}% 1RM`),
      `base wip=${wip} description must include "${pct}% 1RM" — got "${lower.description}"`,
    );
  }
});

Deno.test('base hypertrophy: wip beyond table clamps to the last entry (72%)', () => {
  // Phase longer than the table: wip=5 emits 72% (clamp), wip=10 emits 72%.
  for (const wip of [5, 6, 10]) {
    const sessions = triathlonPerformanceProtocol.createWeekSessions(ctxWithPhase('base', wip));
    const dl = find(lowerOf(sessions), /Deadlift/i);
    assertEquals(dl?.weight, '72% 1RM', `base wip=${wip} should clamp to 72`);
  }
});

// ── §2 Strength Build phase — linear 78/80/83/85 across active weeks 1-4 ──

Deno.test('build: deadlift %1RM ramps 78→80→83→85 across active weeks 1-4', () => {
  const expected = [78, 80, 83, 85];
  for (let wip = 1; wip <= 4; wip++) {
    const sessions = triathlonPerformanceProtocol.createWeekSessions(ctxWithPhase('build', wip));
    const dl = find(lowerOf(sessions), /Deadlift/i);
    assertEquals(dl?.weight, `${expected[wip - 1]}% 1RM`, `build wip=${wip}`);
  }
});

Deno.test('build: squat unified with deadlift (no 78/80 split — main compounds share the table)', () => {
  // Pre-Part-2: squat=78, deadlift=80. Post-Part-2: both = buildPct(wip).
  const expected = [78, 80, 83, 85];
  for (let wip = 1; wip <= 4; wip++) {
    const sessions = triathlonPerformanceProtocol.createWeekSessions(ctxWithPhase('build', wip));
    const sq = find(lowerOf(sessions), /Squat/i);
    assertEquals(sq?.weight, `${expected[wip - 1]}% 1RM`, `squat build wip=${wip}`);
  }
});

Deno.test('build: row tracks the same progression (bench anchor preserved)', () => {
  const expected = [78, 80, 83, 85];
  for (let wip = 1; wip <= 4; wip++) {
    const sessions = triathlonPerformanceProtocol.createWeekSessions(ctxWithPhase('build', wip));
    const row = find(upperOf(sessions), /Barbell Row/i);
    assertEquals(row?.weight, `${expected[wip - 1]}% 1RM (bench anchor)`, `row build wip=${wip}`);
  }
});

Deno.test('build: OHP ramps with the build table like other compounds (STRENGTH-PROTOCOL §3.1/P-003 — no OHP carve-out)', () => {
  // OHP is a required compound (S-003) and progresses on the within-phase %1RM
  // table like deadlift/squat/row/bench. The prior "flat 72%, per spec" lock was
  // a FABRICATED rationale — the spec has no OHP exception (OHP-progression fix,
  // 2026-05-19; see DECISIONS-LOG close-out).
  const expected = [78, 80, 83, 85];
  for (let wip = 1; wip <= 4; wip++) {
    const sessions = triathlonPerformanceProtocol.createWeekSessions(ctxWithPhase('build', wip));
    const ohp = find(upperOf(sessions), /Overhead Press/i);
    assertEquals(ohp?.weight, `${expected[wip - 1]}% 1RM`, `OHP build wip=${wip}`);
  }
});

Deno.test('build: description quotes the emitted buildPct', () => {
  for (const wip of [1, 2, 3, 4]) {
    const pct = [78, 80, 83, 85][wip - 1];
    const sessions = triathlonPerformanceProtocol.createWeekSessions(ctxWithPhase('build', wip));
    const lower = lowerOf(sessions);
    assert(
      String(lower.description).includes(`${pct}% 1RM`),
      `build wip=${wip} description must include "${pct}% 1RM" — got "${lower.description}"`,
    );
  }
});

// ── §3 Race-specific (Maintenance + Power) — linear 70/72/75 ──────────────

Deno.test('race: trap bar deadlift %1RM ramps 70→72→75', () => {
  const expected = [70, 72, 75];
  for (let wip = 1; wip <= 3; wip++) {
    const sessions = triathlonPerformanceProtocol.createWeekSessions(ctxWithPhase('race prep', wip));
    const tb = find(lowerOf(sessions), /Trap Bar Deadlift/i);
    assert(tb, `expected trap bar deadlift at race wip=${wip}`);
    assert(
      String(tb.weight).startsWith(`${expected[wip - 1]}% 1RM`),
      `race wip=${wip}: expected weight to start "${expected[wip - 1]}% 1RM" — got "${tb.weight}"`,
    );
  }
});

Deno.test('race: plyometric component stays flat (Push Press 70%, Box Jumps BW)', () => {
  // Per spec the plyo/power component does NOT track the main-lift progression. Push Press
  // stays at 70% OHP (its established power-target intensity); jumps are bodyweight.
  // First wip in rotation = push_press for full_barbell.
  const sessions = triathlonPerformanceProtocol.createWeekSessions(ctxWithPhase('race prep', 1));
  const pp = find(lowerOf(sessions), /Push Press/i);
  assert(pp, `expected Push Press in rotation slot 0`);
  assert(
    String(pp.weight).includes('70% 1RM'),
    `Push Press must stay at 70% 1RM (plyo component is flat) — got "${pp.weight}"`,
  );
});

Deno.test('race: wip beyond table clamps to last entry (75%)', () => {
  const sessions = triathlonPerformanceProtocol.createWeekSessions(ctxWithPhase('race prep', 5));
  const tb = find(lowerOf(sessions), /Trap Bar Deadlift/i);
  assert(String(tb?.weight).startsWith('75% 1RM'), `wip=5 should clamp to 75 — got "${tb?.weight}"`);
});

Deno.test('race: description quotes the emitted racePct', () => {
  for (const wip of [1, 2, 3]) {
    const pct = [70, 72, 75][wip - 1];
    const sessions = triathlonPerformanceProtocol.createWeekSessions(ctxWithPhase('race prep', wip));
    const lower = lowerOf(sessions);
    assert(
      String(lower.description).includes(`${pct}% 1RM`),
      `race wip=${wip} description must include "${pct}% 1RM" — got "${lower.description}"`,
    );
  }
});

// ── §4 Verification math — user-provided targets (150 lb deadlift 1RM) ────

Deno.test('verification: 150 lb deadlift 1RM → Week 1 base emits 65% 1RM (snapshot pin → 100 lb after materialize)', () => {
  // The dispatcher emits the %1RM string. The materializer applies snapshot 1RM:
  // 65% × 150 = 97.5 → round 5 = 100 lb. (Materializer math covered by materialize-plan/index.test.ts;
  // here we pin the dispatcher emit that the materializer will read from.)
  const sessions = triathlonPerformanceProtocol.createWeekSessions(ctxWithPhase('base', 1));
  const dl = find(lowerOf(sessions), /Deadlift/i);
  assertEquals(dl?.weight, '65% 1RM');
});

Deno.test('verification: 150 lb deadlift 1RM → Week 3 of base emits 70% 1RM (→ 105 lb)', () => {
  const sessions = triathlonPerformanceProtocol.createWeekSessions(ctxWithPhase('base', 3));
  const dl = find(lowerOf(sessions), /Deadlift/i);
  assertEquals(dl?.weight, '70% 1RM');
});

Deno.test('verification: 150 lb deadlift 1RM → Week 4 of base emits 72% 1RM (→ 108 lb)', () => {
  const sessions = triathlonPerformanceProtocol.createWeekSessions(ctxWithPhase('base', 4));
  const dl = find(lowerOf(sessions), /Deadlift/i);
  assertEquals(dl?.weight, '72% 1RM');
});

Deno.test('verification: 150 lb deadlift 1RM → Week 1 of build emits 78% 1RM (→ 117 lb)', () => {
  const sessions = triathlonPerformanceProtocol.createWeekSessions(ctxWithPhase('build', 1));
  const dl = find(lowerOf(sessions), /Deadlift/i);
  assertEquals(dl?.weight, '78% 1RM');
});

Deno.test('verification: 150 lb deadlift 1RM → Week 4 of build emits 85% 1RM (→ 128 lb)', () => {
  const sessions = triathlonPerformanceProtocol.createWeekSessions(ctxWithPhase('build', 4));
  const dl = find(lowerOf(sessions), /Deadlift/i);
  assertEquals(dl?.weight, '85% 1RM');
});

// ── §5 Description ≡ delivered contract (snapshot-pinned 1RM) ─────────────

Deno.test('contract: description text and exercise weight reference the SAME %1RM each week', () => {
  // Description text is generated from the same pctForActiveWeek call that emits the weight
  // string. They cannot drift unless the table is read twice (which would be a code review
  // catch). This test exercises every active week across all three progression phases.
  for (const phaseName of ['base', 'build', 'race prep'] as const) {
    const len = phaseName === 'race prep' ? 3 : 4;
    for (let wip = 1; wip <= len; wip++) {
      const sessions = triathlonPerformanceProtocol.createWeekSessions(ctxWithPhase(phaseName, wip));
      const lower = lowerOf(sessions);
      const compound = find(lower, phaseName === 'race prep' ? /Trap Bar Deadlift/i : /Deadlift/i);
      assert(compound, `expected compound lift at ${phaseName} wip=${wip}`);
      const weightStr = String(compound.weight);
      const weightPctMatch = weightStr.match(/(\d+)% 1RM/);
      assert(weightPctMatch, `weight must contain "X% 1RM" — got "${weightStr}"`);
      const weightPct = weightPctMatch[1];
      assert(
        String(lower.description).includes(`${weightPct}% 1RM`),
        `${phaseName} wip=${wip}: description must reference the same ${weightPct}% as weight — got "${lower.description}"`,
      );
    }
  }
});
