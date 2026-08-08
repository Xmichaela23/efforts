/**
 * Standalone-triathlon placement lock (2026-08-07).
 *
 * THE BUG THIS EXISTS FOR: this generator laid every week out from a literal table
 * (`DEFAULT_SLOT_DAYS` — `strength_1: 'Monday'`, `quality_run: 'Wednesday'`, …) with no long-run
 * guard, no hard/easy spacing and no dispersion. `strength_1` is the LOWER slot (sessionIndex 0),
 * so an athlete whose long run was Monday got knee-dominant strength ON the long run. Of the three
 * live generators this was the only one where that was reachable — `generate-combined-plan` and
 * `generate-run-plan` both route through guards that refuse it.
 *
 * `buildSlotMap` now derives the layout from `_shared/week-optimizer.ts`, the sole day-authority.
 * Two failure modes this locks that the first fix did not cover:
 *   1. the optimizer REFUSING a slot (no legal lower day) used to fall through to the literal —
 *      the refusal must reduce the session count, not resurrect Monday;
 *   2. an athlete `preferred_days.strength` pin overrides the optimizer by design, so the
 *      placement site keeps its own long-run guard.
 *
 * Run from repo root:
 *   deno test --no-check --no-lock --allow-all \
 *     supabase/functions/generate-triathlon-plan/slot-placement.test.ts
 */

import { assertEquals, assert } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { TriathlonGenerator } from './generators/tri-generator.ts';

type S = { day: string; type: string; name: string; tags?: string[] };

function buildPlan(over: Record<string, unknown>) {
  const gen = new TriathlonGenerator({
    distance: '70.3',
    fitness: 'intermediate',
    goal: 'complete',
    duration_weeks: 12,
    total_weeks: 12,
    strength_frequency: 2,
    ...over,
  } as never);
  return gen.generatePlan();
}

/** Weeks where a strength session shares the long run's day. */
function strengthOnLongRunDays(plan: { sessions_by_week: Record<string, S[]> }): string[] {
  const bad: string[] = [];
  for (const [wk, sessions] of Object.entries(plan.sessions_by_week)) {
    const longRunDays = new Set(
      sessions.filter((s) => (s.tags ?? []).includes('long_run')).map((s) => s.day),
    );
    for (const s of sessions) {
      if (s.type === 'strength' && longRunDays.has(s.day)) bad.push(`w${wk} ${s.day}: ${s.name}`);
    }
  }
  return bad;
}

Deno.test('strength never shares the long-run day — default layout', () => {
  const bad = strengthOnLongRunDays(buildPlan({}));
  assertEquals(bad, [], `strength on the long-run day: ${bad.join('; ')}`);
});

Deno.test('strength never shares the long-run day — long run on Monday (the original bug case)', () => {
  // Monday long run is the killer shape: the literal `strength_1: 'Monday'` collided with it, and
  // the 48h-pre rule also blocks Sunday, so the optimizer legitimately finds no lower day at all.
  const bad = strengthOnLongRunDays(buildPlan({ preferred_days: { long_run: 'monday' } }));
  assertEquals(bad, [], `strength on the long-run day: ${bad.join('; ')}`);
});

Deno.test('strength never shares the long-run day — for every possible long-run weekday', () => {
  const days = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
  const bad: string[] = [];
  for (const long_run of days) {
    for (const long_ride of days) {
      if (long_ride === long_run) continue;
      for (const d of strengthOnLongRunDays(buildPlan({ preferred_days: { long_run, long_ride } }))) {
        bad.push(`lr=${long_run} lride=${long_ride} ${d}`);
      }
    }
  }
  assertEquals(bad.length, 0, `${bad.length} violation(s); first: ${bad.slice(0, 5).join('; ')}`);
});

Deno.test('an athlete strength pin ON the long-run day is refused, not honored', () => {
  // A pin normally wins over the optimizer — it is a stated constraint. It does not win over the
  // long run, which is the one cell §8.2 says actually matters.
  const plan = buildPlan({
    preferred_days: { long_run: 'saturday', long_ride: 'sunday', strength: ['saturday', 'sunday'] },
  });
  const bad = strengthOnLongRunDays(plan);
  assertEquals(bad, [], `pinned strength landed on the long run: ${bad.join('; ')}`);

  // …and the other pinned day is still honored, so the guard drops one session rather than all.
  const anyStrength = Object.values(plan.sessions_by_week)
    .flat()
    .filter((s) => s.type === 'strength');
  assert(anyStrength.length > 0, 'the safe half of the pin should still produce strength sessions');
  assert(
    anyStrength.some((s) => s.day === 'Sunday'),
    `the safe pinned day (Sunday) should be used; got ${[...new Set(anyStrength.map((s) => s.day))].join(', ')}`,
  );
  // Saturday is the long run: never, in any week. Days other than the two pinned ones can appear —
  // `buildProtocolStrengthSession`'s pre-existing brick-collision swap redirects to quality_bike /
  // mid_ride in brick weeks, which is untouched by this change.
  assert(
    anyStrength.every((s) => s.day !== 'Saturday'),
    `strength landed on the long-run day in some week: ${anyStrength.filter((s) => s.day === 'Saturday').length} time(s)`,
  );
});

Deno.test('a refused slot reduces the session count instead of falling back to the literal', () => {
  // Monday long run → optimizer places upper only and reports a conflict for lower. The generator
  // must ship 1× that week, NOT 2× with the second on the literal Monday.
  const plan = buildPlan({ preferred_days: { long_run: 'monday' } });
  const wk = plan.sessions_by_week['3'] ?? [];
  const strength = wk.filter((s: S) => s.type === 'strength');
  assertEquals(strength.length, 1, `expected 1 strength session, got ${strength.length}`);
  assert(strength[0]!.day !== 'Monday', 'the surviving session must not be on the long-run day');
});
