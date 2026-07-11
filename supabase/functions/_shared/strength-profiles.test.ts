import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { rirVerdictFromDelta, VERDICT_DEVIATION } from './strength-profiles.ts';

// The workout Details table, the workout AI prose, and the State row must all land in the SAME tier
// for a given (actual RIR − target RIR). This pins the shared band so the ±1.5 table outlier can't
// come back. Positive delta = more reps in reserve than target = the set was too easy.
Deno.test('rirVerdictFromDelta: one shared ±1.0 band (kills the ±1.5 table fork)', () => {
  // The exact fork case: delta in (1.0, 1.5] used to read 'on_target' in the table but 'too_easy' in
  // the prose on the same screen. Now both are 'too_easy'.
  assertEquals(rirVerdictFromDelta(1.2), 'too_easy');
  assertEquals(rirVerdictFromDelta(1.5), 'too_easy');

  // Boundaries match VERDICT_DEVIATION exactly (the band State uses).
  assertEquals(rirVerdictFromDelta(VERDICT_DEVIATION.ADD_WEIGHT), 'too_easy'); // 1.0 → too_easy
  assertEquals(rirVerdictFromDelta(VERDICT_DEVIATION.BACK_OFF), 'too_hard');   // -1.0 → too_hard
  assertEquals(rirVerdictFromDelta(0.9), 'on_target');
  assertEquals(rirVerdictFromDelta(-0.9), 'on_target');
  assertEquals(rirVerdictFromDelta(0), 'on_target');

  assertEquals(rirVerdictFromDelta(-1.2), 'too_hard');

  // Missing / non-finite → null (no fabricated verdict).
  assertEquals(rirVerdictFromDelta(null), null);
  assertEquals(rirVerdictFromDelta(undefined), null);
  assertEquals(rirVerdictFromDelta(NaN), null);
});
