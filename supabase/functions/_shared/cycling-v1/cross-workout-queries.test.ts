/**
 * Tests for cycling cross-workout queries — Tier 3 item 10.
 *
 * Run from repo root:
 *   deno test supabase/functions/_shared/cycling-v1/cross-workout-queries.test.ts --no-check --allow-read
 *
 * Coverage:
 *   §1 fetchCyclingPRs — 90d window vs all-time correctly distinguished, minimum-data
 *      guard, sample_size accuracy, missing power_curve handling.
 *   §2 fetchCyclingVsSimilar — type matching, ±20% duration tolerance, 3-match guard,
 *      delta math.
 *   §3 assessCyclingLimiter — W/kg path (low/mid/strong), NP-trend fallback paths,
 *      insufficient_data guard, weight-unit conversion.
 *   §4 classifyWkgForRaceDistance — boundary checks for the W/kg classifier.
 */
import { assert, assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import {
  assessCyclingLimiter,
  classifyWkgForRaceDistance,
  fetchCyclingPRs,
  fetchCyclingVsSimilar,
  resolveWeightKg,
} from './cross-workout-queries.ts';

// Minimal Supabase chain stub (mirrors the cycling-goal-race-completion test pattern).
function makeSupabaseStub(scripted: { workouts: any[] }) {
  const builder = (table: string) => {
    let rows: any[] = table === 'workouts' ? scripted.workouts : [];
    const chain: any = {
      select: () => chain,
      eq: () => chain,
      neq: () => chain,
      in: () => chain,
      order: () => chain,
      limit: () => chain,
      then: (resolve: (v: any) => void) => {
        resolve({ data: rows, error: null });
      },
    };
    return chain;
  };
  return { from: (table: string) => builder(table) };
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}
function daysAgoIso(days: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString().slice(0, 10);
}

// ── §1 fetchCyclingPRs ─────────────────────────────────────────────────────

Deno.test('fetchCyclingPRs: returns null when fewer than 5 rides have power_curve', async () => {
  const supabase = makeSupabaseStub({
    workouts: [
      { id: 'r1', date: daysAgoIso(5), computed: { power_curve: { '20min': 240 } } },
      { id: 'r2', date: daysAgoIso(10), computed: { power_curve: { '20min': 245 } } },
      { id: 'r3', date: daysAgoIso(15), computed: { power_curve: { '20min': 250 } } },
      // Only 3 with power_curve — below MIN_RIDES_FOR_PRS
    ],
  });
  const r = await fetchCyclingPRs(supabase, { userId: 'u1', currentWorkoutId: 'cur' });
  assertEquals(r, null);
});

Deno.test('fetchCyclingPRs: identifies recent + all-time PRs separately when both windows have data', async () => {
  const supabase = makeSupabaseStub({
    workouts: [
      // All-time PR is older than 90 days
      { id: 'old-pr', date: daysAgoIso(180), computed: { power_curve: { '20min': 280, '5min': 350, '1min': 500 } } },
      // Recent PR within last 90 days
      { id: 'recent-pr', date: daysAgoIso(30), computed: { power_curve: { '20min': 265, '5min': 340, '1min': 480 } } },
      // Filler rides
      { id: 'r3', date: daysAgoIso(45), computed: { power_curve: { '20min': 250, '5min': 320, '1min': 460 } } },
      { id: 'r4', date: daysAgoIso(60), computed: { power_curve: { '20min': 245, '5min': 310, '1min': 450 } } },
      { id: 'r5', date: daysAgoIso(75), computed: { power_curve: { '20min': 248, '5min': 315, '1min': 455 } } },
    ],
  });
  const r = await fetchCyclingPRs(supabase, { userId: 'u1', currentWorkoutId: 'cur' });
  assert(r != null, 'expected non-null PRs object');
  assertEquals(r.sample_size, 5);

  // 20min: all-time PR is 280W (old-pr); recent PR is 265W (recent-pr)
  assertEquals(r.durations['20min'].all_time_pr?.value, 280);
  assertEquals(r.durations['20min'].all_time_pr?.workout_id, 'old-pr');
  assertEquals(r.durations['20min'].recent_pr?.value, 265);
  assertEquals(r.durations['20min'].recent_pr?.workout_id, 'recent-pr');

  // Sanity check 5min + 1min same pattern
  assertEquals(r.durations['5min'].all_time_pr?.value, 350);
  assertEquals(r.durations['5min'].recent_pr?.value, 340);
  assertEquals(r.durations['1min'].all_time_pr?.value, 500);
  assertEquals(r.durations['1min'].recent_pr?.value, 480);
});

Deno.test('fetchCyclingPRs: recent PR null when no rides in last 90 days', async () => {
  const supabase = makeSupabaseStub({
    workouts: Array.from({ length: 5 }, (_, i) => ({
      id: `r${i}`,
      date: daysAgoIso(120 + i * 30), // all >90 days old
      computed: { power_curve: { '20min': 240 + i * 5 } },
    })),
  });
  const r = await fetchCyclingPRs(supabase, { userId: 'u1', currentWorkoutId: 'cur' });
  assert(r != null);
  assertEquals(r.durations['20min'].recent_pr, null, 'no recent rides → recent_pr is null');
  assertEquals(r.durations['20min'].all_time_pr?.value, 260, 'all_time_pr from oldest set still works');
});

Deno.test('fetchCyclingPRs: skips rides with missing or zero power_curve entries', async () => {
  const supabase = makeSupabaseStub({
    workouts: [
      { id: 'r1', date: daysAgoIso(10), computed: { power_curve: { '20min': 250 } } },
      { id: 'r2', date: daysAgoIso(20), computed: null }, // no computed
      { id: 'r3', date: daysAgoIso(30), computed: { power_curve: { '20min': 0 } } }, // zero value
      { id: 'r4', date: daysAgoIso(40), computed: { power_curve: { '20min': 245, '5min': 320 } } },
      { id: 'r5', date: daysAgoIso(50), computed: { power_curve: { '20min': 240 } } },
      { id: 'r6', date: daysAgoIso(60), computed: { power_curve: { '20min': 235 } } },
    ],
  });
  const r = await fetchCyclingPRs(supabase, { userId: 'u1', currentWorkoutId: 'cur' });
  // r1, r4, r5, r6 = 4 valid (r2 has no computed; r3 has zero) → below MIN_RIDES_FOR_PRS=5
  assertEquals(r, null, 'invalid rides filtered out → sample size below threshold → null');
});

// ── §2 fetchCyclingVsSimilar ───────────────────────────────────────────────

Deno.test('fetchCyclingVsSimilar: returns null when fewer than 3 matching rides', async () => {
  const supabase = makeSupabaseStub({
    workouts: [
      {
        id: 'r1', date: daysAgoIso(10),
        workout_analysis: {
          fact_packet_v1: { facts: { classified_type: 'threshold', total_duration_min: 60, normalized_power: 240, intensity_factor: 0.92 } },
          performance: { execution_score: 85 },
        },
      },
      {
        id: 'r2', date: daysAgoIso(20),
        workout_analysis: {
          fact_packet_v1: { facts: { classified_type: 'threshold', total_duration_min: 60, normalized_power: 245, intensity_factor: 0.93 } },
          performance: { execution_score: 88 },
        },
      },
      // Only 2 matches — below MIN_MATCHES_FOR_VS_SIMILAR=3
    ],
  });
  const r = await fetchCyclingVsSimilar(supabase, {
    userId: 'u1', currentWorkoutId: 'cur',
    currentClassifiedType: 'threshold',
    currentDurationMin: 60,
    currentNp: 250, currentIf: 0.95, currentExecScore: 90,
  });
  assertEquals(r, null);
});

Deno.test('fetchCyclingVsSimilar: matches on classified_type + duration ±20%', async () => {
  const supabase = makeSupabaseStub({
    workouts: [
      // Same type + within ±20% (60 min ±12 min = 48-72)
      { id: 'm1', date: daysAgoIso(10), workout_analysis: { fact_packet_v1: { facts: { classified_type: 'threshold', total_duration_min: 60, normalized_power: 240, intensity_factor: 0.92 } }, performance: { execution_score: 85 } } },
      { id: 'm2', date: daysAgoIso(20), workout_analysis: { fact_packet_v1: { facts: { classified_type: 'threshold', total_duration_min: 50, normalized_power: 245, intensity_factor: 0.93 } }, performance: { execution_score: 88 } } },
      { id: 'm3', date: daysAgoIso(30), workout_analysis: { fact_packet_v1: { facts: { classified_type: 'threshold', total_duration_min: 70, normalized_power: 235, intensity_factor: 0.91 } }, performance: { execution_score: 80 } } },
      // Same type but OUTSIDE duration band — should be excluded
      { id: 'too-short', date: daysAgoIso(40), workout_analysis: { fact_packet_v1: { facts: { classified_type: 'threshold', total_duration_min: 30, normalized_power: 270, intensity_factor: 1.0 } }, performance: { execution_score: 95 } } },
      // Different type — should be excluded
      { id: 'wrong-type', date: daysAgoIso(50), workout_analysis: { fact_packet_v1: { facts: { classified_type: 'sweet_spot', total_duration_min: 60, normalized_power: 220, intensity_factor: 0.85 } }, performance: { execution_score: 100 } } },
    ],
  });
  const r = await fetchCyclingVsSimilar(supabase, {
    userId: 'u1', currentWorkoutId: 'cur',
    currentClassifiedType: 'threshold',
    currentDurationMin: 60,
    currentNp: 250, currentIf: 0.95, currentExecScore: 90,
  });
  assert(r != null, 'expected non-null vs-similar with 3 matches');
  assertEquals(r.sample_size, 3);
  assertEquals(r.matched_type, 'threshold');
  assertEquals(r.duration_band_min, { lo: 48, hi: 72 });

  // Avg NP across matches: (240 + 245 + 235) / 3 = 240; current NP 250; delta = +10
  assertEquals(r.np_delta_w, 10);
  // Avg IF: (0.92 + 0.93 + 0.91) / 3 = 0.92; current 0.95; delta = +0.03
  assertEquals(r.if_delta, 0.03);
  // Avg exec: (85 + 88 + 80) / 3 = 84.33; current 90; delta = +6 (rounded)
  assertEquals(r.exec_delta_pct, 6);
  // exec_delta +6 (>=5) → +1; if_delta +0.03 (>=0.03) → +1. Sum +2 → 'above_typical'
  assertEquals(r.assessment, 'above_typical');
});

Deno.test('fetchCyclingVsSimilar: assessment = below_typical when execution + IF both lower', async () => {
  const supabase = makeSupabaseStub({
    workouts: [
      { id: 'm1', date: daysAgoIso(10), workout_analysis: { fact_packet_v1: { facts: { classified_type: 'threshold', total_duration_min: 60, normalized_power: 250, intensity_factor: 0.95 } }, performance: { execution_score: 90 } } },
      { id: 'm2', date: daysAgoIso(20), workout_analysis: { fact_packet_v1: { facts: { classified_type: 'threshold', total_duration_min: 60, normalized_power: 252, intensity_factor: 0.96 } }, performance: { execution_score: 92 } } },
      { id: 'm3', date: daysAgoIso(30), workout_analysis: { fact_packet_v1: { facts: { classified_type: 'threshold', total_duration_min: 60, normalized_power: 248, intensity_factor: 0.94 } }, performance: { execution_score: 88 } } },
    ],
  });
  const r = await fetchCyclingVsSimilar(supabase, {
    userId: 'u1', currentWorkoutId: 'cur',
    currentClassifiedType: 'threshold',
    currentDurationMin: 60,
    currentNp: 230, currentIf: 0.88, currentExecScore: 75,
  });
  assert(r != null);
  assertEquals(r.assessment, 'below_typical');
});

// ── §3 assessCyclingLimiter ────────────────────────────────────────────────

Deno.test('assessCyclingLimiter: W/kg path — low for 70.3 → bike flagged', () => {
  const r = assessCyclingLimiter({
    weightKg: 80,
    ftpW: 220, // 220/80 = 2.75 W/kg, below 70.3 mid-pack 3.0
    isTriAthlete: true,
    raceDistance: '70.3',
  });
  assertEquals(r.flag, 'bike');
  assertEquals(r.source, 'wkg_vs_norms');
  assertEquals(r.wkg, 2.75);
  assert(r.detail.includes('below the mid-pack norm'));
});

Deno.test('assessCyclingLimiter: W/kg path — strong for 70.3 → not flagged', () => {
  const r = assessCyclingLimiter({
    weightKg: 70,
    ftpW: 280, // 280/70 = 4.0 W/kg, well above 70.3 mid-pack 3.0
    isTriAthlete: true,
    raceDistance: '70.3',
  });
  assertEquals(r.flag, 'none');
  assertEquals(r.source, 'wkg_vs_norms');
  assertEquals(r.wkg, 4);
});

Deno.test('assessCyclingLimiter: W/kg path — full IM uses lower 2.8 norm', () => {
  const r = assessCyclingLimiter({
    weightKg: 75,
    ftpW: 220, // 220/75 = 2.93 W/kg — above full IM 2.8 norm but below 70.3 3.0
    isTriAthlete: true,
    raceDistance: 'full',
  });
  assertEquals(r.flag, 'none', 'full IM mid-pack norm is 2.8 — 2.93 W/kg is above');
});

Deno.test('assessCyclingLimiter: NP-trend fallback when no bodyweight', () => {
  const r = assessCyclingLimiter({
    weightKg: null, // no bodyweight → can't compute W/kg
    ftpW: 250,
    isTriAthlete: true,
    raceDistance: '70.3',
    recentNpSamples: [220, 225, 218], // recent mean ~221
    ninetyDayNpSamples: [240, 245, 250, 235, 248, 242], // 90d mean ~243
  });
  // recent 220.83 vs 90d 243.33 → -22.5/243.3 → -9.2% → trending_down
  assertEquals(r.source, 'np_trend');
  assertEquals(r.flag, 'trending_down');
  assert(r.np_trend_pct != null && r.np_trend_pct < -5);
});

Deno.test('assessCyclingLimiter: NP-trend fallback for non-tri athlete', () => {
  const r = assessCyclingLimiter({
    weightKg: 70,
    ftpW: 250,
    isTriAthlete: false, // not a triathlete → skip W/kg path
    raceDistance: null,
    recentNpSamples: [240, 245, 250],
    ninetyDayNpSamples: [200, 210, 215, 220, 225],
  });
  // recent 245 vs 90d 214 → +14% → trending_up
  assertEquals(r.flag, 'trending_up');
  assertEquals(r.source, 'np_trend');
  assert(r.np_trend_pct != null && r.np_trend_pct > 5);
});

Deno.test('assessCyclingLimiter: insufficient_data when no path applies', () => {
  const r = assessCyclingLimiter({
    weightKg: null,
    ftpW: null,
    isTriAthlete: true,
    raceDistance: '70.3',
    // no NP samples
  });
  assertEquals(r.flag, 'none');
  assertEquals(r.source, 'insufficient_data');
});

// ── §4 classifyWkgForRaceDistance ─────────────────────────────────────────

Deno.test('classifyWkgForRaceDistance: 70.3 boundaries (3.0 / 3.5)', () => {
  assertEquals(classifyWkgForRaceDistance(2.5, '70.3'), 'low');
  assertEquals(classifyWkgForRaceDistance(2.99, '70.3'), 'low', 'just below 3.0');
  assertEquals(classifyWkgForRaceDistance(3.0, '70.3'), 'mid_pack', 'at 3.0');
  assertEquals(classifyWkgForRaceDistance(3.49, '70.3'), 'mid_pack', 'just below 3.5');
  assertEquals(classifyWkgForRaceDistance(3.5, '70.3'), 'strong', 'at 3.5');
  assertEquals(classifyWkgForRaceDistance(4.0, '70.3'), 'strong');
});

Deno.test('classifyWkgForRaceDistance: full IM boundaries (2.8 / 3.3)', () => {
  assertEquals(classifyWkgForRaceDistance(2.5, 'full'), 'low');
  assertEquals(classifyWkgForRaceDistance(2.79, 'full'), 'low');
  assertEquals(classifyWkgForRaceDistance(2.8, 'full'), 'mid_pack');
  assertEquals(classifyWkgForRaceDistance(3.29, 'full'), 'mid_pack');
  assertEquals(classifyWkgForRaceDistance(3.3, 'full'), 'strong');
});

// ── §5 resolveWeightKg ────────────────────────────────────────────────────

Deno.test('resolveWeightKg: imperial converts lb → kg', () => {
  // 165 lb × 0.45359237 = 74.84 kg
  const kg = resolveWeightKg(165, 'imperial');
  assert(kg != null);
  assertEquals(Math.round(kg * 100) / 100, 74.84);
});

Deno.test('resolveWeightKg: metric returns weight as-is', () => {
  assertEquals(resolveWeightKg(75, 'metric'), 75);
});

Deno.test('resolveWeightKg: returns null for invalid weight', () => {
  assertEquals(resolveWeightKg(null, 'imperial'), null);
  assertEquals(resolveWeightKg(0, 'metric'), null);
  assertEquals(resolveWeightKg(-5, 'metric'), null);
});
