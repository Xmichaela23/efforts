/**
 * D-238 fixture — the cardio load ladder is OUTPUT-FIRST and resting-HR-free.
 * A power ride scores off power (not TRIMP); an HR-only run scores off HR-vs-LTHR;
 * an RPE-only session scores off sRPE; nothing ever reads resting HR.
 *
 * Regression guard for the TRImP-on-fabricated-60 correction (247 cardio workouts,
 * 0 stored resting HR, 215 with real wattage TRIMP ignored).
 */
import { assertEquals, assert } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import {
  inferIntensityFromPerformance, resolveCardioIntensity,
  classifyWorkloadMethod,
  calculateDurationWorkload,
} from './workload.ts';

// --- intensity inference: output-first, LTHR (never resting HR) ---

Deno.test('ride with power scores off power vs FTP (not TRIMP)', () => {
  // 176 W on a 176 FTP → IF ~1.0 → intensity 1.00
  assertEquals(inferIntensityFromPerformance({ type: 'ride', avgPower: 176, ftp: 176 }), 1.0);
  // 132 W on 176 FTP → IF 0.75 → 0.80
  assertEquals(inferIntensityFromPerformance({ type: 'ride', avgPower: 132, ftp: 176 }), 0.75); // raw 132/176, no steps
  assertEquals(inferIntensityFromPerformance({ type: 'ride', avgPower: 109, normalizedPower: 131, ftp: 167 }), 0.784); // NP wins over avg
  // power present but NO ftp → falls through (no output signal here)
  assertEquals(inferIntensityFromPerformance({ type: 'ride', avgPower: 200 }), 0);
});

Deno.test('run with HR scores off HR-vs-LTHR (threshold HR, never resting HR)', () => {
  // 151 bpm at LTHR 151 → 100% → Friel Z5a → 70 TSS/hr → sqrt(0.70)
  assertEquals(inferIntensityFromPerformance({ type: 'run', avgHr: 151, thresholdHr: 151 }), 0.837);
  // 121/151 = 80.1% → Friel run Z1 (high half) → 20 TSS/hr → sqrt(0.20)
  assertEquals(inferIntensityFromPerformance({ type: 'run', avgHr: 121, thresholdHr: 151 }), 0.447);
  // HR present but NO threshold HR → no fabricated fallback → 0 (falls to sRPE/default)
  assertEquals(inferIntensityFromPerformance({ type: 'run', avgHr: 140 }), 0);
});

Deno.test('no output signal → 0 (caller falls through to sRPE / default)', () => {
  assertEquals(inferIntensityFromPerformance({ type: 'run' }), 0);
  assertEquals(inferIntensityFromPerformance({ type: 'ride', avgHr: 150 }), 0); // no ftp, no LTHR
});

Deno.test('CROSS-DISCIPLINE TRAP: a run with Stryd power is NOT scored against cycling FTP', () => {
  // Michael's real shape: run avg_power 254 (running watts), cycling FTP 176, avgHr 135, LTHR 151.
  // The BUG would be 254/176 = 1.44 → 1.15 intensity (massive over-score). The power branch is
  // ride-only, so the run must fall to HR%LTHR: 135/151 = 89.4% → Friel run Z2 (high half) → 50 TSS/hr → 0.707 (NOT 1.15).
  const run = inferIntensityFromPerformance({ type: 'run', avgPower: 254, ftp: 176, avgHr: 135, thresholdHr: 151 });
  assertEquals(run, 0.707);
  assert(run < 1.0, 'run-power must never produce a power-based over-score');
  // and a run with power but NO HR/LTHR → 0 (run-power ignored, falls to sRPE/default), never 254/ftp.
  assertEquals(inferIntensityFromPerformance({ type: 'run', avgPower: 254, ftp: 176 }), 0);
});

// --- method classification mirrors the ladder; TRIMP is never emitted ---

Deno.test('classifyWorkloadMethod is output-first, never TRIMP', () => {
  const ride = classifyWorkloadMethod({
    type: 'ride', hasAvgHr: true, hasThresholdHr: true, hasFtp: true, hasAvgPower: true,
    hasStepsPreset: false, noPerformanceInference: false, rpeAvailable: false,
  });
  assertEquals(ride, { method: 'power_intensity', estimated: false });

  const run = classifyWorkloadMethod({
    type: 'run', hasAvgHr: true, hasThresholdHr: true, hasFtp: false, hasAvgPower: false,
    hasStepsPreset: false, noPerformanceInference: false, rpeAvailable: false,
  });
  assertEquals(run, { method: 'hr_intensity', estimated: false });

  const rpeOnly = classifyWorkloadMethod({
    type: 'run', hasAvgHr: false, hasThresholdHr: false, hasFtp: false, hasAvgPower: false,
    hasStepsPreset: false, noPerformanceInference: true, rpeAvailable: true,
  });
  assertEquals(rpeOnly, { method: 'srpe_estimated', estimated: true });

  const doubleMissing = classifyWorkloadMethod({
    type: 'run', hasAvgHr: false, hasThresholdHr: false, hasFtp: false, hasAvgPower: false,
    hasStepsPreset: false, noPerformanceInference: true, rpeAvailable: false,
  });
  assertEquals(doubleMissing, { method: 'duration_default', estimated: true });

  // A ride with HR but no power/LTHR and no output → duration_default, NEVER trimp_*.
  const hrOnlyRide = classifyWorkloadMethod({
    type: 'ride', hasAvgHr: true, hasThresholdHr: false, hasFtp: false, hasAvgPower: false,
    hasStepsPreset: false, noPerformanceInference: true, rpeAvailable: false,
  });
  assert(!hrOnlyRide.method.startsWith('trimp'), 'must never classify as TRIMP');
});

// --- end-to-end: a power ride's LOAD is duration × powerIF², not an HR-reserve number ---

Deno.test('power ride load = duration × power-IF² (output-based, RHR-free)', () => {
  const intensity = inferIntensityFromPerformance({ type: 'ride', avgPower: 176, ftp: 176 }); // IF 1.0 → 1.00
  assertEquals(intensity, 1.0);
  const load = calculateDurationWorkload(60, intensity); // 1 h at IF 1.0 → 100
  assertEquals(load, 100);
  // 167 W / 176 FTP = 0.949 raw → 60 min → round(0.949² × 100) = 90 (TrainingPeaks TSS, no steps)
  assertEquals(calculateDurationWorkload(60, inferIntensityFromPerformance({ type: 'ride', avgPower: 167, ftp: 176 })), 90);
});

// --- THE ONE RULE: measured beats self-reported (TrainingPeaks), 2026-09-04 ---
Deno.test('resolveCardioIntensity: power beats the rating; the rating only fires with nothing measured', () => {
  const powered = resolveCardioIntensity({ type: 'ride', avgPower: 109, normalizedPower: 131, ftp: 167, rpe: 4 });
  assertEquals(powered.method, 'power');
  assertEquals(powered.intensity, 0.784);
  const hrOnly = resolveCardioIntensity({ type: 'ride', avgHr: 135, thresholdHr: 153, rpe: 4 });
  assertEquals(hrOnly.method, 'hr');
  const rated = resolveCardioIntensity({ type: 'ride', rpe: 4 });
  assertEquals(rated, { intensity: 0.632, method: 'rating' }); // Friel: RPE 4 = 40 TSS/hr → sqrt(0.40)
  const bare = resolveCardioIntensity({ type: 'run' });
  assertEquals(bare, { intensity: 0, method: 'default' }); // no data → no TSS (TrainingPeaks)
});
