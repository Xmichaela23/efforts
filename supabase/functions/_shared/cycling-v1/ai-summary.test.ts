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
import { arcNumericAllowList, cyclingCrossWorkoutDisplay, ledeOpensWithArcFrame, summaryHasJargon, validateNoNewNumbers } from './ai-summary.ts';

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

Deno.test('lede guard: Arc/recovery/taper/fatigue opener (no power token) → violation', () => {
  // The 60304656 case — opens with race-timing, power number comes later.
  assertEquals(ledeOpensWithArcFrame("You're three weeks out from Ojai Marathon, and this 90-minute climbing ride landed at 189W NP."), true);
  assertEquals(ledeOpensWithArcFrame('You are sitting in a taper phase — this climbing ride held 185W.'), true);
  assertEquals(ledeOpensWithArcFrame('Recovery phase carrying high fatigue from 14 consecutive training days, so today was easy.'), true);
  assertEquals(ledeOpensWithArcFrame('Seven days into recovery from the Ojai Marathon, you spun easy.'), true);
});

Deno.test('lede guard: power/fitness opener → OK (incl. Arc as trailing clause)', () => {
  assertEquals(ledeOpensWithArcFrame('Your normalized power of 134W sits 46W above your 12-ride average.'), false);
  assertEquals(ledeOpensWithArcFrame('At 84W NP over 57 minutes, this was a true recovery spin.'), false);
  assertEquals(ledeOpensWithArcFrame('Your 20-min power dropped 8W across your last four threshold rides.'), false);
  // Power lede, Arc correctly demoted to the trailing clause — must NOT flag.
  assertEquals(ledeOpensWithArcFrame('You set a new 5-min best of 224W on this climbing ride, seven days into recovery from the Ojai Marathon.'), false);
});

Deno.test('jargon guard: banned labels/abbrevs (incl. numbers, ACWR/TSB) → violation', () => {
  assertEquals(summaryHasJargon('The 1.17 variability index shows natural undulation.'), true);
  assertEquals(summaryHasJargon('the 0.82 intensity factor suggests you were above zone.'), true);
  assertEquals(summaryHasJargon('Held threshold with an IF of 1.01 on this ride.'), true);
  assertEquals(summaryHasJargon('EF 1.214 with 1.3% HR decoupling over the back half.'), true);
  assertEquals(summaryHasJargon('your acute-to-chronic workload ratio sits at 1.95 (high risk).'), true);
  assertEquals(summaryHasJargon('training stress balance is -19 and the ACWR is high.'), true);
});

Deno.test('jargon guard: plain-language translation → OK (NP watt kept)', () => {
  assertEquals(summaryHasJargon('178 W normalized power — your effective output once surges smooth out — held at threshold.'), false);
  assertEquals(summaryHasJargon('You rode at threshold with natural power variation from the climbing terrain.'), false);
  assertEquals(summaryHasJargon('Heart rate stayed controlled as the power held, a sign your aerobic efficiency is holding.'), false);
  // lowercase English "if" must NOT trip the case-sensitive abbrev check
  assertEquals(summaryHasJargon('Strong day, especially if you were carrying fatigue.'), false);
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
  // D-073 — vs_similar shape now includes hr_delta_bpm, drift_delta_bpm, and
  // pool_power_context. When the input has no HR / no power context (this
  // legacy fixture), they pass through as null so the LLM gets a stable
  // shape regardless of source-side population.
  const out = cyclingCrossWorkoutDisplay({
    vsSimilar: { sample_size: 5, matched_type: 'threshold', np_delta_w: 12, if_delta: 0.041, assessment: 'above_typical' },
  });
  assertEquals(out, {
    vs_similar: {
      matched_type: 'threshold',
      sample_size: 5,
      np_delta_w: 12,
      if_delta: 0.04,
      hr_delta_bpm: null,
      drift_delta_bpm: null,
      assessment: 'above_typical',
      pool_power_context: null,
    },
  });
  // np_delta_w null → no vs_similar (and nothing else) → whole block null
  assertEquals(cyclingCrossWorkoutDisplay({ vsSimilar: { matched_type: 'threshold', np_delta_w: null } }), null);
});

