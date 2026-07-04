/**
 * D-237 fixture: classifyWorkloadMethod tags whether a stored workload was
 * ESTIMATED (default intensity / assumed resting HR) vs MEASURED, so the load
 * that feeds ACWR (workload_actual) self-declares — the Stage-1 fix for the
 * W1/W2 write-time silent-impersonation class (ingest sweep, 2026-07-03).
 *
 * Run from repo root:
 *   deno test supabase/functions/_shared/workload-method.test.ts --no-check
 */
import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { classifyWorkloadMethod, isLowTrustWorkload } from './workload.ts';

const base = {
  type: 'run', hasAvgHr: false, hasThresholdHr: false,
  hasFtp: false, hasAvgPower: false, hasStepsPreset: false,
  noPerformanceInference: false, rpeAvailable: false,
};

// ── the estimated cases (W1, W2, sRPE tier) ─────────────────────────────────

Deno.test('W1: cardio, no effort signal AND no RPE → duration_default, ESTIMATED (lowest trust)', () => {
  assertEquals(
    classifyWorkloadMethod({ ...base, type: 'run', noPerformanceInference: true }),
    { method: 'duration_default', estimated: true },
  );
  // ride too (0.70 default) — the unrecoverable-tell case
  assertEquals(
    classifyWorkloadMethod({ ...base, type: 'ride', noPerformanceInference: true }),
    { method: 'duration_default', estimated: true },
  );
});

Deno.test('sRPE: no HR/power/pace but a logged RPE → srpe_estimated (field-standard, NOT low-trust)', () => {
  const r = classifyWorkloadMethod({ ...base, type: 'run', noPerformanceInference: true, rpeAvailable: true });
  assertEquals(r, { method: 'srpe_estimated', estimated: true });
  assertEquals(isLowTrustWorkload(r.method), false); // does NOT count toward Stage-2 disclosure
});

Deno.test('trust tiers: duration_default is low-trust; srpe + measured are not (trimp retired D-238)', () => {
  assertEquals(isLowTrustWorkload('duration_default'), true);
  assertEquals(isLowTrustWorkload('trimp_resting_assumed'), true); // historical rows only
  assertEquals(isLowTrustWorkload('hr_rejected_corrupt'), true);
  assertEquals(isLowTrustWorkload('srpe_estimated'), false);
  assertEquals(isLowTrustWorkload('power_intensity'), false);
});

// ── D-238: cardio is OUTPUT-FIRST; TRIMP / resting HR are never classified ───

Deno.test('D-238: cardio with HR but NO output/threshold signal → duration_default (never trimp)', () => {
  // was W2 (trimp_resting_assumed); post-D-238 an HR-only session with no LTHR/power has no
  // output signal → the caller reports noPerformanceInference and it falls to the default.
  assertEquals(
    classifyWorkloadMethod({ ...base, type: 'run', hasAvgHr: true, noPerformanceInference: true }),
    { method: 'duration_default', estimated: true },
  );
});

// ── MEASURED cases stay estimated:false ─────────────────────────────────────

Deno.test('power vs FTP → power_intensity, measured (output-first)', () => {
  assertEquals(
    classifyWorkloadMethod({ ...base, type: 'ride', hasFtp: true, hasAvgPower: true }),
    { method: 'power_intensity', estimated: false },
  );
});

Deno.test('cardio HR vs THRESHOLD HR (LTHR) → hr_intensity, measured (never resting HR)', () => {
  assertEquals(
    classifyWorkloadMethod({ ...base, type: 'run', hasAvgHr: true, hasThresholdHr: true }),
    { method: 'hr_intensity', estimated: false },
  );
  // a ride with power AND HR+LTHR → power wins (output-first)
  assertEquals(
    classifyWorkloadMethod({ ...base, type: 'ride', hasAvgHr: true, hasThresholdHr: true, hasFtp: true, hasAvgPower: true }),
    { method: 'power_intensity', estimated: false },
  );
});

Deno.test('strength → volume_based, measured', () => {
  assertEquals(
    classifyWorkloadMethod({ ...base, type: 'strength' }),
    { method: 'volume_based', estimated: false },
  );
});

Deno.test('inferred intensity present (swim pace) → duration_intensity, measured', () => {
  assertEquals(
    classifyWorkloadMethod({ ...base, type: 'swim', noPerformanceInference: false }),
    { method: 'duration_intensity', estimated: false },
  );
});
