// 5×5 Cut 3 — module structure + selector gates. Run: ~/.deno/bin/deno test --no-check <this>
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

Deno.test('getProtocol("five_by_five") resolves through all selector gates', () => {
  const p = getProtocol('five_by_five');
  assertEquals(p.id, 'five_by_five');
});

Deno.test('5×5 structure: 5×5 sets/reps, deadlift reduced, compound roster, FULLBODY_STRENGTH', () => {
  const sessions = fiveByFiveProtocol.createWeekSessions(ctx({ strengthFrequency: 3 }));
  assertEquals(sessions.length, 3); // 3×/week
  for (const s of sessions) {
    assertEquals(s.intent, 'FULLBODY_STRENGTH'); // emits the new intent
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

Deno.test('A/B alternation: week parity flips the leading workout', () => {
  const wk1 = fiveByFiveProtocol.createWeekSessions(ctx({ weekIndex: 1, strengthFrequency: 3 })).map((s) => s.name);
  const wk2 = fiveByFiveProtocol.createWeekSessions(ctx({ weekIndex: 2, strengthFrequency: 3 })).map((s) => s.name);
  assert(wk1[0] !== wk2[0], `parity must flip the lead: ${wk1[0]} vs ${wk2[0]}`);
  assertEquals(new Set(wk1).size, 2, 'a week is A-B-A (two distinct workouts)');
});
