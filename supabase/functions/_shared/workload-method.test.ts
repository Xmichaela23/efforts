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
import { classifyWorkloadMethod } from './workload.ts';

const base = {
  type: 'run', hasAvgHr: false, hasMaxHr: false, hasThresholdHr: false,
  hasFtp: false, hasAvgPower: false, hasStepsPreset: false,
  intensityDefaulted: false, restingAssumed: false,
};

// ── the two ESTIMATED cases (W1, W2) ────────────────────────────────────────

Deno.test('W1: cardio with no effort signal → duration_default, ESTIMATED', () => {
  assertEquals(
    classifyWorkloadMethod({ ...base, type: 'run', intensityDefaulted: true }),
    { method: 'duration_default', estimated: true },
  );
  // ride too (0.70 default) — the unrecoverable-tell case
  assertEquals(
    classifyWorkloadMethod({ ...base, type: 'ride', intensityDefaulted: true }),
    { method: 'duration_default', estimated: true },
  );
});

Deno.test('W2: TRIMP but no stored resting HR → trimp_resting_assumed, ESTIMATED', () => {
  assertEquals(
    classifyWorkloadMethod({ ...base, type: 'run', hasAvgHr: true, hasMaxHr: true, restingAssumed: true }),
    { method: 'trimp_resting_assumed', estimated: true },
  );
});

// ── MEASURED cases stay estimated:false ─────────────────────────────────────

Deno.test('real TRIMP (HR + max HR + real resting) → trimp_hr_based, measured', () => {
  assertEquals(
    classifyWorkloadMethod({ ...base, type: 'run', hasAvgHr: true, hasMaxHr: true, restingAssumed: false }),
    { method: 'trimp_hr_based', estimated: false },
  );
});

Deno.test('TRIMP precedence: HR+maxHR wins even if intensity would have defaulted', () => {
  // restingAssumed drives the estimate; intensityDefaulted is irrelevant once TRIMP runs.
  assertEquals(
    classifyWorkloadMethod({ ...base, type: 'ride', hasAvgHr: true, hasMaxHr: true, intensityDefaulted: true, restingAssumed: false }),
    { method: 'trimp_hr_based', estimated: false },
  );
});

Deno.test('power vs FTP → power_intensity, measured', () => {
  assertEquals(
    classifyWorkloadMethod({ ...base, type: 'ride', hasFtp: true, hasAvgPower: true }),
    { method: 'power_intensity', estimated: false },
  );
});

Deno.test('run HR vs threshold (no maxHR) → hr_intensity, measured', () => {
  assertEquals(
    classifyWorkloadMethod({ ...base, type: 'run', hasAvgHr: true, hasThresholdHr: true }),
    { method: 'hr_intensity', estimated: false },
  );
});

Deno.test('strength → volume_based, measured', () => {
  assertEquals(
    classifyWorkloadMethod({ ...base, type: 'strength' }),
    { method: 'volume_based', estimated: false },
  );
});

Deno.test('inferred intensity present (not defaulted) → duration_intensity, measured', () => {
  assertEquals(
    classifyWorkloadMethod({ ...base, type: 'swim', intensityDefaulted: false }),
    { method: 'duration_intensity', estimated: false },
  );
});
