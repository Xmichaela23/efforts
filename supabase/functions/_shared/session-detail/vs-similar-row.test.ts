/**
 * Tests for formatCyclingVsSimilarRow — the cycling vs-similar context row built
 * from workout_analysis.vs_similar_v1 (Tier 3 item 10 / D-010).
 *
 * vs_similar_v1 only carries np_delta_w (current − avg of matched rides); the
 * absolute "avg" NP is reconstructed as currentNp − np_delta_w.
 *
 * Run from repo root:
 *   deno test supabase/functions/_shared/session-detail/vs-similar-row.test.ts --no-check
 */
import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { formatCyclingVsSimilarRow } from './build.ts';

Deno.test('full case: current NP present → "NP X vs Y avg on similar [type] rides — [assessment]"', () => {
  const vs = { sample_size: 5, matched_type: 'threshold', np_delta_w: 12, if_delta: 0.04, assessment: 'above_typical' };
  assertEquals(formatCyclingVsSimilarRow(vs, 224), {
    label: 'vs similar',
    value: 'NP 224W vs 212W avg on similar threshold rides — above typical',
  });
});

Deno.test('negative delta: avg is reconstructed as current − np_delta_w', () => {
  const vs = { sample_size: 4, matched_type: 'sweet_spot', np_delta_w: -15, assessment: 'below_typical' };
  assertEquals(formatCyclingVsSimilarRow(vs, 200), {
    label: 'vs similar',
    value: 'NP 200W vs 215W avg on similar sweet spot rides — below typical',
  });
});

Deno.test('gate: null vs_similar_v1 → null (contractually null below 3 matches)', () => {
  assertEquals(formatCyclingVsSimilarRow(null, 224), null);
  assertEquals(formatCyclingVsSimilarRow(undefined, 224), null);
});

Deno.test('gate: non-finite np_delta_w → null (cannot reconstruct the comparison)', () => {
  assertEquals(formatCyclingVsSimilarRow({ matched_type: 'threshold' }, 224), null);
  assertEquals(formatCyclingVsSimilarRow({ np_delta_w: null, assessment: 'typical' }, 224), null);
});

Deno.test('no current NP → fallback to signed delta phrasing (still renders)', () => {
  const vs = { sample_size: 5, matched_type: 'threshold', np_delta_w: 12, assessment: 'above_typical' };
  assertEquals(formatCyclingVsSimilarRow(vs, null), {
    label: 'vs similar',
    value: 'NP +12W vs avg on similar threshold rides — above typical',
  });
  assertEquals(formatCyclingVsSimilarRow({ np_delta_w: -8, assessment: 'below_typical' }, undefined), {
    label: 'vs similar',
    value: 'NP -8W vs avg on similar similar rides — below typical',
  });
});

Deno.test('missing matched_type → "similar rides"; missing assessment → no tail', () => {
  assertEquals(formatCyclingVsSimilarRow({ np_delta_w: 5 }, 240), {
    label: 'vs similar',
    value: 'NP 240W vs 235W avg on similar similar rides',
  });
});
