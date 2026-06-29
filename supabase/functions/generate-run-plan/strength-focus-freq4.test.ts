// Q-088 / D-220 — freq-4 strength-focus (U/L/U/L) on the run path.
// Proves: the frequency-policy gate, the strength-focus-split module (both lanes),
// and the 4-slot placement template. Run: deno test strength-focus-freq4.test.ts
import { assertEquals, assert } from 'https://deno.land/std@0.208.0/assert/mod.ts';
import {
  strengthFrequencyCeiling,
  effectiveStrengthFrequency,
} from '../shared/strength-system/frequency-policy.ts';
import { getProtocol, resolveStrengthProtocolForGoal } from '../shared/strength-system/protocols/selector.ts';
import type { ProtocolContext } from '../shared/strength-system/protocols/types.ts';
import { isUpperIntent, isLowerIntent } from '../shared/strength-system/protocols/intent-taxonomy.ts';
import { getPlacementStrategy } from '../shared/strength-system/placement/strategy.ts';
import type { PlacementContext } from '../shared/strength-system/placement/types.ts';

// ── frequency policy ────────────────────────────────────────────────────────
Deno.test('frequency-policy: ceiling by posture', () => {
  assertEquals(strengthFrequencyCeiling('develop'), 3);
  assertEquals(strengthFrequencyCeiling('maintain'), 4);
  assertEquals(strengthFrequencyCeiling('out'), 4);
  assertEquals(strengthFrequencyCeiling(undefined), 3); // absent ≡ develop (safe)
  assertEquals(strengthFrequencyCeiling('parked' as any), 3); // unknown string → safe
});

Deno.test('frequency-policy: NO-OP for every requested ≤ 3 (byte-identical guard)', () => {
  for (const posture of ['develop', 'maintain', 'out', undefined, 'garbage']) {
    for (const req of [0, 1, 2, 3]) {
      assertEquals(effectiveStrengthFrequency(req, posture as any), req,
        `req ${req} posture ${posture} must pass through unchanged`);
    }
  }
});

Deno.test('frequency-policy: 4 survives ONLY on maintain/out', () => {
  assertEquals(effectiveStrengthFrequency(4, 'develop'), 3);
  assertEquals(effectiveStrengthFrequency(4, undefined), 3);
  assertEquals(effectiveStrengthFrequency(4, 'maintain'), 4);
  assertEquals(effectiveStrengthFrequency(4, 'out'), 4);
});

// ── the module: 4 sessions, U/L/U/L ─────────────────────────────────────────
function ctx(freq: 2 | 3 | 4, phaseName = 'Base'): ProtocolContext {
  return {
    weekIndex: 2,
    weekInPhase: 2,
    phase: { name: phaseName, start_week: 1, end_week: 8, weeks_in_phase: 8 },
    totalWeeks: 12,
    isRecovery: false,
    primarySchedule: { longSessionDays: ['Sunday'], qualitySessionDays: ['Tuesday'], easySessionDays: ['Monday', 'Wednesday', 'Friday'] },
    userBaselines: { equipment: 'commercial_gym' },
    strengthFrequency: freq,
    constraints: { maxSessionDuration: 60 },
  };
}

for (const lane of ['power', 'build'] as const) {
  const id = lane === 'power' ? 'strength_focus_power' : 'strength_focus_build';
  Deno.test(`strength-focus-split (${lane}): freq-4 emits 4 sessions in U/L/U/L order`, () => {
    const sessions = getProtocol(id).createWeekSessions(ctx(4));
    assertEquals(sessions.length, 4, 'must emit exactly 4 sessions');
    const focus = sessions.map(s =>
      isUpperIntent(s.intent) ? 'U' : isLowerIntent(s.intent) ? 'L' : '?');
    assertEquals(focus, ['U', 'L', 'U', 'L'], 'order must be U/L/U/L');
    // 2 upper + 2 lower
    assertEquals(focus.filter(f => f === 'U').length, 2);
    assertEquals(focus.filter(f => f === 'L').length, 2);
  });
}

