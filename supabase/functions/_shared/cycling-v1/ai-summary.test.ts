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
import { arcNumericAllowList, cyclingCrossWorkoutDisplay, validateNoNewNumbers } from './ai-summary.ts';

// ── Arc temporal context: numeric allow-list (so Arc citations aren't rejected) ──

const NC: any = {
  focus_date: '2026-05-14',
  mode: 'recovery_read',
  last_goal_race: { name: 'Ojai Marathon', distance: 'marathon', target_date: '2026-04-19' },
  days_since_last_goal_race: 25,
  runs_since_last_race: 4,
  next_primary_goal: { name: 'Santa Cruz 70.3', distance: '70.3', target_date: '2026-09-13', priority: 'A' },
  days_until_next_goal_race: 122,
  days_until_next_block_start: 30,
  assumed_block_lead_weeks: 12,
  plan_phase_normalized: 'recovery',
};

Deno.test('arcNumericAllowList: null/undefined → empty string', () => {
  assertEquals(arcNumericAllowList(null), '');
  assertEquals(arcNumericAllowList(undefined), '');
});

Deno.test('arcNumericAllowList: populated nc carries the Arc numbers + identifiers', () => {
  const s = arcNumericAllowList(NC);
  assert(s.includes('25'), 'days_since should be present');
  assert(s.includes('Ojai Marathon'), 'last race name should be present');
  assert(s.includes('2026-04-19'), 'race date should be present');
  assert(s.includes('recovery_read'), 'mode should be present');
});

Deno.test('validator: an Arc-grounded number is rejected without the Arc allow-list, accepted with it', () => {
  const packet = JSON.stringify({ power: { np: '187 W' } }); // no "25" here
  // Without Arc allow → "25" is a hallucinated number
  assertEquals(validateNoNewNumbers('About 25 days after Ojai, this was an easy spin.', packet).ok, false);
  // With Arc allow appended (exactly what generateCyclingAISummaryV1 does) → accepted
  assertEquals(
    validateNoNewNumbers('About 25 days after Ojai, this was an easy spin.', packet + arcNumericAllowList(NC)).ok,
    true,
  );
});

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

Deno.test('trend: np_trend fallback → metric NP, ride_type null, count/direction/delta', () => {
  const improving = cyclingCrossWorkoutDisplay({
    npTrend: { points: [
      { date: '2026-04-01', value: 200 },
      { date: '2026-04-08', value: 210 },
      { date: '2026-04-15', value: 230 },
      { date: '2026-04-22', value: 240, is_current: true },
    ] },
  });
  assert(improving?.trend);
  assertEquals(improving.trend.metric, 'NP');
  assertEquals(improving.trend.ride_count, 4);
  assertEquals(improving.trend.ride_type, null);
  assertEquals(improving.trend.direction, 'improving');
  // first half avg (200,210)=205; second half (230,240)=235; delta +30
  assertEquals(improving.trend.delta_w, 30);

  // <3 np points and no pwr20 → no trend at all
  assertEquals(cyclingCrossWorkoutDisplay({ npTrend: { points: [{ date: '2026-04-01', value: 200 }, { date: '2026-04-08', value: 210 }] } }), null);
});

Deno.test('trend: near-flat series → stable', () => {
  const out = cyclingCrossWorkoutDisplay({
    npTrend: { points: [
      { date: '2026-04-01', value: 220 },
      { date: '2026-04-08', value: 221 },
      { date: '2026-04-15', value: 219 },
      { date: '2026-04-22', value: 222 },
    ] },
  });
  assertEquals(out?.trend?.direction, 'stable');
});

Deno.test('trend: type-filtered pwr20 preferred over np_trend (the 11-vs-3 bug)', () => {
  const out = cyclingCrossWorkoutDisplay({
    // np_trend has 11 rides (old narrative said "11 rides"); pwr20 has 3 climbing
    // (what the TREND row shows). The narrative must follow pwr20.
    npTrend: { points: Array.from({ length: 11 }, (_, i) => ({ date: `2026-03-${String(i + 1).padStart(2, '0')}`, value: 200 + i })) },
    pwr20Trend: {
      classified_type: 'climbing',
      points: [
        { date: '2026-04-01', value: 240 },
        { date: '2026-04-08', value: 250 },
        { date: '2026-04-15', value: 262, is_current: true },
      ],
    },
  });
  assert(out?.trend);
  assertEquals(out.trend.metric, '20-min power');
  assertEquals(out.trend.ride_count, 3); // NOT 11
  assertEquals(out.trend.ride_type, 'climbing'); // matches the TREND row
});

