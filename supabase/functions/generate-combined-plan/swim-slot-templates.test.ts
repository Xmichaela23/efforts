/**
 * Swim slot template selection — run:
 *   deno test supabase/functions/generate-combined-plan/swim-slot-templates.test.ts --allow-read
 */
import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import {
  countSwimAnchorSlotsForProgramTemplates,
  getSwimSlotTemplates,
  swimProgramIntentForAnchorSlots,
} from '../_shared/swim-program-templates.ts';

Deno.test('swimProgramIntentForAnchorSlots — focus requires three swim anchors', () => {
  assertEquals(swimProgramIntentForAnchorSlots('focus', 2), 'race');
  assertEquals(swimProgramIntentForAnchorSlots('focus', 3), 'focus');
  assertEquals(swimProgramIntentForAnchorSlots('race', 2), 'race');
  assertEquals(swimProgramIntentForAnchorSlots('Focus', 3), 'focus');
});

Deno.test('focus + three-entry prefs but two pins → race rotation week 2 (no css slot)', () => {
  const slots = countSwimAnchorSlotsForProgramTemplates(
    { swim_easy_day: 1, swim_quality_day: 4 },
    { preferred_days: { swim: ['monday', 'tuesday', 'wednesday'] } },
  );
  assertEquals(slots, 2);
  const intent = swimProgramIntentForAnchorSlots('focus', slots);
  assertEquals(intent, 'race');
  const w2 = getSwimSlotTemplates(intent, 'build', '70.3', 1, {
    athleteFitness: 'intermediate',
    planWeekNumber: 2,
  });
  assertEquals(w2.map((s) => s.session_type), ['threshold', 'pull_focused']);
});

Deno.test('focus with two anchors uses race rotation — quality swim stays threshold week 2', () => {
  const intent = swimProgramIntentForAnchorSlots('focus', 2);
  assertEquals(intent, 'race');
  const w2 = getSwimSlotTemplates(intent, 'build', '70.3', 1, {
    athleteFitness: 'intermediate',
    planWeekNumber: 2,
  });
  assertEquals(w2.map((s) => s.session_type), ['threshold', 'pull_focused']);
});

Deno.test('getSwimSlotTemplates — build alternates pull (even) and kick (odd) on slot 1', () => {
  const even = getSwimSlotTemplates('focus', 'build', '70.3', 2, { athleteFitness: 'intermediate' });
  assertEquals(even[1]?.session_type, 'pull_focused');
  const odd = getSwimSlotTemplates('focus', 'build', '70.3', 1, { athleteFitness: 'intermediate' });
  assertEquals(odd[1]?.session_type, 'kick_focused');
});

Deno.test('getSwimSlotTemplates — race_specific week 2 uses pull on slot 1', () => {
  const rs = getSwimSlotTemplates('focus', 'race_specific', '70.3', 2, {
    athleteFitness: 'intermediate',
  });
  assertEquals(rs[1]?.session_type, 'pull_focused');
});

Deno.test('getSwimSlotTemplates — race_specific odd week without pull uses kick', () => {
  const rs = getSwimSlotTemplates('focus', 'race_specific', '70.3', 3, {
    athleteFitness: 'intermediate',
  });
  assertEquals(rs[1]?.session_type, 'kick_focused');
});

Deno.test('getSwimSlotTemplates — race_specific week divisible by 10 uses pull on slot 1', () => {
  const rs = getSwimSlotTemplates('focus', 'race_specific', '70.3', 10, {
    athleteFitness: 'intermediate',
  });
  assertEquals(rs[1]?.session_type, 'pull_focused');
});

Deno.test('getSwimSlotTemplates — race intent 4-week rotation uses planWeekNumber', () => {
  const w1 = getSwimSlotTemplates('race', 'build', '70.3', 1, {
    athleteFitness: 'intermediate',
    planWeekNumber: 1,
  });
  assertEquals(
    w1.map((s) => s.session_type),
    ['threshold', 'race_specific_aerobic'],
  );

  const w2 = getSwimSlotTemplates('race', 'build', '70.3', 1, {
    athleteFitness: 'intermediate',
    planWeekNumber: 2,
  });
  assertEquals(w2.map((s) => s.session_type), ['threshold', 'pull_focused']);

  const w3 = getSwimSlotTemplates('race', 'build', '70.3', 1, {
    athleteFitness: 'intermediate',
    planWeekNumber: 3,
  });
  assertEquals(w3.map((s) => s.session_type), ['technique_aerobic', 'race_specific_aerobic']);

  const w4 = getSwimSlotTemplates('race', 'build', '70.3', 1, {
    athleteFitness: 'intermediate',
    planWeekNumber: 4,
  });
  assertEquals(w4.map((s) => s.session_type), ['threshold', 'speed']);

  const w5 = getSwimSlotTemplates('race', 'build', '70.3', 1, {
    athleteFitness: 'intermediate',
    planWeekNumber: 5,
  });
  assertEquals(
    w5.map((s) => s.session_type),
    ['threshold', 'race_specific_aerobic'],
  );
});

Deno.test('getSwimSlotTemplates — taper race intent ignores rotation (fixed threshold + race-specific)', () => {
  const tw = getSwimSlotTemplates('race', 'taper', '70.3', 1, {
    athleteFitness: 'intermediate',
    planWeekNumber: 4,
  });
  assertEquals(
    tw.map((s) => s.session_type),
    ['threshold', 'race_specific_aerobic'],
  );
});

