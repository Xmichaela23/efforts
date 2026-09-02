/**
 * Fixtures for `run-paces-from-threshold.ts` — the easy-pace reference band off the threshold anchor.
 *
 * Run: deno test supabase/functions/_shared/run-paces-from-threshold.test.ts --no-check
 * Athlete-agnostic: synthetic numbers, never tuned to the primary user.
 */
import { assert, assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { pacesFromThresholdSecPerMi } from '../../../src/lib/run-paces-from-threshold.ts';
import { EASY_TO_THRESHOLD_PACE_RATIO } from '../../../src/lib/run-threshold-from-easy.ts';
import { getPacesFromScore } from '../generate-run-plan/effort-score.ts';

Deno.test('the band reproduces the pace table\'s easy column within the app\'s ±4% tolerance, across all 21 rows', () => {
  for (const v of [30, 32, 34, 36, 38, 40, 42, 44, 45, 46, 48, 50, 52, 54, 56, 58, 60, 65, 70, 75, 80]) {
    const t = getPacesFromScore(v);
    const d = pacesFromThresholdSecPerMi(t.steady)!;
    assert(Math.abs(d.easy - t.base) / t.base <= 0.04, `vdot ${v} easy ${d.easy} vs table ${t.base}`);
    assertEquals(d.threshold, t.steady);
  }
});

Deno.test('the ratio is the measured one and is imported, not re-stated', () => {
  assertEquals(EASY_TO_THRESHOLD_PACE_RATIO, 1.19);
  assertEquals(pacesFromThresholdSecPerMi(500)!.easy, 595);
});

Deno.test('easy is always slower than threshold', () => {
  for (const thr of [240, 330, 420, 540, 660]) {
    const p = pacesFromThresholdSecPerMi(thr)!;
    assert(p.threshold < p.easy, `thr ${thr}`);
  }
});

Deno.test('no threshold → null, never a default (Law 2)', () => {
  assertEquals(pacesFromThresholdSecPerMi(null), null);
  assertEquals(pacesFromThresholdSecPerMi(undefined), null);
  assertEquals(pacesFromThresholdSecPerMi(0), null);
  assertEquals(pacesFromThresholdSecPerMi(NaN), null);
});
