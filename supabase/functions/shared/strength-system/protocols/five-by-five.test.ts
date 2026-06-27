// 5×5 module — structure (Cut 3) + progression curve / deload / 2×/week frequency (Cut 4).
// Run: ~/.deno/bin/deno test --no-check <this>
import { assertEquals, assert } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { getProtocol } from './selector.ts';
import { fiveByFiveProtocol } from './five-by-five.ts';
import type { ProtocolContext } from './types.ts';

function ctx(over: Partial<ProtocolContext> = {}): ProtocolContext {
  return {
    weekIndex: 1, weekInPhase: 1, phase: { name: 'Base' } as any, totalWeeks: 16, isRecovery: false,
    primarySchedule: { longSessionDays: ['Sunday'], qualitySessionDays: ['Tuesday'], easySessionDays: [] },
    userBaselines: { equipment: 'commercial_gym' } as any,
    strengthFrequency: 3, constraints: {},
    ...over,
  } as ProtocolContext;
}

// parse the "${load}% 1RM" weight off the first exercise of the first session
const pctOf = (sessions: ReturnType<typeof fiveByFiveProtocol.createWeekSessions>) =>
  Number(sessions[0].exercises[0].weight.replace('% 1RM', ''));

Deno.test('getProtocol("five_by_five") resolves through all selector gates', () => {
  assertEquals(getProtocol('five_by_five').id, 'five_by_five');
});

Deno.test('structure: 5×5 sets/reps, deadlift reduced, compound roster, FULLBODY_STRENGTH', () => {
  const sessions = fiveByFiveProtocol.createWeekSessions(ctx());
  for (const s of sessions) {
    assertEquals(s.intent, 'FULLBODY_STRENGTH');
    assertEquals(s.repProfile, 'strength');
    for (const ex of s.exercises) {
      assertEquals(ex.reps, 5); // 5 reps everywhere
      if (/deadlift/i.test(ex.name)) assertEquals(ex.sets, 1, 'deadlift reduced volume (1×5)');
      else assertEquals(ex.sets, 5, `${ex.name} is 5 sets`);
    }
  }
  const roster = sessions.flatMap((s) => s.exercises.map((e) => e.name.toLowerCase())).join(' ');
  for (const lift of ['squat', 'bench', 'row', 'overhead', 'deadlift']) {
    assert(roster.includes(lift), `compound roster must include ${lift}`);
  }
});

Deno.test('Cut 4 — 2×/week develop frequency, capped even at strengthFrequency 3', () => {
  assertEquals(fiveByFiveProtocol.createWeekSessions(ctx({ strengthFrequency: 3 })).length, 2);
  assertEquals(fiveByFiveProtocol.createWeekSessions(ctx({ strengthFrequency: 2 })).length, 2);
});

Deno.test('A/B alternation: absolute-week parity flips the leading workout (A-B / B-A)', () => {
  const wk1 = fiveByFiveProtocol.createWeekSessions(ctx({ weekIndex: 1 })).map((s) => s.name);
  const wk2 = fiveByFiveProtocol.createWeekSessions(ctx({ weekIndex: 2 })).map((s) => s.name);
  assert(wk1[0] !== wk2[0], `parity must flip the lead: ${wk1[0]} vs ${wk2[0]}`);
  assertEquals(new Set(wk1).size, 2, 'a week is A-B (two distinct workouts)');
});

Deno.test('Cut 4 — block-linear load curve climbs 70→85 by week-in-block, plateaus at 85', () => {
  assertEquals(pctOf(fiveByFiveProtocol.createWeekSessions(ctx({ weekInPhase: 1 }))), 70); // opens at 70%
  const wk5 = pctOf(fiveByFiveProtocol.createWeekSessions(ctx({ weekInPhase: 5 })));
  assert(wk5 > 70 && wk5 < 85, `mid-block climbs into the zone, got ${wk5}`);
  assertEquals(pctOf(fiveByFiveProtocol.createWeekSessions(ctx({ weekInPhase: 13 }))), 85); // reaches the 85% ceiling
  assertEquals(pctOf(fiveByFiveProtocol.createWeekSessions(ctx({ weekInPhase: 99 }))), 85); // plateaus at 85
});

Deno.test('Cut 4 — recovery week deloads into the 40-50% band, below the working load', () => {
  const work = pctOf(fiveByFiveProtocol.createWeekSessions(ctx({ weekInPhase: 6, isRecovery: false })));
  const deload = pctOf(fiveByFiveProtocol.createWeekSessions(ctx({ weekInPhase: 6, isRecovery: true })));
  assert(deload < work, `deload (${deload}) drops below the working load (${work})`);
  assert(deload >= 40 && deload <= 50, `deload in the 40-50% band, got ${deload}`);
});
