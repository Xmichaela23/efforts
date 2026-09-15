/**
 * Fixtures for `run-paces-from-threshold.ts` — the easy pace RANGE off the threshold anchor (§9 Q2, D-478).
 *
 * Run: deno test supabase/functions/_shared/run-paces-from-threshold.test.ts --no-check
 * Athlete-agnostic: synthetic numbers, never tuned to the primary user.
 */
import { assert, assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { pacesFromThresholdSecPerMi } from '../../../src/lib/run-paces-from-threshold.ts';
import { EASY_PACE_FAST_X_THRESHOLD, EASY_PACE_SLOW_X_THRESHOLD } from '../../../src/lib/friel-zones.ts';

Deno.test('Friel run Zone 2: threshold × 1.14 to × 1.29, imported beside the heart-rate seams', () => {
  assertEquals(EASY_PACE_FAST_X_THRESHOLD, 1.14);
  assertEquals(EASY_PACE_SLOW_X_THRESHOLD, 1.29);
  // The approved screen example: an 8:00/mi threshold → 9:07–10:19/mi.
  const p = pacesFromThresholdSecPerMi(480)!;
  assertEquals(p.easy.lo, 547);   // 9:07
  assertEquals(p.easy.hi, 619);   // 10:19
  assertEquals(p.easy.mid, 583);  // the range midpoint, for readers that need one number
  assertEquals(p.threshold, 480);
});

Deno.test('the whole range is slower than threshold, fast edge first', () => {
  for (const thr of [240, 330, 420, 540, 660]) {
    const p = pacesFromThresholdSecPerMi(thr)!;
    assert(p.threshold < p.easy.lo && p.easy.lo < p.easy.mid && p.easy.mid < p.easy.hi, `thr ${thr}`);
  }
});

Deno.test('no threshold → null, never a default (Law 2)', () => {
  assertEquals(pacesFromThresholdSecPerMi(null), null);
  assertEquals(pacesFromThresholdSecPerMi(undefined), null);
  assertEquals(pacesFromThresholdSecPerMi(0), null);
  assertEquals(pacesFromThresholdSecPerMi(NaN), null);
});
