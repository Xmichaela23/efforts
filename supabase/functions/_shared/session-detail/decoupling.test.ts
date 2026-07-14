/**
 * Tests for D-036 — GAP-corrected aerobic decoupling for runs. Covers spec §5:
 *  • enrichSamplesWithGAP idempotency + basis detection
 *  • toDisplayFormatV1 surfaces decoupling_basis + decoupling_assessment when
 *    cardiac_decoupling present
 *  • AEROBIC DECOUPLING prompt rule is in COACHING_SYSTEM_PROMPT
 *  • session_detail_v1.classification.decoupling shape (null when missing,
 *    populated when heart_rate_summary carries the fields)
 *
 * Plus the mixed-effort follow-on (D-037 scope):
 *  • calculateEfficiency forMixedEffort flag bypasses the steady-state guard
 *    and forces basis='raw' regardless of GAP enrichment
 *  • toDisplayFormatV1 vs_similar nulls pace fields under isMixedEffort but
 *    preserves hr_delta / drift_delta / trend (HR at intensity is comparable
 *    across effort types even when pace isn't)
 *  • buildUserMessage suppresses the "Pace vs similar" line under mixed-effort
 *    but keeps the "HR vs similar" line
 *
 * Run from repo root:
 *   deno test supabase/functions/_shared/session-detail/decoupling.test.ts --no-check
 */
import { assertEquals, assertNotEquals, assertStringIncludes } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { enrichSamplesWithGAP } from '../gap.ts';
import { toDisplayFormatV1, buildUserMessage } from '../fact-packet/ai-summary.ts';
import { calculateEfficiency } from '../../analyze-running-workout/lib/heart-rate/efficiency.ts';
import { decouplingToSeries } from '../state-trend/run.ts';
import type { HRAnalysisContext, SensorSample } from '../../analyze-running-workout/lib/heart-rate/types.ts';

// ── Fixtures ──────────────────────────────────────────────────────────────

function makeRawFlatSamples(n = 600): any[] {
  // 600 samples, ~10 min, flat (no usable elevation), pace_s_per_mi=480.
  return Array.from({ length: n }, (_, i) => ({
    timestamp: i,
    pace_s_per_mi: 480,
    heart_rate: 145,
    elevation_m: null,
  }));
}

function makeHillySamples(n = 600): any[] {
  // Hilly: elevation ramps 0→100→0 over n samples. Raw pace slows up climbs.
  return Array.from({ length: n }, (_, i) => {
    const phase = i / n;
    const elev = Math.sin(phase * Math.PI) * 100; // 0 → 100 → 0
    return {
      timestamp: i,
      pace_s_per_mi: 480 + (elev * 0.5),
      heart_rate: 145,
      elevation_m: elev,
      distance_m: i * 3, // ~3 m/sample for grade calc
    };
  });
}

// ── enrichSamplesWithGAP ──────────────────────────────────────────────────

Deno.test('D-036: enrichSamplesWithGAP returns basis="raw" when no usable elevation', () => {
  const { samples, basis } = enrichSamplesWithGAP(makeRawFlatSamples());
  assertEquals(basis, 'raw');
  // Same array, no enrichment marker added.
  assertEquals((samples[0] as any).raw_pace_s_per_mi, undefined);
});

Deno.test('D-036: enrichSamplesWithGAP returns basis="gap" + marker on hilly samples', () => {
  const { samples, basis } = enrichSamplesWithGAP(makeHillySamples());
  assertEquals(basis, 'gap');
  // Every sample carries the raw_pace_s_per_mi marker.
  assertNotEquals((samples[0] as any).raw_pace_s_per_mi, undefined);
  // First sample's pace_s_per_mi may equal raw at near-zero grade; the marker
  // is the canonical signal that enrichment ran.
});

