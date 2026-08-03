/**
 * Tests for D-036 — GAP-corrected aerobic decoupling for runs. Covers spec §5:
 *  • enrichSamplesWithGAP idempotency + basis detection
 *  • session_detail_v1.classification.decoupling shape (null when missing,
 *    populated when heart_rate_summary carries the fields)
 *
 * Plus the mixed-effort follow-on (D-037 scope):
 *  • calculateEfficiency forMixedEffort flag bypasses the steady-state guard
 *    but does NOT corrupt `basis` — the confidence fact rides on `mixedEffort`,
 *    so a mixed-effort run stays in the State durability trend (see the
 *    REGRESSION tests below; this pinned a live bug on 2026-07-14).
 *
 * ⛔ [D-372] — THE DISPLAY-PACKET HALF OF THIS FILE IS GONE, AND ON PURPOSE.
 * This file used to also test `toDisplayFormatV1` and `buildUserMessage` from
 * `_shared/fact-packet/ai-summary.ts`: the D-036 basis/assessment surface, the
 * D-037 vs_similar pace-nulling, the D-038 Piece 3 pool_pace_context lines, and
 * the D-042 aerobic_direction band. **That module was the run session screen's
 * LLM prompt builder, and the LLM output path is deleted** — so every one of
 * those tests pinned the WORDING OF A LINE THAT NO SCREEN RENDERS. Verified
 * before removal: there is no pace-vs-similar row anywhere in
 * `session-detail/build.ts` or any client component, and `aerobic_direction` /
 * `pool_pace_context` had no reader outside the deleted module.
 *
 * ⚠️ What did NOT go with it, because it was rebuilt on the deterministic spine
 * and is tested where it now lives: **D-035** (the unplanned flag —
 * `session-detail/types.ts:351`, `build.ts:1038`) and **D-036's decoupling
 * verdict** (`build.ts:766/1041/1809`). Do not "restore" these tests; they would
 * be testing a second, dead copy.
 *
 * Run from repo root:
 *   deno test supabase/functions/_shared/session-detail/decoupling.test.ts --no-check
 */
import { assertEquals, assertNotEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { enrichSamplesWithGAP } from '../gap.ts';
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
