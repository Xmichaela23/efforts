/**
 * D-270 — per-lift e1RM DIRECTION is persisted on the spine (state_trends_v1.strength.per_lift),
 * making the spine the single authority the coach per-lift row reads instead of re-deriving a
 * parallel (dead-fielded) direction from a different table (Q-107 H2). Guarantees under test:
 *   1. per_lift carries each lift's real direction, keyed by canonical, with latestE1rm = last point.
 *   2. per_lift retains granularity the AGGREGATE rolls away — a bench that's improving stays
 *      legible even when the discipline aggregate reads "holding" (the exact fracture-#1 loss).
 *   3. behavior-unchanged: the existing aggregate strength.e1rm is exactly what rollUp produced.
 *
 *   ~/.deno/bin/deno test supabase/functions/_shared/state-trend/strength-per-lift.test.ts
 */
import { assert, assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { assembleStateTrends, toStateTrendsV1, type StateTrendInputs, type ExerciseLogLite } from './assemble.ts';

const AS_OF = '2026-07-03';

// weekly sessions ~May 1 → Jul 1, all inside the 12wk lift window, ending near AS_OF.
const WEEKS = ['2026-05-06', '2026-05-13', '2026-05-20', '2026-05-27', '2026-06-03', '2026-06-10', '2026-06-17', '2026-06-24', '2026-07-01'];

function lift(canonical: string, name: string, values: number[]): ExerciseLogLite[] {
  // ⛔ `slot_intent: 'ME'` — the e1RM gate fails CLOSED since 2026-08-28: only a set the plan
  // asked to be maximal mints a max. These fixtures are MAIN-LIFT HEAVY sets, so they say so. An
  // unstamped row here would build no series at all and the test would be asserting on emptiness.
  return values.map((v, i) => ({ date: WEEKS[i], canonical_name: canonical, exercise_name: name, estimated_1rm: v, slot_intent: 'ME' }));
}

function inputs(exerciseRows: ExerciseLogLite[], allTimeBestByLift?: Record<string, { best: number; count: number }>): StateTrendInputs {
  return {
    asOf: AS_OF,
    exerciseRows,
    bikeRows: [], runJoined: [], swimRows: [],
    plannedBy: { strength: 2 },
    doneBy: { strength: 3 },
    cadenceCounts: { strength: 24 }, // ~1.9/wk → low min-session floor
    allTimeBestByLift,
  };
}

// ── REAL PR frame (2026-07-21): per_lift carries the ALL-TIME best, so a PR is a genuine new 1RM ──────
Deno.test('per_lift carries allTimeBestE1rm/allTimeCount; PR = latest is a new all-time high', () => {
  const rows = lift('bench_press', 'Bench Press', [200, 208, 216, 224, 232]); // 6wk window, latest 232
  // all-history says the real best-ever is 250 → the latest 232 is NOT a PR (only best-of-window).
  const notPr = toStateTrendsV1(assembleStateTrends(inputs(rows, { bench_press: { best: 250, count: 30 } })), AS_OF);
  const bp1 = (notPr.strength.per_lift as any[]).find((l) => l.canonical === 'bench_press');
  assertEquals(bp1.allTimeBestE1rm, 250);
  assertEquals(bp1.allTimeCount, 30);
  assertEquals(bp1.latestE1rm >= bp1.allTimeBestE1rm - 0.5, false); // 232 < 250 → NOT a PR

  // all-history best is 232 (the latest IS the all-time high) → a real PR.
  const isPr = toStateTrendsV1(assembleStateTrends(inputs(rows, { bench_press: { best: 232, count: 30 } })), AS_OF);
  const bp2 = (isPr.strength.per_lift as any[]).find((l) => l.canonical === 'bench_press');
  assertEquals(bp2.latestE1rm >= bp2.allTimeBestE1rm - 0.5, true); // 232 >= 232 → PR

  // no all-history supplied → allTimeBestE1rm null → the client can NEVER flag a PR (no invented records)
  const noData = toStateTrendsV1(assembleStateTrends(inputs(rows)), AS_OF);
  const bp3 = (noData.strength.per_lift as any[]).find((l) => l.canonical === 'bench_press');
  assertEquals(bp3.allTimeBestE1rm, null);
  assertEquals(bp3.allTimeCount, 0);
});

// ⛔ REWRITTEN FOR [D-420] (2026-08-12). The three tests that stood here pinned D-270's per-lift
// DIRECTION and the aggregate it rolled up to ("improving bench survives", "aggregate agrees").
// D-420 retires that verdict entirely — no commercial app computes a weekly strength direction, and on
// a 5/3/1 wave it reads the program's own light week as a decline (SCIENCE §6). What D-270 got RIGHT
// survives and is what these now pin: the spine owns the per-lift facts, the list keeps its
// granularity, and every arm reads that one list instead of re-deriving anything.
//
// ⚠️ THE INPUT SERIES ARE UNCHANGED ON PURPOSE — a clearly-rising bench and a clearly-falling squat.
// If a direction verdict is ever re-introduced, these are the two lifts that would light up first.
Deno.test('⛔ D-420: a clearly rising and a clearly falling lift BOTH state no direction', () => {
  const rows = [
    ...lift('bench_press', 'Bench Press', [200, 208, 216, 224, 232, 240, 248, 256, 264]), // clearly rising
    ...lift('squat', 'Squat', [320, 312, 304, 296, 288, 280, 272, 264, 256]),            // clearly falling
  ];
  const v1 = toStateTrendsV1(assembleStateTrends(inputs(rows)), AS_OF);
  const byLift = new Map(v1.strength.per_lift.map((l) => [l.canonical, l]));

  for (const canon of ['bench_press', 'squat']) {
    const l = byLift.get(canon)!;
    assert(l, `${canon} present in per_lift`);
    assertEquals(l.direction, 'needs_data');
    assertEquals(l.pctChange, null);
  }
  // The aggregate is a no-claim too, and it carries no magnitude to render ("sliding −8.2%").
  assertEquals(v1.strength.e1rm?.verdict ?? 'needs_data', 'needs_data');
  assertEquals(v1.strength.e1rm?.pctChange ?? null, null);
});

Deno.test('D-270 SURVIVES: per_lift keeps the granularity the aggregate used to roll away', () => {
  const rows = [
    ...lift('bench_press', 'Bench Press', [200, 208, 216, 224, 232, 240, 248, 256, 264]),
    ...lift('squat', 'Squat', [320, 312, 304, 296, 288, 280, 272, 264, 256]),
  ];
  const v1 = toStateTrendsV1(assembleStateTrends(inputs(rows)), AS_OF);
  const byLift = new Map(v1.strength.per_lift.map((l) => [l.canonical, l]));

  // What the row actually shows now: the reading, the record, the receipts — per lift, not collapsed.
  assertEquals(byLift.get('bench_press')!.latestE1rm, 264);
  assertEquals(byLift.get('bench_press')!.isPrimary, true);
  assertEquals(byLift.get('squat')!.latestE1rm, 256);
  assert(byLift.get('bench_press')!.sampleCount > 0, 'sample count is a receipt and survives');
});

Deno.test('⛔ D-420: the emitted strength contract contains no direction WORD at all', () => {
  // The whole-subtree assertion — the one that catches a direction leaking back in through a field
  // nobody thought to check. Michael's own case is the fixture in `strength-progress-record.test.ts`.
  const rows = [
    ...lift('bench_press', 'Bench Press', [200, 208, 216, 224, 232, 240, 248, 256, 264]),
    ...lift('squat', 'Squat', [320, 312, 304, 296, 288, 280, 272, 264, 256]),
  ];
  const v1 = toStateTrendsV1(assembleStateTrends(inputs(rows)), AS_OF);
  const json = JSON.stringify(v1.strength);
  for (const word of ['improving', 'sliding', 'trending', 'holding']) {
    assertEquals(json.includes(word), false, `strength contract must not contain "${word}": ${json.slice(0, 400)}`);
  }
});