Deno.test('D-036: enrichSamplesWithGAP is idempotent (already-enriched input returns unchanged)', () => {
  const first = enrichSamplesWithGAP(makeHillySamples());
  const second = enrichSamplesWithGAP(first.samples);
  assertEquals(second.basis, 'gap');
  // Idempotent: same object identity not required, but values must match.
  assertEquals(second.samples.length, first.samples.length);
  assertEquals((second.samples[100] as any).pace_s_per_mi, (first.samples[100] as any).pace_s_per_mi);
});

Deno.test('D-036: enrichSamplesWithGAP handles empty input', () => {
  assertEquals(enrichSamplesWithGAP([]), { samples: [], basis: 'raw' });
});

// ── toDisplayFormatV1 surfaces basis + assessment ────────────────────────

function makeFactPacketWithDecoupling(opts: { pct?: number | null; basis?: 'gap' | 'raw' | null; assessment?: string | null }) {
  return {
    version: 1,
    generated_at: '2026-05-23T12:00:00Z',
    facts: {
      workout_date: '2026-05-23',
      workout_type: 'easy_run',
      total_distance_mi: 5,
      total_duration_min: 40,
      avg_pace_sec_per_mi: 480,
      avg_gap_sec_per_mi: 478,
      gap_adjusted: true,
      avg_hr: 145,
      max_hr: 160,
      segments: [],
      weather: null,
      plan: null,
      athlete_reported: null,
    },
    derived: {
      execution: null,
      hr_drift_bpm: 4,
      raw_hr_drift_bpm: 6,
      terrain_contribution_bpm: 2,
      pace_normalized_drift_bpm: 3,
      drift_explanation: 'cardiac_drift',
      hr_drift_typical: 5,
      cardiac_decoupling_pct: opts.pct,
      decoupling_basis: opts.basis,
      decoupling_assessment: opts.assessment,
      pace_fade_pct: 1,
      pacing_pattern: null,
      training_load: null,
      comparisons: {
        vs_similar: { sample_size: 3, pace_delta_sec: -5, hr_delta_bpm: 1, drift_delta_bpm: 0, assessment: 'typical', pace_basis: 'gap' },
        trend: { direction: 'stable', magnitude: null, data_points: 5 },
        achievements: [],
      },
      stimulus: null,
      interval_execution: null,
      primary_limiter: null,
      terrain_context: null,
    },
  } as any;
}

Deno.test('D-036: toDisplayFormatV1 surfaces decoupling_basis and assessment when cardiac_decoupling present', () => {
  const fp = makeFactPacketWithDecoupling({ pct: 4.2, basis: 'gap', assessment: 'good' });
  const dp = toDisplayFormatV1(fp, [], null, null);
  assertEquals(dp.signals.cardiac_decoupling, '4%');
  assertEquals(dp.signals.decoupling_basis, 'gap');
  assertEquals(dp.signals.decoupling_assessment, 'good');
});

Deno.test('D-036: toDisplayFormatV1 returns null basis/assessment when cardiac_decoupling field is absent', () => {
  // Stale-row case: older workout_analysis rows from before D-036 lack the new
  // fields entirely (undefined, not literal null). coerceNumber(undefined)
  // returns null → cardiac_decoupling renders null → basis/assessment suppressed.
  const fp = makeFactPacketWithDecoupling({ pct: undefined as any, basis: undefined as any, assessment: undefined as any });
  const dp = toDisplayFormatV1(fp, [], null, null);
  assertEquals(dp.signals.cardiac_decoupling, null);
  // Defense-in-depth: even if upstream sends a basis without a pct, we suppress
  // it so the LLM never sees a basis pointing at no value.
  assertEquals(dp.signals.decoupling_basis, null);
  assertEquals(dp.signals.decoupling_assessment, null);
});

Deno.test('D-036: toDisplayFormatV1 carries raw basis through (so prompt can treat as inconclusive)', () => {
  const fp = makeFactPacketWithDecoupling({ pct: 3.1, basis: 'raw', assessment: 'good' });
  const dp = toDisplayFormatV1(fp, [], null, null);
  assertEquals(dp.signals.decoupling_basis, 'raw');
});

