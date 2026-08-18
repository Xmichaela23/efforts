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

Deno.test('⛔ THE BARBELL GOES FIRST ON A QUALITY PAIR — WHICHEVER PREFERENCE IS SET', () => {
  /**
   * ⛔ THIS ASSERTED THE OPPOSITE UNTIL 2026-08-18 ("endurance_first: run+lower → Run before
   * Strength"), and it was showing the athlete the INVERSE of their own plan. The composer emits the
   * pairing as `order: 'lift_first'` with a 6h gap and the session copy says so; this layer was
   * defaulting a quality pair to endurance-first, so the card read "Flat Sprints" above "Back
   * Squat".
   *
   * ⛔ IT IS LAW, NOT A PREFERENCE, WHICH IS WHY BOTH VALUES NOW GIVE THE SAME ANSWER. The whole
   * consolidation arrangement is Eddens — resistance BEFORE endurance — and the physiology is
   * one-way: sprints and 3-minute climbs empty local glycogen and fatigue the CNS, and a heavy bar
   * after them is lifted on compromised stabilisers.
   * ⛔ Do not restore the preference here to "give the athlete the choice"; the choice it offered was
   * to invert a law.
   */
  for (const pref of ['endurance_first', 'strength_first'] as const) {
    const out = orderDayWorkoutsByTimingThenDiscipline([qualityRun, lowerStrength], pref);
    assertEquals(out.map((w) => w.type), ['strength', 'run'], `pref=${pref}`);
    // And the input order does not decide it either.
    const flipped = orderDayWorkoutsByTimingThenDiscipline([lowerStrength, qualityRun], pref);
    assertEquals(flipped.map((w) => w.type), ['strength', 'run'], `pref=${pref} (flipped input)`);
  }
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
  // ⚠️ `strength, run` NOW — the quality pair lifts first whatever the preference says (2026-08-18).
  // This test is about the ACCESSOR reaching through the wrapper, not about the order itself.
  assertEquals(out.map((e) => (e._src as { type: string }).type), ['strength', 'run']);
  // wrappers preserved (not replaced by _src), date intact
  assert(out.every((e) => e.date === '2026-05-21' && '_src' in e));
});

Deno.test('degenerate inputs: ≤1 item or non-array → safe copy / empty', () => {
  assertEquals(orderDayWorkoutsByTimingThenDiscipline([qualityRun], 'endurance_first'), [qualityRun]);
  assertEquals(orderDayWorkoutsByTimingThenDiscipline([], 'endurance_first'), []);
  assertEquals(orderDayWorkoutsByTimingThenDiscipline(null as unknown as unknown[], 'endurance_first'), []);
});
