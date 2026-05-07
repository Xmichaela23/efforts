/**
 * Swim protocol v2.1 unit checks — run from repo root:
 *   deno test supabase/functions/generate-combined-plan/swim-protocol-v21.test.ts --allow-read
 */
import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import {
  applyOverdistanceIfApplicable,
  calculateSwimTss,
  kickFocusRequiredGear,
  resolveCssSecPer100Yd,
} from './swim-protocol-v21.ts';

Deno.test('applyOverdistanceIfApplicable — Full IM advanced endurance window', () => {
  assertEquals(
    applyOverdistanceIfApplicable(3200, {
      raceDistance: 'full',
      athleteFitness: 'advanced',
      phase: 'build',
      weekInPhase: 4,
      sessionType: 'endurance',
    }),
    4600,
  );
  assertEquals(
    applyOverdistanceIfApplicable(3200, {
      raceDistance: 'full',
      athleteFitness: 'advanced',
      phase: 'build',
      weekInPhase: 3,
      sessionType: 'endurance',
    }),
    3200,
  );
  assertEquals(
    applyOverdistanceIfApplicable(3200, {
      raceDistance: 'full',
      athleteFitness: 'intermediate',
      phase: 'build',
      weekInPhase: 5,
      sessionType: 'endurance',
    }),
    3200,
  );
  assertEquals(
    applyOverdistanceIfApplicable(3000, {
      raceDistance: 'full',
      athleteFitness: 'advanced',
      phase: 'race_specific',
      weekInPhase: 2,
      sessionType: 'endurance',
    }),
    4600,
  );
  assertEquals(
    applyOverdistanceIfApplicable(4800, {
      raceDistance: 'full',
      athleteFitness: 'advanced',
      phase: 'build',
      weekInPhase: 4,
      sessionType: 'endurance',
    }),
    4600,
  );
});

Deno.test('calculateSwimTss kick_focused uses distance-specific IF', () => {
  assertEquals(calculateSwimTss('kick_focused', 30, 'sprint'), 28);
  assertEquals(calculateSwimTss('kick_focused', 30, '70.3'), 18);
});

Deno.test('calculateSwimTss pull_focused uses IF 0.80', () => {
  assertEquals(calculateSwimTss('pull_focused', 60, '70.3'), 64);
});

Deno.test('kickFocusRequiredGear branches on race distance', () => {
  assertEquals(kickFocusRequiredGear('olympic'), ['kickboard']);
  assertEquals(kickFocusRequiredGear('full'), ['fins']);
});

Deno.test('resolveCssSecPer100Yd default and parsed pace', () => {
  assertEquals(resolveCssSecPer100Yd(undefined), 105);
  assertEquals(resolveCssSecPer100Yd('2:00'), 120);
});
