/**
 * Tests for D-036 — GAP-corrected aerobic decoupling for runs. Covers spec §5:
 *  • enrichSamplesWithGAP idempotency + basis detection
 *  • session_detail_v1.classification.decoupling shape (null when missing,
 *    populated when heart_rate_summary carries the fields)
 *
 * Plus `basis` as the terrain fact only, so a steady run stays in the State durability trend (the REGRESSION
 * test below; this pinned a live bug on 2026-07-14). D-037's mixed-effort switch is gone (2026-09-27, below).
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
import type { RecordingRow, SensorSample } from '../../analyze-running-workout/lib/heart-rate/types.ts';

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

// ── calculateEfficiency and the run's heart-rate analysis ─────────────────
//
// ⛔ D-037's mixed-effort switch is gone (2026-09-27). `forMixedEffort` let a mixed run through the steady-state
// guard and stamped `mixedEffort` on the number; the stamp reached no screen (it was copied into State's run rows
// and read by nothing), and drift is read on steady sessions only (`session-steadiness.ts`). The tests that pinned
// it went with it. What they protected stays pinned below: `basis` says only whether the pace was grade-adjusted,
// so a steady run with usable elevation keeps its place in the State durability trend.

// The analyser's moving samples (zones, bpm drift) and the recording's rows (the decoupling, 2026-09-27) for one run.
function makeHRSamples(n: number, opts?: { gapMarker?: boolean; baseHr?: number; basePace?: number }): SensorSample[] {
  const baseHr = opts?.baseHr ?? 145;
  const basePace = opts?.basePace ?? 540;
  return Array.from({ length: n }, (_, i) => {
    const s: any = {
      timestamp: i,
      heart_rate: baseHr + Math.floor(i / 600), // tiny upward drift so the halves differ
      pace_s_per_mi: basePace,
    };
    if (opts?.gapMarker) s.raw_pace_s_per_mi = basePace + 5; // simulates enrichSamplesWithGAP marker
    return s as SensorSample;
  });
}
/** `hilly`: 20 m of rolling elevation, so the speed is grade-adjusted ('gap'); else no elevation ('raw'). */
function makeRecording(n: number, opts?: { hilly?: boolean; baseHr?: number }): RecordingRow[] {
  const baseHr = opts?.baseHr ?? 145;
  return Array.from({ length: n }, (_, i) => ({
    t: i,
    d: i * 3,
    v_mps: 3,
    hr: baseHr + Math.floor(i / 600),
    ...(opts?.hilly ? { elev: 100 + 10 * Math.sin(i / 300) } : {}),
  }));
}

// ⛔ REGRESSION (2026-07-14): a steady run with usable elevation must survive the State durability filter.
// `state-trend/run.ts` drops a 'raw' row, so `basis` may never carry anything but the terrain fact.
Deno.test('REGRESSION: a steady run with grade-adjusted pace reaches the durability substrate', () => {
  const out = calculateEfficiency(makeRecording(3600, { hilly: true }));
  assertNotEquals(out, undefined);
  assertEquals(out!.decoupling.basis, 'gap');
  const series = decouplingToSeries([{
    date: '2026-07-13',
    decoupling_pct: out!.decoupling.percent,
    decoupling_basis: out!.decoupling.basis,
    workout_type: 'steady_state',
    duration_minutes: 60,
  }]);
  assertEquals(series.length, 1);
});

// ── D-038 Piece 1B: pace variance never re-labels the run ──

import { analyzeHeartRate } from '../../analyze-running-workout/lib/heart-rate/index.ts';

Deno.test('D-038 Piece 1B: a steady_state run keeps its type and its decoupling', () => {
  // Research-corrected 2026-07-12: pace variance must NEVER re-label a run "fartlek" (fartlek is
  // deliberate speed play; no commercial app names one from variance).
  const samples = makeHRSamples(3600, { gapMarker: true });
  const recording = makeRecording(3600, { hilly: true });
  const result = analyzeHeartRate(samples, { workoutType: 'steady_state', intervals: [], terrain: { samples }, recording } as any);
  assertEquals(result.workoutType, 'steady_state');
  assertEquals(result.efficiency!.decoupling.basis, 'gap');
  assertEquals(typeof result.summary.decouplingPct, 'number');
});

Deno.test('an intervals run keeps its type and has no decoupling', () => {
  const samples = makeHRSamples(3600);
  const recording = makeRecording(3600, { hilly: true });
  const result = analyzeHeartRate(samples, { workoutType: 'intervals', intervals: [], terrain: { samples }, recording } as any);
  assertEquals(result.workoutType, 'intervals');
  assertEquals(result.summary.decouplingPct, null);
});