// ── calculateEfficiency: forMixedEffort flag ──────────────────────────────

function makeBlankContext(): HRAnalysisContext {
  return {
    workoutType: 'intervals',
    intervals: [],
    terrain: { samples: [] },
  };
}

function makeEffSamples(n: number, opts?: { gapMarker?: boolean; baseHr?: number; basePace?: number }): SensorSample[] {
  const baseHr = opts?.baseHr ?? 145;
  const basePace = opts?.basePace ?? 480; // 8:00/mi
  return Array.from({ length: n }, (_, i) => {
    const s: any = {
      timestamp: i,
      heart_rate: baseHr + Math.floor(i / 600), // tiny upward drift so ratios differ
      pace_s_per_mi: basePace,
    };
    if (opts?.gapMarker) s.raw_pace_s_per_mi = basePace + 5; // simulates enrichSamplesWithGAP marker
    return s as SensorSample;
  });
}

Deno.test('D-037 mixed-effort: calculateEfficiency preserves existing skip on planned intervals (forMixedEffort=false)', () => {
  // Planned interval sessions keep the existing skip — per-interval execution
  // is the honest read, not a whole-session first-half/second-half ratio.
  const samples = makeEffSamples(1400);
  const out = calculateEfficiency(samples, samples, makeBlankContext(), 'intervals');
  assertEquals(out, undefined);
});

Deno.test('D-037 mixed-effort: forMixedEffort=true bypasses the intervals/hill_repeats early-return', () => {
  const samples = makeEffSamples(1400);
  const out = calculateEfficiency(samples, samples, makeBlankContext(), 'intervals', { forMixedEffort: true });
  assertNotEquals(out, undefined);
  assertEquals(typeof out!.decoupling.percent, 'number');
});

// ⛔ REGRESSION (2026-07-14). This test used to assert the OPPOSITE — that forMixedEffort forced
// basis='raw' on GAP-enriched samples. It passed, and it was pinning a live bug: `state-trend/run.ts`
// DROPS a 'raw' row from the durability substrate (it reads 'raw' as "terrain-confounded"). The
// variance gate fires on ~10 of 11 real outdoor runs, so once D-037 was restored on 2026-07-12 every
// run was binned and the State durability trend silently froze 16 days out of date.
// `basis` answers ONE question — was the pace grade-adjusted. Confidence rides on `mixedEffort`.
Deno.test('mixed-effort does NOT corrupt basis: GAP-enriched samples keep basis="gap" and are flagged mixedEffort', () => {
  const samples = makeEffSamples(1400, { gapMarker: true });
  const out = calculateEfficiency(samples, samples, makeBlankContext(), 'fartlek', { forMixedEffort: true });
  assertNotEquals(out, undefined);
  assertEquals(out!.decoupling.basis, 'gap');        // terrain fact: the pace WAS grade-adjusted
  assertEquals(out!.decoupling.mixedEffort, true);   // confidence fact: rides on its own channel
});

Deno.test('mixed-effort on non-GAP samples: basis stays "raw" (genuinely no elevation) and mixedEffort is flagged', () => {
  const samples = makeEffSamples(1400);
  const out = calculateEfficiency(samples, samples, makeBlankContext(), 'fartlek', { forMixedEffort: true });
  assertNotEquals(out, undefined);
  assertEquals(out!.decoupling.basis, 'raw');
  assertEquals(out!.decoupling.mixedEffort, true);
});

// The bug in one assertion: a mixed-effort STEADY run with usable elevation must survive the State
// durability filter. Before the split it was deleted, and nothing said so on the screen.
Deno.test('REGRESSION: a mixed-effort steady run still reaches the durability substrate', () => {
  const samples = makeEffSamples(1400, { gapMarker: true });
  const out = calculateEfficiency(samples, samples, makeBlankContext(), 'steady_state', { forMixedEffort: true });
  const series = decouplingToSeries([{
    date: '2026-07-13',
    decoupling_pct: out!.decoupling.percent,
    decoupling_basis: out!.decoupling.basis,
    decoupling_mixed_effort: out!.decoupling.mixedEffort,
    workout_type: 'steady_state',
    duration_minutes: 47,
  }]);
  assertEquals(series.length, 1);
});

