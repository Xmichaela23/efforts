/**
 * THE RUN'S DRIFT (2026-09-27): TrainingPeaks' Pa:Hr, worked out by `_shared/run-pace.ts runDecouplingPct` over the
 * one drift rule rides share (`_shared/aerobic-decoupling.ts steadyDecouplingPct`). It reads the steady middle (the first 20 minutes and the last 10 left out, at least 20 left), splits it at its middle second, and compares each half's average grade-adjusted speed (every
 * recorded second, stops at 0) over its average heart rate. Sources are in those
 * files.
 *
 * ⛔ IT READS THE RECORDING'S ROWS, NOT THE ANALYSER'S SAMPLES. The analyser's samples are the moving ones
 * (`supabase/lib/analysis/sensor-data/extractor.ts extractSensorData` drops a second with no pace), so a stop's heart
 * rate left its half and the read started at the first moving second. The rows are every second of the recording
 * (`normalizeSamples`, the ride's row reader), so a stop counts as it does on a ride.
 *
 * Replaced that day, and deleted rather than kept beside it: a 10-minute warm-up skip (at most 15% of the samples)
 * with nothing cut at the end, a 1,200-sample floor, halves split by sample count, and a ratio built from the mean of
 * the pace. The mixed-effort switch (D-037) went with them: it reached no screen, and drift is read on steady
 * sessions only (`_shared/session-detail/session-steadiness.ts`).
 */

import { EfficiencyMetrics, RecordingRow } from './types.ts';
import { frielBand } from '../../../_shared/state-trend/run.ts';
import { runDecouplingPct } from '../../../_shared/run-pace.ts';

/**
 * Map a decoupling % to this pipeline's display words using the SINGLE shared band the STATE run row +
 * coach use (frielBand). Q-161: frielBand is now the two science-defensible states at the 5% line
 * (≤5% sound / >5% needs work) — the old 4-word convention (excellent/good/moderate/high off a
 * <3/<5/<8 scale) collapsed with it, so the workout card can't grade finer than the science supports
 * or diverge from State. `good` = base sound, `needs_work` = build more base (or a residual confound).
 */
export function decouplingAssessmentFromPct(pct: number): 'good' | 'needs_work' {
  return frielBand(pct) === 'sound' ? 'good' : 'needs_work';
}

/**
 * The run's pace-to-heart-rate decoupling, or undefined when its steady middle is under 20 minutes.
 * ⛔ `basis` answers ONE question: was the speed grade-adjusted (the run had usable elevation)? Nothing else. Only a
 * 'gap' read is a trustworthy fitness signal — the Performance drift row gates on it (Q-158 follow-on), and
 * `state-trend/run.ts` drops a 'raw' row from the durability trend on exactly that meaning (2026-07-14).
 */
export function calculateEfficiency(recording: ReadonlyArray<RecordingRow>): EfficiencyMetrics | undefined {
  const drift = runDecouplingPct(recording.map((r) => ({ t: r.t, d: r.d, v: r.v_mps, elev: r.elev, hr: r.hr })));
  if (drift == null) return undefined;
  return {
    decoupling: {
      basis: drift.basis,
      percent: drift.pct,
      // Assessed on the SAME shared band State + coach use (see decouplingAssessmentFromPct).
      assessment: decouplingAssessmentFromPct(drift.pct),
    },
  };
}
