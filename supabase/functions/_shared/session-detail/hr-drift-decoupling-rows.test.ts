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

Deno.test('Q-158 (1): GAP decoupling renders the run FACT (not a base verdict) and SUPPRESSES the bpm line', () => {
  const rows = buildAnalysisDetailRows(
    factPacketWithDrift(6), [], false, null, false, [], 'run', null, null, GAP_GOOD,
  );
  // ⛔ THE ROW IS NAMED "Heart rate" NOW, ON BOTH BRANCHES (2026-08-02). It used to be labelled
  // "Aerobic decoupling" when the percentage was trustworthy and "Heart rate" when it was not — two
  // names for one question, with the technical one appearing exactly when there was most to say.
  // The suppression rule this test exists to protect is UNCHANGED; it is now asserted by COUNTING the
  // row rather than by the old label's absence, which would be vacuous.
  const dec = find(rows, 'Heart rate');
  assertEquals(!!dec, true, 'the heart-rate row must render on a GAP-basis read');
  assertStringIncludes(dec!.value, '4.2%');
  // audit 2026-07-17: the per-run row states a RUN FACT, not a base verdict. "aerobic base needs work / is
  // sound" is a LONGITUDINAL claim owned by the State trend (confound-excluded, personal). ≤5% → held steady.
  assertStringIncludes(dec!.value, 'Held steady with pace');
  assertEquals(dec!.value.includes('aerobic base'), false, 'per-run row must NOT issue the base verdict');
  // Exactly ONE HR-behaviour read — never the % verdict and the descriptive bpm line together.
  assertEquals(labels(rows).filter((l) => l === 'Heart rate').length, 1, 'exactly one HR row');
  assertEquals(dec!.value.includes('bpm'), false, 'the bpm description must be suppressed when % shown');
});

Deno.test('audit 2026-07-17: a CONFOUNDED run stamps NO verdict — it falls through to the measured line', () => {
  // Heat/effort-confounded run (the July 13 84°F case): the app flagged the % unreliable and State EXCLUDES
  // it, so the per-run row must NOT scold "aerobic base needs work" off it. No decoupling row; bpm line owns it.
  const CONFOUNDED = { ...GAP_HIGH, confounded: true }; // 9.1% but confounded
  const rows = buildAnalysisDetailRows(
    factPacketWithDrift(9), [], false, null, false, [], 'run', null, null, CONFOUNDED,
  );
  // The row name is shared now, so "no verdict" is asserted on the VALUE: a confounded run gets the
  // measured bpm description and no percentage.
  const hr = find(rows, 'Heart rate');
  assertEquals(!!hr, true, 'the measured bpm line renders instead');
  assertStringIncludes(hr!.value, 'bpm');
  assertEquals(/drift \d/.test(hr!.value), false, 'confounded run must NOT stamp a decoupling percentage');
});

Deno.test('Q-158 (1b): high decoupling still suppresses the bpm line (no competing verdict)', () => {
  const rows = buildAnalysisDetailRows(
    factPacketWithDrift(14), [], false, null, false, [], 'run', null, null, GAP_HIGH,
  );
  const hr = find(rows, 'Heart rate');
  assertStringIncludes(hr!.value, '9.1%');
  assertEquals(labels(rows).filter((l) => l === 'Heart rate').length, 1, 'still exactly one HR row');
  assertEquals(hr!.value.includes('bpm'), false, 'no competing bpm line');
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

// ── The suppressed read names its reason (2026-08-02) ───────────────────────
// ⛔ THE REGRESSION THIS PINS. Michael's 2026-08-02 Long Run showed "Drifted +5 bpm", then after a
// recompute populated its per-mile segments it showed NOTHING — the pace-spread suppression started
// firing and the heart-rate read left the screen with no explanation. The suppression is correct
// (the run slowed 86 s/mi; a raw bpm rise across that is not a durability signal). The silence was not.

const VARIABLE_PACE_PACKET = (driftBpm: number) => {
  const p = factPacketWithDrift(driftBpm);
  // Five mile segments spanning >= 75 s/mi — the shipped suppression trigger.
  (p as any).facts = {
    ...((p as any).facts ?? {}),
    segments: [
      { pace_sec_per_mi: 620 }, { pace_sec_per_mi: 650 }, { pace_sec_per_mi: 680 },
      { pace_sec_per_mi: 700 }, { pace_sec_per_mi: 710 },
    ],
  };
  return p;
};

Deno.test('⛔ a suppressed heart-rate read says WHY, instead of vanishing', () => {
  const rows = buildAnalysisDetailRows(
    VARIABLE_PACE_PACKET(5), [], false, null, false, [], 'run', null, null, RAW,
  );
  const hr = rows.find((r) => r.label === 'Heart rate');
  assertEquals(!!hr, true, 'the row must still render');
  assertStringIncludes(hr!.value, 'pace varied too much');
  // It states a fact about the RUN, never the app apologising for itself (D-359 §3).
  assertEquals(/too few|not enough|insufficient|unavailable/i.test(hr!.value), false);
  // And it does not smuggle the number it just declined to interpret.
  assertEquals(/\d+ bpm/.test(hr!.value), false);
});

Deno.test('no drift measured at all → no row, not an apology', () => {
  const rows = buildAnalysisDetailRows(
    VARIABLE_PACE_PACKET(0), [], false, null, false, [], 'run', null, null, RAW,
  );
  assertEquals(rows.find((r) => r.label === 'Heart rate'), undefined);
});

Deno.test('a trustworthy percentage still wins — the reason line never competes with it', () => {
  const rows = buildAnalysisDetailRows(
    VARIABLE_PACE_PACKET(5), [], false, null, false, [], 'run', null, null, GAP_GOOD,
  );
  const hr = rows.find((r) => r.label === 'Heart rate');
  assertStringIncludes(hr!.value, '4.2%');
  assertEquals(rows.filter((r) => r.label === 'Heart rate').length, 1);
});
