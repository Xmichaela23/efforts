/**
 * Q-158 — Performance-screen HR read: the decoupling % is the single durability
 * verdict; the phase-BLIND "normal for X min" bpm verdict is gone.
 *
 * Regression guards (permanent — these are the exact lies the fix removed):
 *  1. GAP-basis decoupling → an "Aerobic decoupling" row renders with the % + word,
 *     and the descriptive "Heart rate" bpm line is SUPPRESSED (one read, not two).
 *  2. No decoupling (raw / null) → NO "Aerobic decoupling" row; the descriptive
 *     bpm "Heart rate" line renders but NEVER contains "normal for N min".
 *  3. drift.ts empty-half-window guard → an all-dropout late window returns an
 *     invalid drift (driftBpm 0), so no garbage bpm ever reaches the row.
 *
 * Run from repo root:
 *   deno test supabase/functions/_shared/session-detail/hr-drift-decoupling-rows.test.ts --no-check
 */
import { assertEquals, assertStringIncludes } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { buildAnalysisDetailRows } from './build.ts';
import { analyzeSteadyStateDrift } from '../../analyze-running-workout/lib/heart-rate/drift.ts';

// Minimal factPacket carrying a real, non-trivial drift signal + an own-baseline typical.
function factPacketWithDrift(bpm: number, typical: number | null = 4): any {
  return {
    derived: {
      hr_drift_bpm: bpm,
      pace_normalized_drift_bpm: bpm,
      drift_explanation: null,
      hr_drift_typical: typical,
      terrain_contribution_bpm: null,
      interval_execution: { total_steps: 1 }, // not an interval workout
    },
    facts: { total_duration_min: 65, segments: [] },
  };
}

const GAP_GOOD = { pct: 4.2, basis: 'gap' as const, assessment: 'good' as const };
const GAP_HIGH = { pct: 9.1, basis: 'gap' as const, assessment: 'high' as const };
const RAW = { pct: 6.0, basis: 'raw' as const, assessment: 'moderate' as const };

const labels = (rows: Array<{ label: string; value: string }>) => rows.map((r) => r.label);
const find = (rows: Array<{ label: string; value: string }>, label: string) =>
  rows.find((r) => r.label === label);

Deno.test('Q-158 (1): GAP decoupling renders the % verdict and SUPPRESSES the bpm line', () => {
  const rows = buildAnalysisDetailRows(
    factPacketWithDrift(6), [], false, null, false, [], 'run', null, null, GAP_GOOD,
  );
  const dec = find(rows, 'Aerobic decoupling');
  assertEquals(!!dec, true, 'Aerobic decoupling row must render on a GAP-basis read');
  assertStringIncludes(dec!.value, '4.2%');
  assertStringIncludes(dec!.value, 'good');
  // Exactly one HR-behaviour read: the descriptive bpm "Heart rate" line is gone.
  assertEquals(labels(rows).includes('Heart rate'), false, 'bpm line must be suppressed when % shown');
});

Deno.test('Q-158 (1b): high decoupling still suppresses the bpm line (no competing verdict)', () => {
  const rows = buildAnalysisDetailRows(
    factPacketWithDrift(14), [], false, null, false, [], 'run', null, null, GAP_HIGH,
  );
  assertStringIncludes(find(rows, 'Aerobic decoupling')!.value, '9.1%');
  assertEquals(labels(rows).includes('Heart rate'), false);
});

Deno.test('Q-158 (2): no GAP % → bpm line renders and NEVER says "normal for N min"', () => {
  // raw basis = terrain-confounded → no verdict row; descriptive fallback only.
  const rowsRaw = buildAnalysisDetailRows(
    factPacketWithDrift(6), [], false, null, false, [], 'run', null, null, RAW,
  );
  assertEquals(labels(rowsRaw).includes('Aerobic decoupling'), false, 'raw basis must NOT stamp a verdict');
  const hrRaw = find(rowsRaw, 'Heart rate');
  assertEquals(!!hrRaw, true, 'descriptive bpm line renders when % unavailable');
  assertEquals(/normal for \d+ min/.test(hrRaw!.value), false, 'the phase-blind duration verdict is gone');
  // own-baseline comparison is still allowed (honest, individual-relative).
  assertStringIncludes(hrRaw!.value, 'typical');

  // null decoupling (short/interval/cycling) → same: no verdict row, no "normal for N min".
  const rowsNull = buildAnalysisDetailRows(
    factPacketWithDrift(6), [], false, null, false, [], 'run', null, null, null,
  );
  assertEquals(labels(rowsNull).includes('Aerobic decoupling'), false);
  const hrNull = find(rowsNull, 'Heart rate');
  assertEquals(/normal for \d+ min/.test(hrNull!.value), false);
});

Deno.test('Q-158 (3): all-dropout late window → invalid drift, never a garbage bpm', () => {
  // 40 min at 1 Hz. Early half real HR; late half all zeros (sensor dropout).
  // Pass the UNFILTERED array as validHRSamples (defense-in-depth: proves the guard
  // holds even if a caller stops pre-filtering zeros) — long enough to clear the
  // 15-min / 600-sample gates so it is the empty-window guard that fires, not length.
  const N = 2400;
  const samples = Array.from({ length: N }, (_, i) => ({
    timestamp: i,
    heart_rate: i < N / 2 ? 150 : 0, // late half all dropout
    pace_s_per_mi: 480,
    elevation_m: null,
  })) as any[];
  const ctx: any = { intervals: [], weather: {}, planContext: {} };
  const result = analyzeSteadyStateDrift(samples, samples, ctx, 'easy' as any);
  // Guard fires: driftBpm 0 (invalid), NOT a huge negative like -150.
  assertEquals(result.driftBpm, 0, 'dropout half must yield invalid drift (0), never a garbage value');
  assertStringIncludes(result.scopeDescription, 'Insufficient valid HR', 'the empty-window guard is what fired');
});