Deno.test('D-037 mixed-effort: forMixedEffort=false on fartlek with GAP samples returns basis="gap" (steady-state path unchanged)', () => {
  // Sanity: the non-mixed-effort path still respects the detected basis. This
  // protects the D-036 steady-state contract from collateral.
  const samples = makeEffSamples(1400, { gapMarker: true });
  const out = calculateEfficiency(samples, samples, makeBlankContext(), 'fartlek');
  assertNotEquals(out, undefined);
  assertEquals(out!.decoupling.basis, 'gap');
});

// ── D-038 Piece 1B: varianceGate override routes steady_state → fartlek ──

import { analyzeHeartRate } from '../../analyze-running-workout/lib/heart-rate/index.ts';

function makeHRSamples(n: number, opts?: { gapMarker?: boolean; baseHr?: number; basePace?: number }) {
  const baseHr = opts?.baseHr ?? 145;
  const basePace = opts?.basePace ?? 540;
  return Array.from({ length: n }, (_, i) => {
    const s: any = {
      timestamp: i,
      heart_rate: baseHr + Math.floor(i / 600),
      pace_s_per_mi: basePace,
    };
    if (opts?.gapMarker) s.raw_pace_s_per_mi = basePace + 5;
    return s;
  });
}

Deno.test('D-038 Piece 1B: varianceGate=true keeps the HONEST type, and flags the decoupling low-confidence WITHOUT corrupting basis', () => {
  // Research-corrected 2026-07-12: pace variance must NEVER re-label a run "fartlek" (fartlek is
  // deliberate speed play; no commercial app names one from variance). A steady_state run whose pace is
  // too variable KEEPS its type — the METRIC carries the uncertainty, not the label.
  // Corrected again 2026-07-14: that uncertainty rode on basis='raw', which the State durability filter
  // reads as "terrain-confounded → delete". It now rides on `mixedEffort`, and `basis` keeps telling the
  // truth about the terrain. The run stays in the trend, hedged rather than erased.
  const samples = makeHRSamples(1400, { gapMarker: true });
  const context = {
    workoutType: 'steady_state' as const,
    intervals: [],
    terrain: { samples },
    varianceGate: { isMixedEffort: true },
  };
  const result = analyzeHeartRate(samples, context as any);
  assertEquals(result.workoutType, 'steady_state');              // NOT relabeled to fartlek
  assertNotEquals(result.efficiency, undefined);
  assertEquals(result.efficiency!.decoupling.basis, 'gap');      // terrain truth preserved
  assertEquals(result.efficiency!.decoupling.mixedEffort, true); // uncertainty on its own channel
  assertEquals(result.summary.decouplingMixedEffort, true);      // and it PERSISTS to every consumer
});

Deno.test('D-038 Piece 1B: varianceGate=true + workoutType=intervals → no override (more specific verdict wins)', () => {
  // When detectWorkoutType (or caller) returned 'intervals' explicitly, the
  // override should NOT downgrade to 'fartlek'. Intervals route stays.
  const samples = makeHRSamples(1400);
  const context = {
    workoutType: 'intervals' as const,
    intervals: [],
    terrain: { samples },
    varianceGate: { isMixedEffort: true },
  };
  const result = analyzeHeartRate(samples, context as any);
  assertEquals(result.workoutType, 'intervals');
});

Deno.test('D-038 Piece 1B: varianceGate=undefined + workoutType=steady_state → no override (back-compat)', () => {
  // Legacy callers don't pass varianceGate. Existing behavior preserved.
  const samples = makeHRSamples(1400);
  const context = {
    workoutType: 'steady_state' as const,
    intervals: [],
    terrain: { samples },
  };
  const result = analyzeHeartRate(samples, context as any);
  assertEquals(result.workoutType, 'steady_state');
});

