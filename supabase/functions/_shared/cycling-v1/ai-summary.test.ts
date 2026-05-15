/**
 * Tests for cyclingCrossWorkoutDisplay — the compact cross-workout block surfaced
 * into the cycling AI summary (parity with analyze-running-workout's
 * derived.comparisons). The numbers it emits are what validateNoNewNumbers
 * whitelists, so shape correctness matters for the narrative.
 *
 * Run from repo root:
 *   deno test supabase/functions/_shared/cycling-v1/ai-summary.test.ts --no-check
 */
import { assert, assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { cyclingCrossWorkoutDisplay, validateNoNewNumbers } from './ai-summary.ts';

// ── Item 1: loosened numeric validator (running parity) ─────────────────────

Deno.test('validator: "187W" and "187 W" both accepted when packet contains 187', () => {
  const packet = JSON.stringify({ power: { np: '187 W' }, hr: { avg: '142 bpm' } });
  // "187W": \b\d+\b does not match inside (W is a word char) → no token → accepted
  assertEquals(validateNoNewNumbers('NP held at 187W for the block.', packet).ok, true);
  // "187 W": yields token "187" → substring-matches the packet → accepted
  assertEquals(validateNoNewNumbers('NP held at 187 W for the block.', packet).ok, true);
});

Deno.test('validator: a genuine new number is still rejected', () => {
  const packet = JSON.stringify({ power: { np: '187 W' } });
  const r = validateNoNewNumbers('NP averaged 999 across the ride.', packet);
  assertEquals(r.ok, false);
  assert(r.bad.includes('999'));
});

Deno.test('validator: trivial token "1" is skipped (matches running)', () => {
  const packet = JSON.stringify({ power: { np: '187 W' } });
  assertEquals(validateNoNewNumbers('This was the 1 standout effort.', packet).ok, true);
});

Deno.test('validator: decimals and percentages substring-match the packet', () => {
  const packet = JSON.stringify({ power: { if: '1.06' }, cross_workout: { limiter: { detail: 'NP +9% vs 90-day mean' } } });
  assertEquals(validateNoNewNumbers('IF was 1.06, NP trending +9%.', packet).ok, true);
  // 1.07 is not in the packet → rejected
  assertEquals(validateNoNewNumbers('IF was 1.07.', packet).ok, false);
});

Deno.test('null / empty input → null (no cross-workout signal)', () => {
  assertEquals(cyclingCrossWorkoutDisplay(null), null);
  assertEquals(cyclingCrossWorkoutDisplay(undefined), null);
  assertEquals(cyclingCrossWorkoutDisplay({}), null);
  assertEquals(cyclingCrossWorkoutDisplay({ vsSimilar: null, achievements: null, npTrend: null, limiter: null }), null);
});

Deno.test('vs_similar → shaped block; null np_delta_w drops it (Number(null)===0 trap)', () => {
  const out = cyclingCrossWorkoutDisplay({
    vsSimilar: { sample_size: 5, matched_type: 'threshold', np_delta_w: 12, if_delta: 0.041, assessment: 'above_typical' },
  });
  assertEquals(out, {
    vs_similar: { matched_type: 'threshold', sample_size: 5, np_delta_w: 12, if_delta: 0.04, assessment: 'above_typical' },
  });
  // np_delta_w null → no vs_similar (and nothing else) → whole block null
  assertEquals(cyclingCrossWorkoutDisplay({ vsSimilar: { matched_type: 'threshold', np_delta_w: null } }), null);
});

Deno.test('np_trend: ≥3 points → direction + delta_w; <3 points → omitted', () => {
  const improving = cyclingCrossWorkoutDisplay({
    npTrend: { points: [
      { date: '2026-04-01', value: 200 },
      { date: '2026-04-08', value: 210 },
      { date: '2026-04-15', value: 230 },
      { date: '2026-04-22', value: 240, is_current: true },
    ] },
  });
  assert(improving?.np_trend);
  assertEquals(improving.np_trend.points, 4);
  assertEquals(improving.np_trend.direction, 'improving');
  // first half avg (200,210)=205; second half (230,240)=235; delta +30
  assertEquals(improving.np_trend.delta_w, 30);

  assertEquals(cyclingCrossWorkoutDisplay({ npTrend: { points: [{ date: '2026-04-01', value: 200 }, { date: '2026-04-08', value: 210 }] } }), null);
});

Deno.test('np_trend: near-flat series → stable', () => {
  const out = cyclingCrossWorkoutDisplay({
    npTrend: { points: [
      { date: '2026-04-01', value: 220 },
      { date: '2026-04-08', value: 221 },
      { date: '2026-04-15', value: 219 },
      { date: '2026-04-22', value: 222 },
    ] },
  });
  assertEquals(out?.np_trend?.direction, 'stable');
});

Deno.test('achievements → power_prs strings (all-time preferred over 90-day)', () => {
  const out = cyclingCrossWorkoutDisplay({
    achievements: {
      sample_size: 12,
      durations: {
        '20min': { recent_pr: { value: 250 }, all_time_pr: { value: 268 } },
        '5min': { recent_pr: { value: 320 }, all_time_pr: null },
        '1min': { recent_pr: null, all_time_pr: null },
      },
    },
  });
  assertEquals(out, { power_prs: ['20min 268W all-time best', '5min 320W 90-day best'] });
});

Deno.test('limiter: actionable flag included; none / insufficient_data dropped', () => {
  assertEquals(
    cyclingCrossWorkoutDisplay({ limiter: { flag: 'trending_up', source: 'np_trend', detail: 'NP +9% vs 90-day mean' } }),
    { limiter: { flag: 'trending_up', detail: 'NP +9% vs 90-day mean' } },
  );
  assertEquals(cyclingCrossWorkoutDisplay({ limiter: { flag: 'none', source: 'wkg_vs_norms', detail: 'x' } }), null);
  assertEquals(cyclingCrossWorkoutDisplay({ limiter: { flag: 'bike', source: 'insufficient_data', detail: 'x' } }), null);
});

Deno.test('combined signals merge into one block', () => {
  const out = cyclingCrossWorkoutDisplay({
    vsSimilar: { sample_size: 4, matched_type: 'sweet_spot', np_delta_w: -8, if_delta: -0.02, assessment: 'below_typical' },
    limiter: { flag: 'stable', source: 'np_trend', detail: 'NP stable' },
  });
  assert(out.vs_similar && out.limiter);
  assertEquals(out.vs_similar.np_delta_w, -8);
  assertEquals(out.limiter.flag, 'stable');
});
