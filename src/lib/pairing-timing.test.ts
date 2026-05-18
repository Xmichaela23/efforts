/**
 * Tests for `orderDayWorkoutsByTimingThenDiscipline` — the single day-stacked
 * ordering helper (extracted from AllPlansInterface; now also consumed by
 * WorkoutCalendar). Covers the calendar-cell ordering bug fix:
 *   - endurance_first run+lower → Run before Strength
 *   - strength_first run+lower → Strength before Run (proves pref is honored,
 *     not just discipline-rank — discipline-rank alone is always run<strength)
 *   - swim+upper (no lower → no AM/PM) → discipline-rank tiebreaker
 *     (swim before upper) — the documented Q-001 cosmetic, NOT pref-driven
 *   - accessor variant: CalendarEvent-style { _src } wrappers via (e)=>e._src
 *     order identically to bare workout objects (guards the Flag-1 generalization)
 *
 * Run from repo root:
 *   deno test --no-lock --allow-all src/lib/pairing-timing.test.ts
 */
import { assert, assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { orderDayWorkoutsByTimingThenDiscipline } from './pairing-timing.ts';

const qualityRun = { type: 'run', tags: ['quality'], name: 'Quality Run 4×1mi' };
const lowerStrength = { type: 'strength', tags: ['lower_body'], name: 'Strength (Lower)' };
const upperStrength = { type: 'strength', tags: ['upper_body'], name: 'Strength (Upper)' };
const swim = { type: 'swim', tags: [], name: 'Swim — Drills' };

Deno.test('endurance_first: run+lower → Run before Strength (the Thursday bug)', () => {
  // Input deliberately Strength-first to prove the helper reorders it.
  const out = orderDayWorkoutsByTimingThenDiscipline([lowerStrength, qualityRun], 'endurance_first');
  assertEquals(out.map((w) => w.type), ['run', 'strength']);
});

Deno.test('strength_first: run+lower → Strength before Run (pref honored, not just discipline-rank)', () => {
  const out = orderDayWorkoutsByTimingThenDiscipline([qualityRun, lowerStrength], 'strength_first');
  assertEquals(out.map((w) => w.type), ['strength', 'run']);
  // Discipline-rank alone would force run(2) < strength(3); strength-first here
  // can ONLY come from the AM/PM timing path → confirms the pref is applied.
});

Deno.test('swim+upper: no lower → discipline-rank tiebreaker, swim before upper (Q-001 cosmetic, pref-agnostic)', () => {
  for (const pref of ['endurance_first', 'strength_first'] as const) {
    const out = orderDayWorkoutsByTimingThenDiscipline([upperStrength, swim], pref);
    assertEquals(out.map((w) => w.type), ['swim', 'strength'], `pref=${pref}`);
  }
});

Deno.test('accessor: CalendarEvent { _src } wrappers order identically to bare workouts', () => {
  const wrap = (w: unknown) => ({ date: '2026-05-21', label: 'x', _src: w });
  const wrapped = [wrap(lowerStrength), wrap(qualityRun)];
  const out = orderDayWorkoutsByTimingThenDiscipline(wrapped, 'endurance_first', (e) => e._src);
  assertEquals(out.map((e) => (e._src as { type: string }).type), ['run', 'strength']);
  // wrappers preserved (not replaced by _src), date intact
  assert(out.every((e) => e.date === '2026-05-21' && '_src' in e));
});

Deno.test('degenerate inputs: ≤1 item or non-array → safe copy / empty', () => {
  assertEquals(orderDayWorkoutsByTimingThenDiscipline([qualityRun], 'endurance_first'), [qualityRun]);
  assertEquals(orderDayWorkoutsByTimingThenDiscipline([], 'endurance_first'), []);
  assertEquals(orderDayWorkoutsByTimingThenDiscipline(null as unknown as unknown[], 'endurance_first'), []);
});