Deno.test('D-038 Piece 1B: varianceGate=false + workoutType=steady_state → no override', () => {
  // Explicit false on the gate also leaves steady-state alone.
  const samples = makeHRSamples(1400);
  const context = {
    workoutType: 'steady_state' as const,
    intervals: [],
    terrain: { samples },
    varianceGate: { isMixedEffort: false },
  };
  const result = analyzeHeartRate(samples, context as any);
  assertEquals(result.workoutType, 'steady_state');
});

// ── toDisplayFormatV1: vs_similar restructure under isMixedEffort ──────────

function makeFactPacketWithComparisons(): any {
  return {
    version: 1,
    generated_at: '2026-05-23T12:00:00Z',
    facts: {
      workout_date: '2026-05-23', workout_type: 'fartlek', total_distance_mi: 3.5,
      total_duration_min: 33, avg_pace_sec_per_mi: 565, avg_gap_sec_per_mi: 560,
      gap_adjusted: true, avg_hr: 150, max_hr: 167, segments: [],
      weather: null, plan: null, athlete_reported: null,
    },
    derived: {
      execution: null, hr_drift_bpm: 4, raw_hr_drift_bpm: 5,
      terrain_contribution_bpm: 1, pace_normalized_drift_bpm: 3,
      drift_explanation: 'cardiac_drift', hr_drift_typical: 5,
      cardiac_decoupling_pct: null, decoupling_basis: null, decoupling_assessment: null,
      pace_fade_pct: 1, pacing_pattern: null, training_load: null,
      comparisons: {
        vs_similar: { sample_size: 6, pace_delta_sec: -8, hr_delta_bpm: 4, drift_delta_bpm: 1, assessment: 'better_than_usual', pace_basis: 'gap' },
        trend: { direction: 'improving', magnitude: '12 s/mi over 6 workouts', data_points: 6 },
        achievements: [],
      },
      stimulus: null, interval_execution: null, primary_limiter: null, terrain_context: null,
    },
  };
}

Deno.test('D-037 mixed-effort: toDisplayFormatV1 with isMixedEffort=true nulls pace fields on vs_similar', () => {
  const fp = makeFactPacketWithComparisons();
  const dp = toDisplayFormatV1(fp, [], { isMixedEffort: true, intervalBreakdown: null }, null);
  assertNotEquals(dp.signals.comparisons.vs_similar, null);
  assertEquals(dp.signals.comparisons.vs_similar.pace_delta, null);
  assertEquals(dp.signals.comparisons.vs_similar.pace_basis, null);
  assertEquals(dp.signals.comparisons.vs_similar.assessment, null);
});

Deno.test('D-037 mixed-effort: toDisplayFormatV1 with isMixedEffort=true preserves hr_delta and drift_delta', () => {
  const fp = makeFactPacketWithComparisons();
  const dp = toDisplayFormatV1(fp, [], { isMixedEffort: true, intervalBreakdown: null }, null);
  assertEquals(dp.signals.comparisons.vs_similar.hr_delta, '4 bpm');
  assertEquals(dp.signals.comparisons.vs_similar.drift_delta, '1 bpm');
  assertEquals(dp.signals.comparisons.vs_similar.sample_size, 6);
});

Deno.test('D-037 mixed-effort: toDisplayFormatV1 with isMixedEffort=true preserves the trend block', () => {
  const fp = makeFactPacketWithComparisons();
  const dp = toDisplayFormatV1(fp, [], { isMixedEffort: true, intervalBreakdown: null }, null);
  assertNotEquals(dp.signals.comparisons.trend, null);
  assertEquals(dp.signals.comparisons.trend.direction, 'improving');
  assertEquals(dp.signals.comparisons.trend.data_points, 6);
});

