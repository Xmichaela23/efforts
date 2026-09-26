// Shared endurance model — HR zones. Friel %LTHR, five zones, delegated to the ONE model (`src/lib/friel-zones.ts`).
// ⛔ ONLY `frielZones` IS LEFT (2026-09-26, Michael: "go"): the Karvonen table and the Friel-or-Karvonen picker
// (`hrZones`) had two readers — the run plan's heart-rate text and the zone arrays `save-baselines` stored — and both
// now read the zone table Baselines prints (`endurance/display-zones.ts` `heartRateZoneSet`); `hrZoneModel` had none.
// `frielZones` still gives `materialize-plan` the easy step's Zone 2 range.

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
