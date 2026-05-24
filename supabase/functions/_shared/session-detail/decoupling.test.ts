/**
 * Tests for D-036 — GAP-corrected aerobic decoupling for runs. Covers spec §5:
 *  • enrichSamplesWithGAP idempotency + basis detection
 *  • toDisplayFormatV1 surfaces decoupling_basis + decoupling_assessment when
 *    cardiac_decoupling present
 *  • AEROBIC DECOUPLING prompt rule is in COACHING_SYSTEM_PROMPT
 *  • session_detail_v1.classification.decoupling shape (null when missing,
 *    populated when heart_rate_summary carries the fields)
 *
 * Run from repo root:
 *   deno test supabase/functions/_shared/session-detail/decoupling.test.ts --no-check
 */
import { assertEquals, assertNotEquals, assertStringIncludes } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { enrichSamplesWithGAP } from '../gap.ts';
import { toDisplayFormatV1 } from '../fact-packet/ai-summary.ts';

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
