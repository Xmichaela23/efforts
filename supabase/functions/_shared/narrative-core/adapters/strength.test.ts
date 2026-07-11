import { assert, assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { strengthAdapter } from './strength.ts';
import { spineDirectionToTrend } from '../../state-trend/strength.ts';

// D-270 continuity: the per-workout "getting stronger" DIRECTION claim reads the SPINE per-lift trend,
// not a prior-session delta. These pin the two deterministic pieces of that wiring.

Deno.test('spineDirectionToTrend: spine verdict → narrative up/flat/down (needs_data → null)', () => {
  assertEquals(spineDirectionToTrend('improving'), 'up');
  assertEquals(spineDirectionToTrend('sliding'), 'down');
  assertEquals(spineDirectionToTrend('holding'), 'flat');
  assertEquals(spineDirectionToTrend('needs_data'), null); // no history → no trend claim
  assertEquals(spineDirectionToTrend(null), null);
  assertEquals(spineDirectionToTrend(undefined), null);
});

Deno.test('strengthAdapter: a DIRECTION claim is grounded by the SPINE, not by a prior session', () => {
  // Spine threaded + a real direction → trend grounded.
  const withSpine = strengthAdapter.buildContext({
    e1rm_by_exercise: [{ exercise: 'Bench', prior_e1rm: 225, spine_direction: 'up' }],
  });
  assert(withSpine.hasTrendField, 'spine direction present → trend claim allowed');

  // The fork case: a prior session EXISTS (session-local "down"), but the spine says no trend
  // (spine_direction null) → NO direction claim. Previously this would have grounded a trend.
  const spineSaysNoTrend = strengthAdapter.buildContext({
    e1rm_by_exercise: [{ exercise: 'Bench', prior_e1rm: 225, spine_direction: null }],
  });
  assertEquals(spineSaysNoTrend.hasTrendField, false, 'prior session alone must NOT ground a trend');

  // Fallback: a caller that never threads spine_direction keeps prior behavior (prior session grounds it).
  const legacy = strengthAdapter.buildContext({
    e1rm_by_exercise: [{ exercise: 'Bench', prior_e1rm: 225 }],
  });
  assert(legacy.hasTrendField, 'un-threaded caller falls back to prior-session grounding');
});
