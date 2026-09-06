// Shared endurance model — HR zones. LIFTED FAITHFULLY from src/components/TrainingBaselines.tsx
// (getFrielZones / getKarvonenZones / getHRZones / getZoneModel). Two-copy-with-parity-lock: the
// client computes these for display; this copy is for server-side plan prescription. The parity test
// keeps the two in lockstep (a true single-home unify is deferred — client and edge are separate
// build contexts). Friel %LTHR (Garmin / TrainingPeaks) + Karvonen %HRR. See SPEC-shared-endurance-model.md.

import { frielRunZones } from '../../../../src/lib/friel-zones.ts';

export interface HRZone {
  name: string;
  label: string;
  min: number;
  max: number | null;
}

/**
 * Friel 5-zone model from LTHR (used by Garmin, TrainingPeaks).
 *
 * ⛔ ONE TABLE (2026-09-06). This was a second copy that topped Z2 at round(0.90 × LTHR) while the model
 * the athlete reads on Profile, the learner's easy ceiling and the run grader all use `frielRunZones`
 * (src/lib/friel-zones.ts, D-286: Z2 top = round(0.89 × LTHR)). At LTHR 152 the calendar's easy steps
 * said 129–137 and Profile said 129–135. The copy is gone; this delegates, the same way easy-hr.ts does.
 */
export function frielZones(lthr: number): HRZone[] {
  return frielRunZones(lthr).map((z) => ({ name: z.name, label: z.label, min: z.min, max: z.max }));
}

/** Karvonen %HRR model (uses Max HR + Resting HR). */
export function karvonenZones(maxHR: number, restingHR: number): HRZone[] {
  const hrr = maxHR - restingHR;
  const z = (pct: number) => Math.round(restingHR + hrr * pct);
  return [
    { name: 'Z1', label: 'Recovery',  min: 0,       max: z(0.60) },
    { name: 'Z2', label: 'Aerobic',   min: z(0.60), max: z(0.70) },
    { name: 'Z3', label: 'Tempo',     min: z(0.70), max: z(0.80) },
    { name: 'Z4', label: 'Threshold', min: z(0.80), max: z(0.90) },
    { name: 'Z5', label: 'VO2max',    min: z(0.90), max: maxHR },
  ];
}

/** Hybrid: prefer Friel (LTHR) when available, fall back to Karvonen (HRR) if resting HR known. */
export function hrZones(lthr: number | null, maxHR: number | null, restingHR: number | null): HRZone[] | null {
  if (lthr && lthr > 100) return frielZones(lthr);
  if (maxHR && maxHR > 100 && restingHR && restingHR > 30) return karvonenZones(maxHR, restingHR);
  return null;
}

export function hrZoneModel(lthr: number | null, maxHR: number | null, restingHR: number | null): string {
  if (lthr && lthr > 100) return 'Friel %LTHR';
  if (maxHR && maxHR > 100 && restingHR && restingHR > 30) return 'Karvonen %HRR';
  if (maxHR && maxHR > 100) return 'needs Resting HR';
  return '';
}
