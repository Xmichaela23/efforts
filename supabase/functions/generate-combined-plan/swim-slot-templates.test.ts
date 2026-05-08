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