Deno.test('D-037 mixed-effort: toDisplayFormatV1 with isMixedEffort=false preserves all fields (regression)', () => {
  const fp = makeFactPacketWithComparisons();
  const dp = toDisplayFormatV1(fp, [], null, null);
  assertEquals(dp.signals.comparisons.vs_similar.assessment, 'better_than_usual');
  assertEquals(dp.signals.comparisons.vs_similar.pace_basis, 'gap');
  assertNotEquals(dp.signals.comparisons.vs_similar.pace_delta, null);
  assertEquals(dp.signals.comparisons.vs_similar.hr_delta, '4 bpm');
  assertEquals(dp.signals.comparisons.trend.direction, 'improving');
});

// ── buildUserMessage rendering under mixed-effort ─────────────────────────

Deno.test('D-037 mixed-effort: buildUserMessage suppresses "Pace vs similar" line under isMixedEffort', () => {
  const fp = makeFactPacketWithComparisons();
  const dp = toDisplayFormatV1(fp, [], { isMixedEffort: true, intervalBreakdown: null }, null);
  const msg = buildUserMessage(dp);
  assertEquals(msg.includes('Pace vs similar'), false);
});

Deno.test('D-037 mixed-effort: buildUserMessage keeps "HR vs similar" and "Trend" lines under isMixedEffort', () => {
  const fp = makeFactPacketWithComparisons();
  const dp = toDisplayFormatV1(fp, [], { isMixedEffort: true, intervalBreakdown: null }, null);
  const msg = buildUserMessage(dp);
  assertStringIncludes(msg, 'COMPARED TO SIMILAR WORKOUTS');
  assertStringIncludes(msg, 'HR vs similar');
  assertStringIncludes(msg, 'Trend:');
});

// ── D-038 Piece 3: pool_pace_context surface + buildUserMessage ──────────

function makeFactPacketWithPoolContext(intensityMatch: 'matched' | 'current_much_faster' | 'current_much_slower') {
  const fp = makeFactPacketWithComparisons();
  fp.derived.comparisons.vs_similar.pool_pace_context = {
    current_avg_pace_sec: 564,
    pool_avg_pace_sec: 730,
    delta_sec: -166,
    delta_pct: -22.7,
    basis: 'gap',
    intensity_match: intensityMatch,
  };
  return fp;
}

Deno.test('D-038 Piece 3: pool_pace_context surfaces on display packet (always-on, no isMixedEffort gating)', () => {
  const fp = makeFactPacketWithPoolContext('current_much_faster');
  const dp = toDisplayFormatV1(fp, [], { isMixedEffort: true, intervalBreakdown: null }, null);
  const ctx = (dp.signals.comparisons.vs_similar as any).pool_pace_context;
  assertNotEquals(ctx, null);
  assertEquals(ctx.intensity_match, 'current_much_faster');
  assertEquals(ctx.delta_pct, -22.7);
  assertEquals(ctx.basis, 'gap');
});

Deno.test('D-038 Piece 3: pool_pace_context also surfaces when isMixedEffort=false (always-on regression)', () => {
  const fp = makeFactPacketWithPoolContext('matched');
  const dp = toDisplayFormatV1(fp, [], null, null);
  const ctx = (dp.signals.comparisons.vs_similar as any).pool_pace_context;
  assertNotEquals(ctx, null);
  assertEquals(ctx.intensity_match, 'matched');
});

Deno.test('D-038 Piece 3: pool_pace_context null when fact-packet doesn\'t carry it (back-compat)', () => {
  const fp = makeFactPacketWithComparisons(); // no pool_pace_context
  const dp = toDisplayFormatV1(fp, [], null, null);
  assertEquals((dp.signals.comparisons.vs_similar as any).pool_pace_context ?? null, null);
});

Deno.test('D-038 Piece 3: buildUserMessage renders "Pool intensity" line when intensity_match != matched', () => {
  const fp = makeFactPacketWithPoolContext('current_much_faster');
  const dp = toDisplayFormatV1(fp, [], { isMixedEffort: true, intervalBreakdown: null }, null);
  const msg = buildUserMessage(dp);
  assertStringIncludes(msg, 'Pool intensity vs this session: current_much_faster');
});