Deno.test('D-073: vs_similar surfaces HR deltas + pool_power_context when populated', () => {
  const out = cyclingCrossWorkoutDisplay({
    vsSimilar: {
      sample_size: 3,
      matched_type: 'threshold',
      np_delta_w: 5,
      if_delta: 0.02,
      hr_delta_bpm: 8,
      drift_delta_bpm: 2,
      assessment: 'above_typical',
      pool_power_context: {
        current_if: 0.85,
        pool_avg_if: 0.82,
        delta_if: 0.03,
        delta_pct: 3.7,
        basis: 'if',
        intensity_match: 'matched',
      },
    },
  });
  assertEquals(out?.vs_similar?.hr_delta_bpm, 8);
  assertEquals(out?.vs_similar?.drift_delta_bpm, 2);
  assertEquals(out?.vs_similar?.pool_power_context?.intensity_match, 'matched');
  assertEquals(out?.vs_similar?.pool_power_context?.basis, 'if');
});

// ─────────────────────────────────────────────────────────────────────────────────────────────
// The three tests that used to sit here pinned the NP-TREND FALLBACK — a fitness-direction claim
// trended off `npTrend` (all-effort NP) with no ride-type gate. That path was DELIBERATELY DELETED:
//
//   e8b67eaf "bike easy-ride false-dip: fitness-power trend only from hard efforts" — an easy ride's
//   20-min power is not a fitness max (industry mean-max principle), so trending across whatever
//   effort you happened to do MANUFACTURED a decline out of a soft block.
//   cb4eb1d5 "drop the baseline-blind NP-trend fake; spine owns power direction".
//
// The tests were never updated, so they sat RED for days, asserting behaviour the code had removed on
// purpose. Deleted 2026-07-13. They are replaced by pins on the DELETION itself, so nobody re-adds it.
//
// `out.trend` now requires ALL of: pwr20Trend (>=3 pts) + isFitnessPowerType(classified_type)
// (climbing/threshold/sweet_spot/tempo) + a spine verdict that is not `needs_data`.
// ─────────────────────────────────────────────────────────────────────────────────────────────

Deno.test('NO np_trend fallback: npTrend alone must NOT produce a fitness-direction claim (cb4eb1d5/e8b67eaf)', () => {
  const out = cyclingCrossWorkoutDisplay({
    npTrend: { points: [
      { date: '2026-04-01', value: 200 },
      { date: '2026-04-08', value: 210 },
      { date: '2026-04-15', value: 230 },
      { date: '2026-04-22', value: 240, is_current: true },
    ] },
  });
  // A rising all-effort NP series used to read "improving". It must now claim nothing.
  assertEquals(out?.trend, undefined);
});

Deno.test('NO np_trend fallback: a hard-type pwr20 series still needs a SPINE verdict — no spine, no claim', () => {
  const out = cyclingCrossWorkoutDisplay({
    pwr20Trend: {
      classified_type: 'climbing',
      points: [
        { date: '2026-04-01', value: 240 },
        { date: '2026-04-08', value: 250 },
        { date: '2026-04-15', value: 262, is_current: true },
      ],
    },
    // no spineBikeTrend → the spine owns power direction, so the narrative stays honestly silent
  });
  assertEquals(out?.trend, undefined);
});

Deno.test('trend: easy/endurance ride claims NO fitness dip; hard effort still does', () => {
  const points = [
    { date: '2026-06-24', value: 118 },
    { date: '2026-07-02', value: 110 },
    { date: '2026-07-10', value: 106, is_current: true },
  ];
  const sliding = { verdict: 'sliding', earlyAvg: 127, recentAvg: 106, sampleCount: 5 };

  // Easy endurance ride → gated out: no fitness-direction claim reaches the narrative.
  const easy = cyclingCrossWorkoutDisplay({
    pwr20Trend: { classified_type: 'endurance', points },
    spineBikeTrend: sliding,
  });
  assertEquals(easy?.trend, undefined);

  // Same sliding spine verdict, but a hard-effort (threshold) ride → the trend IS honest, so it surfaces.
  const hard = cyclingCrossWorkoutDisplay({
    pwr20Trend: { classified_type: 'threshold', points },
    spineBikeTrend: sliding,
  });
  assert(hard?.trend);
  assertEquals(hard.trend.direction, 'declining');
  assertEquals(hard.trend.ride_type, 'threshold');
  assertEquals(hard.trend.delta_w, -21);
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
