/**
 * Tests for D-038 Piece 1A — hasAlternatingPattern falls back to executed
 * pace when paceRange is null. Catches unplanned interval-class sessions
 * (the b70658b0 class) that previously defaulted to 'steady_state'.
 *
 * Run from repo root:
 *   deno test supabase/functions/analyze-running-workout/lib/heart-rate/detect-workout-type.test.ts --no-check
 */
import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { detectWorkoutType } from './detect-workout-type.ts';
import type { IntervalData } from './types.ts';

// ── Fixtures ──────────────────────────────────────────────────────────────

function lapsExecuted(paces: number[]): IntervalData[] {
  return paces.map((p) => ({
    role: 'lap',
    executed: { avgPaceSPerMi: p, durationS: 240 },
  }));
}

function lapsPlanned(ranges: Array<[number, number]>): IntervalData[] {
  return ranges.map(([lo, hi]) => ({
    role: 'work',
    paceRange: { lower: lo, upper: hi },
  }));
}

function lapsBoth(
  planned: Array<[number, number]>,
  executed: number[],
): IntervalData[] {
  return planned.map(([lo, hi], i) => ({
    role: 'work',
    paceRange: { lower: lo, upper: hi },
    executed: { avgPaceSPerMi: executed[i], durationS: 240 },
  }));
}

// ── Executed-pace fallback (the b70658b0 case) ────────────────────────────

Deno.test('D-038 1A: alternating executed pace on role="lap" with null paceRange detects intervals', () => {
  // Mirrors b70658b0: 7 laps alternating 602/543/487/594/465/607/539 sec/mi,
  // no planned workout, role='lap'. Pre-fix returned 'steady_state'; post-fix
  // should detect 'intervals' via hasAlternatingPattern executed fallback.
  const intervals = lapsExecuted([602, 543, 487, 594, 465, 607, 539]);
  const result = detectWorkoutType(intervals, undefined);
  assertEquals(result, 'intervals');
});

Deno.test('D-038 1A: steady executed pace (no significant alternations) stays steady_state', () => {
  // 7 laps within ±5% of 540 sec/mi — no alternations >15%, no false positive.
  const intervals = lapsExecuted([540, 545, 538, 542, 539, 543, 541]);
  const result = detectWorkoutType(intervals, undefined);
  assertEquals(result, 'steady_state');
});

Deno.test('D-038 1A: planned paceRange still wins over executed when both present', () => {
  // Planned pace ranges all steady-easy (480 sec/mi), but executed shows
  // alternations. The function should prefer planned signal when available.
  const planned: Array<[number, number]> = [
    [475, 485], [475, 485], [475, 485], [475, 485],
    [475, 485], [475, 485], [475, 485],
  ];
  const executed = [602, 543, 487, 594, 465, 607, 539];
  const intervals = lapsBoth(planned, executed);
  const result = detectWorkoutType(intervals, undefined);
  // Planned ranges all overlap → no alternations → not 'intervals' via the
  // alternating-pattern path. May still detect via other paths (multiple
  // work + recovery), but in this fixture there are no recovery-tagged laps.
  // Expected: 'steady_state' (planned signal wins, no alternation detected).
  assertEquals(result, 'steady_state');
});

Deno.test('D-038 1A: no paceRange + no executed → no false positive', () => {
  const intervals: IntervalData[] = [
    { role: 'lap' },
    { role: 'lap' },
    { role: 'lap' },
    { role: 'lap' },
  ];
  const result = detectWorkoutType(intervals, undefined);
  assertEquals(result, 'steady_state');
});

Deno.test('D-038 1A: too few laps (3) → never trips alternating-pattern detection', () => {
  // hasAlternatingPattern requires >=4 intervals before considering pattern.
  const intervals = lapsExecuted([600, 480, 600]);
  const result = detectWorkoutType(intervals, undefined);
  assertEquals(result, 'steady_state');
});

Deno.test('D-038 1A: pre-existing planned-paceRange path still works (regression)', () => {
  // Pure planned interval workout — pre-existing path, no executed fallback
  // needed. Locks the back-compat.
  const intervals = lapsPlanned([
    [420, 440], [600, 620], [420, 440], [600, 620],
    [420, 440], [600, 620],
  ]);
  const result = detectWorkoutType(intervals, undefined);
  assertEquals(result, 'intervals');
});