Deno.test('strength-focus-split (build): names all resolve in exercise-role.ts vocabulary', async () => {
  const { roleForExercise } = await import('../_shared/strength/exercise-role.ts');
  const names = getProtocol('strength_focus_build')
    .createWeekSessions(ctx(4))
    .flatMap(s => s.exercises.map(e => e.name));
  for (const n of names) {
    // roleForExercise warns + defaults to 'primary' on a miss; assert each is a known role.
    assert(['primary', 'secondary', 'accessory'].includes(roleForExercise(n)),
      `${n} must classify`);
  }
});

// ── overlay glue: the run resolver routes the new ids to the module ─────────
// (the wiring risk: sport='run' coerces non-RUN_CENTRIC ids to durability/neural_speed)
Deno.test('overlay resolver: strength_focus_* ids survive the run-sport resolver', () => {
  assertEquals(
    resolveStrengthProtocolForGoal({ rawProtocol: 'strength_focus_power', sport: 'run' }).protocolId,
    'strength_focus_power');
  assertEquals(
    resolveStrengthProtocolForGoal({ rawProtocol: 'strength_focus_build', sport: 'run' }).protocolId,
    'strength_focus_build');
});

// ── Q-093 Lock 2 — run-sport resolver honors five_by_five; everything else byte-identical ──
Deno.test('Q-093 Lock 2: five_by_five survives the run resolver; other protocols unchanged', () => {
  // The fix: five_by_five was coerced to durability on the run path.
  assertEquals(resolveStrengthProtocolForGoal({ rawProtocol: 'five_by_five', sport: 'run' }).protocolId, 'five_by_five');
  // Byte-identical guard — these already resolved correctly and must not move:
  for (const p of ['neural_speed', 'durability', 'upper_aesthetics', 'strength_focus_build', 'strength_focus_power']) {
    assertEquals(resolveStrengthProtocolForGoal({ rawProtocol: p, sport: 'run' }).protocolId, p, `${p} must be unchanged`);
  }
  // Intent-performance default (no protocol) still → neural_speed (unchanged).
  assertEquals(resolveStrengthProtocolForGoal({ strengthIntent: 'performance', sport: 'run' }).protocolId, 'neural_speed');
  // No protocol, no intent → durability (unchanged).
  assertEquals(resolveStrengthProtocolForGoal({ sport: 'run' }).protocolId, 'durability');
});

// ── placement: 4 distinct days, 2 upper + 2 lower ───────────────────────────
function placementCtx(freq: 0 | 1 | 2 | 3 | 4): PlacementContext {
  return {
    methodology: 'hal_higdon_complete',
    protocol: 'strength_focus_power',
    strengthFrequency: freq,
    noDoubles: false,
    qualityDays: ['tue'],
    longRunDay: 'sun',
    runDays: ['sun', 'tue', 'thu'], // only 3 run days — freq-4 MUST use rest days
  };
}

Deno.test('placement: freq-4 yields 4 distinct days, 2 upper + 2 lower', () => {
  const strat = getPlacementStrategy(placementCtx(4));
  const entries = Object.entries(strat.slotsByDay).filter(([, s]) => s !== 'none');
  const days = entries.map(([d]) => d);
  assertEquals(new Set(days).size, 4, `expected 4 distinct days, got ${days.join(',')}`);
  const uppers = entries.filter(([, s]) => String(s).startsWith('upper')).length;
  const lowers = entries.filter(([, s]) => String(s).startsWith('lower')).length;
  assertEquals(uppers, 2, 'two upper slots');
  assertEquals(lowers, 2, 'two lower slots');
});

Deno.test('placement: freq-3 unchanged — strength stays on run days only (byte-identical guard)', () => {
  const strat = getPlacementStrategy(placementCtx(3));
  const days = Object.entries(strat.slotsByDay)
    .filter(([, s]) => s !== 'none')
    .map(([d]) => d);
  // freq≤3 confines to run days; no rest day should appear.
  for (const d of days) {
    assert(['sun', 'tue', 'thu'].includes(d), `freq-3 placed on non-run day ${d}`);
  }
});