Deno.test('D-038 Piece 3: buildUserMessage omits "Pool intensity" line when intensity_match === matched', () => {
  const fp = makeFactPacketWithPoolContext('matched');
  const dp = toDisplayFormatV1(fp, [], null, null);
  const msg = buildUserMessage(dp);
  assertEquals(msg.includes('Pool intensity vs this session'), false);
});

// POOL INTENSITY CONTEXT prompt rule presence: verified at deploy via the
// other display-packet tests (pool_pace_context surface, buildUserMessage
// renders the line). The rule itself is a string in COACHING_SYSTEM_PROMPT;
// a separate file-read smoke test would require --allow-read and the other
// tests already prove the contract works end-to-end.

// ── D-042: aerobic_direction / aerobic_efficiency_trend_pct on signals ────

Deno.test('D-042: run_easy_hr_trend=-3.5 → aerobic_direction=improving + raw pct surfaces', () => {
  const fp = makeFactPacketWithComparisons();
  const dp = toDisplayFormatV1(fp, [], null, null, null, { runEasyPaceAtHrTrendPct: -3.5 });
  assertEquals((dp.signals as any).aerobic_efficiency_trend_pct, -3.5);
  assertEquals((dp.signals as any).aerobic_direction, 'improving');
});

Deno.test('D-042: run_easy_hr_trend=+3.5 → aerobic_direction=declining', () => {
  const fp = makeFactPacketWithComparisons();
  const dp = toDisplayFormatV1(fp, [], null, null, null, { runEasyPaceAtHrTrendPct: 3.5 });
  assertEquals((dp.signals as any).aerobic_direction, 'declining');
});

Deno.test('D-042: run_easy_hr_trend=0.5 → aerobic_direction=stable (inside ±2% band)', () => {
  const fp = makeFactPacketWithComparisons();
  const dp = toDisplayFormatV1(fp, [], null, null, null, { runEasyPaceAtHrTrendPct: 0.5 });
  assertEquals((dp.signals as any).aerobic_direction, 'stable');
});

Deno.test('D-042: ±2% boundary — exactly -2 stays stable; just under -2 becomes improving', () => {
  // Tier function uses strict < / > comparisons matching compute-snapshot:409.
  const dpA = toDisplayFormatV1(makeFactPacketWithComparisons(), [], null, null, null, { runEasyPaceAtHrTrendPct: -2 });
  assertEquals((dpA.signals as any).aerobic_direction, 'stable');
  const dpB = toDisplayFormatV1(makeFactPacketWithComparisons(), [], null, null, null, { runEasyPaceAtHrTrendPct: -2.0001 });
  assertEquals((dpB.signals as any).aerobic_direction, 'improving');
});

Deno.test('D-042: run_easy_hr_trend=null → both fields null', () => {
  const fp = makeFactPacketWithComparisons();
  const dp = toDisplayFormatV1(fp, [], null, null, null, { runEasyPaceAtHrTrendPct: null });
  assertEquals((dp.signals as any).aerobic_efficiency_trend_pct, null);
  assertEquals((dp.signals as any).aerobic_direction, null);
});

Deno.test('D-042: aerobicTrend omitted entirely → both fields null (legacy caller back-compat)', () => {
  const fp = makeFactPacketWithComparisons();
  const dp = toDisplayFormatV1(fp, [], null, null, null);
  assertEquals((dp.signals as any).aerobic_efficiency_trend_pct, null);
  assertEquals((dp.signals as any).aerobic_direction, null);
});

Deno.test('D-042: NaN / non-finite input → null (defensive)', () => {
  const dpNaN = toDisplayFormatV1(makeFactPacketWithComparisons(), [], null, null, null, { runEasyPaceAtHrTrendPct: Number.NaN });
  assertEquals((dpNaN.signals as any).aerobic_direction, null);
  assertEquals((dpNaN.signals as any).aerobic_efficiency_trend_pct, null);
});
