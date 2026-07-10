/**
 * D-270 — the per-lift e1RM DIRECTION now READS the spine (state_trends_v1.strength.per_lift) via
 * `spine_e1rm_direction`, instead of the structurally-dead `previous_e1rm` delta (always null →
 * always 'stable', so "getting stronger/slipping" never fired — Q-107 H2).
 *
 * Run from repo root:
 *   ~/.deno/bin/deno test supabase/functions/_shared/response-model/weekly-strength-direction.test.ts
 */
import { assert, assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { computeStrength } from './weekly.ts';
import type { StrengthLiftSnapshot } from './types.ts';

// RIR on-target (deviation 0 → not add-weight, not back-off) so the e1RM DIRECTION decides the verdict.
function bench(spineDir: StrengthLiftSnapshot['spine_e1rm_direction']): StrengthLiftSnapshot {
  return {
    canonical_name: 'bench_press',
    display_name: 'Bench Press',
    current_e1rm: 200,
    previous_e1rm: null,       // the dead field — proves direction does NOT come from here
    current_avg_rir: 2,
    baseline_avg_rir: 2,
    target_rir: 2,             // deviation = 0 → verdict falls through to the e1RM-direction branch
    sessions_in_window: 4,
    best_weight: 185,
    spine_e1rm_direction: spineDir,
  } as StrengthLiftSnapshot;
}

Deno.test('D-270: spine "improving" → "getting stronger" verdict (the dead branch fires again)', () => {
  const res = computeStrength([bench('improving')], 'build');
  const b = res.per_lift[0];
  assertEquals(b.e1rm_trend, 'improving');       // read from the spine, not previous_e1rm
  assertEquals(b.verdict_label, 'getting stronger');
  assertEquals(b.verdict_tone, 'positive');
});

Deno.test('D-270: spine "declining" surfaces as a declining trend (was impossible before)', () => {
  const res = computeStrength([bench('declining')], 'build');
  assertEquals(res.per_lift[0].e1rm_trend, 'declining');
  // overall rollup sees the decline
  assert(res.overall.trend === 'declining' || res.overall.trend === 'maintaining');
});

Deno.test('D-270: no spine direction (null) → falls back to old behavior (stable, no invented direction)', () => {
  const res = computeStrength([bench(null)], 'build');
  assertEquals(res.per_lift[0].e1rm_trend, 'stable');   // previous_e1rm null → old path → stable
  assertEquals(res.per_lift[0].verdict_label, 'on track'); // RIR on-target, no direction claim
});

Deno.test('D-270: spine direction does NOT override a RIR add-weight/back-off prescription', () => {
  // The two facts stay distinct: an improving trend + a genuine RIR headroom still says "add weight"
  // (the prescription), while e1rm_trend carries "improving" (the direction). They coexist, not clash.
  const addWeight = { ...bench('improving'), current_avg_rir: 4, target_rir: 2 } as StrengthLiftSnapshot; // dev +2 → add weight
  const b = computeStrength([addWeight], 'build').per_lift[0];
  assertEquals(b.e1rm_trend, 'improving');       // direction preserved
  assertEquals(b.verdict_label, 'add weight');   // prescription still wins the action label
});