Deno.test('achievements → PRs split by attribution; Efforts-scoped language', () => {
  const out = cyclingCrossWorkoutDisplay({
    achievements: {
      sample_size: 12,
      durations: {
        // current ride beat the prior best → set THIS ride
        '20min': { recent_pr: { value: 250 }, all_time_pr: { value: 268 }, current_value: 275, set_on_current_ride: true },
        // current ride below prior best → prior-ride best, NOT today
        '5min': { recent_pr: { value: 320 }, all_time_pr: { value: 330 }, current_value: 300, set_on_current_ride: false },
        '1min': { recent_pr: null, all_time_pr: null, current_value: null, set_on_current_ride: false },
      },
    },
  });
  assertEquals(out, {
    power_prs_set_this_ride: ['20min 275W — new best in Efforts, set THIS ride'],
    power_bests_in_efforts: ['5min 330W — best in Efforts (set on a PRIOR ride, not today)'],
  });
  // Language guard: no "all-time"/"personal best" anywhere; Efforts-scoped.
  const s = JSON.stringify(out);
  assertEquals(/all-time|personal best|lifetime/i.test(s), false);
  assertEquals(s.includes('best in Efforts'), true);
});

Deno.test('achievements: no current-ride PR → only prior bests, no set-this-ride key (the attribution bug)', () => {
  const out = cyclingCrossWorkoutDisplay({
    achievements: {
      sample_size: 8,
      durations: {
        '20min': { recent_pr: { value: 250 }, all_time_pr: { value: 268 }, current_value: 240, set_on_current_ride: false },
        '5min': { recent_pr: null, all_time_pr: null, current_value: null, set_on_current_ride: false },
        '1min': { recent_pr: null, all_time_pr: null, current_value: null, set_on_current_ride: false },
      },
    },
  });
  assertEquals(out, { power_bests_in_efforts: ['20min 268W — best in Efforts (set on a PRIOR ride, not today)'] });
  assertEquals((out as any).power_prs_set_this_ride, undefined); // LLM cannot claim a PR today
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

// ── #9: fitness (CTL/ATL/TSB) exposed into the narrative cross-workout block ──

Deno.test('cyclingCrossWorkoutDisplay: fitness → ctl/atl/tsb + TrainingPeaks form band', () => {
  // TSB >= +5 → fresh
  assertEquals(
    cyclingCrossWorkoutDisplay({ fitness: { ctl: 70, atl: 55, tsb: 15, tss_today: 88 } })!.fitness,
    { ctl: 70, atl: 55, tsb: 15, form: 'fresh', tss_today: 88 },
  );
  // TSB <= -10 → fatigued
  assertEquals(
    cyclingCrossWorkoutDisplay({ fitness: { ctl: 80, atl: 100, tsb: -20, tss_today: 130 } })!.fitness.form,
    'fatigued',
  );
  // between → neutral
  assertEquals(
    cyclingCrossWorkoutDisplay({ fitness: { ctl: 60, atl: 60, tsb: 0, tss_today: null } })!.fitness.form,
    'neutral',
  );
});

Deno.test('cyclingCrossWorkoutDisplay: missing/invalid fitness → no fitness key', () => {
  assertEquals(cyclingCrossWorkoutDisplay({ fitness: null }), null);
  assertEquals(cyclingCrossWorkoutDisplay({ fitness: { ctl: 'x', atl: 50 } }), null);
  // fitness coexists with other cross-workout signals
  const out = cyclingCrossWorkoutDisplay({
    fitness: { ctl: 65, atl: 60, tsb: 5, tss_today: 90 },
    limiter: { flag: 'trending_up', source: 'np_trend', detail: 'NP +9%' },
  })!;
  assert(out.fitness && out.limiter);
  assertEquals(out.fitness.form, 'fresh');
});