// ── SWIM-PROTOCOL §10.6 pin tests — fitness-tier session-type selection ─────
// Beginner gets the substituted rotation (§10.3 / §10.4); intermediate /
// advanced unchanged. Plan #78 closure: Week 1 beginner → [css_aerobic,
// technique_aerobic] instead of [threshold, race_specific_aerobic].

Deno.test('§10.3: beginner Week 1 race-intent → [css_aerobic, technique_aerobic]', () => {
  const w1 = getSwimSlotTemplates('race', 'build', '70.3', 1, {
    athleteFitness: 'beginner',
    planWeekNumber: 1,
  });
  assertEquals(w1.map((s) => s.session_type), ['css_aerobic', 'technique_aerobic']);
});

Deno.test('§10.3 no-regression: intermediate Week 1 race-intent → [threshold, race_specific_aerobic]', () => {
  const w1 = getSwimSlotTemplates('race', 'build', '70.3', 1, {
    athleteFitness: 'intermediate',
    planWeekNumber: 1,
  });
  assertEquals(w1.map((s) => s.session_type), ['threshold', 'race_specific_aerobic']);
});

Deno.test('§10.3 no-regression: advanced Week 1 race-intent → [threshold, race_specific_aerobic]', () => {
  const w1 = getSwimSlotTemplates('race', 'build', '70.3', 1, {
    athleteFitness: 'advanced',
    planWeekNumber: 1,
  });
  assertEquals(w1.map((s) => s.session_type), ['threshold', 'race_specific_aerobic']);
});

Deno.test('§10.3: beginner race-intent rotation full cycle (planWeek 1-4)', () => {
  const week = (n: number) => getSwimSlotTemplates('race', 'build', '70.3', 1, {
    athleteFitness: 'beginner',
    planWeekNumber: n,
  }).map((s) => s.session_type);
  // Per §10.3 realized table.
  assertEquals(week(1), ['css_aerobic', 'technique_aerobic']);
  assertEquals(week(2), ['css_aerobic', 'pull_focused']);
  assertEquals(week(3), ['technique_aerobic', 'technique_aerobic']);
  assertEquals(week(4), ['css_aerobic', 'technique_aerobic']); // 4 % 4 === 0
});

Deno.test('§10.4: beginner focus-intent → [css_aerobic, technique_aerobic, recovery]', () => {
  // weekInPhase=2 (even) so slot 1 alternation lands on pull_focused for non-
  // beginner — but for beginner, slot 1 alternation still applies and the
  // alternation predicate (build + even week) still routes through pull_focused.
  // Use weekInPhase=4 (build, even) → slot 1 = pull_focused for the non-beginner
  // case; for beginner the slot 0 / slot 2 substitution should still hold.
  // Pick weekInPhase=1 odd → slot 1 alternation lands on kick_focused for build,
  // but the substitution is at slot 0 / slot 2, so for §10.4 we assert across the
  // template baseline only (base phase, no alternation).
  const slots = getSwimSlotTemplates('focus', 'base', '70.3', 1, {
    athleteFitness: 'beginner',
  });
  assertEquals(slots.map((s) => s.session_type), ['css_aerobic', 'technique_aerobic', 'recovery']);
});

Deno.test('§10.4 no-regression: intermediate focus-intent → [threshold, technique_aerobic, css_aerobic]', () => {
  const slots = getSwimSlotTemplates('focus', 'base', '70.3', 1, {
    athleteFitness: 'intermediate',
  });
  assertEquals(slots.map((s) => s.session_type), ['threshold', 'technique_aerobic', 'css_aerobic']);
});

Deno.test('§10.4: beginner focus build preserves pull/kick alternation on slot 1', () => {
  // §10.4 last paragraph: phase-driven pull/kick rotation stays applicable for
  // beginners (both types §10.2-allowed). Even build week → pull; odd → kick.
  const evenBuild = getSwimSlotTemplates('focus', 'build', '70.3', 2, {
    athleteFitness: 'beginner',
  });
  assertEquals(evenBuild[1]?.session_type, 'pull_focused');
  const oddBuild = getSwimSlotTemplates('focus', 'build', '70.3', 1, {
    athleteFitness: 'beginner',
  });
  assertEquals(oddBuild[1]?.session_type, 'kick_focused');
  // Slot 0 and slot 2 still beginner-substituted regardless of alternation.
  assertEquals(evenBuild[0]?.session_type, 'css_aerobic');
  assertEquals(evenBuild[2]?.session_type, 'recovery');
});

Deno.test('§10.8: beginner substitution is distance-agnostic (sprint / olympic / full IM)', () => {
  // Same substitution map applies across all race distances per §10.8.
  for (const dist of ['sprint', 'olympic', '70.3', 'full']) {
    const w1 = getSwimSlotTemplates('race', 'build', dist, 1, {
      athleteFitness: 'beginner',
      planWeekNumber: 1,
    });
    assertEquals(
      w1.map((s) => s.session_type),
      ['css_aerobic', 'technique_aerobic'],
      `beginner Week 1 race-intent at ${dist} must match the §10.3 substitution`,
    );
  }
});

Deno.test('§10.3 + taper: beginner race-intent taper uses substituted meta (no threshold)', () => {
  // Taper bypass in getSwimSlotTemplates also routes through the beginner emitter.
  const tw = getSwimSlotTemplates('race', 'taper', '70.3', 1, {
    athleteFitness: 'beginner',
    planWeekNumber: 4,
  });
  assertEquals(tw.map((s) => s.session_type), ['css_aerobic', 'technique_aerobic']);
});
