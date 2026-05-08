/**
 * Recovery learner two-swim maintenance — run:
 *   deno test supabase/functions/generate-combined-plan/swim-recovery-learner.test.ts --allow-read
 */
import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import {
  countSwimAnchorSlotsForRecovery,
  countSwimAnchorSlotsForProgramTemplates,
  getTwoSlotRecoveryLearnerSwimTemplates,
  shouldMaintainTwoSwimsInRecovery,
} from '../_shared/swim-program-templates.ts';

Deno.test('countSwimAnchorSlotsForProgramTemplates — min when prefs list three days but two pins', () => {
  assertEquals(
    countSwimAnchorSlotsForProgramTemplates(
      { swim_easy_day: 1, swim_quality_day: 4 },
      { preferred_days: { swim: ['monday', 'tuesday', 'wednesday'] } },
    ),
    2,
  );
});

Deno.test('countSwimAnchorSlotsForProgramTemplates — matches prefs when pins absent', () => {
  assertEquals(
    countSwimAnchorSlotsForProgramTemplates(
      {},
      { preferred_days: { swim: ['monday', 'thursday'] } },
    ),
    2,
  );
});

Deno.test('countSwimAnchorSlotsForProgramTemplates — pins only when prefs empty', () => {
  assertEquals(
    countSwimAnchorSlotsForProgramTemplates(
      { swim_easy_day: 1, swim_quality_day: 4, swim_third_day: 3 },
      {},
    ),
    3,
  );
});

Deno.test('shouldMaintainTwoSwimsInRecovery — learning + 2 anchors', () => {
  assertEquals(shouldMaintainTwoSwimsInRecovery('learning', 'intermediate', 2), true);
});

Deno.test('shouldMaintainTwoSwimsInRecovery — beginner fitness + 2 anchors', () => {
  assertEquals(shouldMaintainTwoSwimsInRecovery(undefined, 'beginner', 2), true);
});

Deno.test('shouldMaintainTwoSwimsInRecovery — intermediate steady + 2 anchors', () => {
  assertEquals(shouldMaintainTwoSwimsInRecovery('steady', 'intermediate', 2), false);
});

Deno.test('shouldMaintainTwoSwimsInRecovery — learning but only 1 anchor', () => {
  assertEquals(shouldMaintainTwoSwimsInRecovery('learning', 'intermediate', 1), false);
});

Deno.test('countSwimAnchorSlotsForRecovery — prefers max of prefs length vs pins', () => {
  const n = countSwimAnchorSlotsForRecovery(
    { swim_easy_day: 1, swim_quality_day: 1 },
    { preferred_days: { swim: ['monday', 'tuesday'] } },
  );
  assertEquals(n >= 2, true);
});

Deno.test('getTwoSlotRecoveryLearnerSwimTemplates — 70.3 vs full yards', () => {
  const half = getTwoSlotRecoveryLearnerSwimTemplates('70.3');
  assertEquals(half.length, 2);
  assertEquals(half[0]?.recovery_learner_easy_structure, true);
  assertEquals(half[0]?.target_yards, 800);
  assertEquals(half[1]?.session_type, 'technique_aerobic');

  const full = getTwoSlotRecoveryLearnerSwimTemplates('full');
  assertEquals(full[0]?.target_yards, 1000);
});
