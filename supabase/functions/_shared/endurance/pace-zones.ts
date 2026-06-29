// Shared endurance model — pace zones. LIFTED FAITHFULLY from generate-run-plan/effort-score.ts
// (PACE_TABLE + the getPacesFromScore interpolation). Two-copy-with-parity-lock vs effort-score
// (which has 6 importers across deployed functions — re-homing is deferred to avoid that blast radius).
// Daniels VDOT pace zones. The `race` pace (marathon-time ÷ 26.2) is intentionally OMITTED — it needs
// the 55-row VDOT time table and is a race *target*, not a training *zone*. See SPEC-shared-endurance-model.md.

/** sec/mi training paces. base=easy(Z2), steady=threshold(Z4), power=interval, speed=VO2max(Z5). */
export interface ZonePaces {
  base: number;
  steady: number;
  power: number;
  speed: number;
}

const PACE_TABLE: { vdot: number; paces: ZonePaces }[] = [
  { vdot: 30, paces: { base: 744, steady: 622, power: 568, speed: 534 } },
  { vdot: 32, paces: { base: 708, steady: 592, power: 540, speed: 508 } },
  { vdot: 34, paces: { base: 672, steady: 564, power: 516, speed: 484 } },
  { vdot: 36, paces: { base: 642, steady: 538, power: 492, speed: 462 } },
  { vdot: 38, paces: { base: 612, steady: 514, power: 470, speed: 442 } },
  { vdot: 40, paces: { base: 585, steady: 491, power: 449, speed: 422 } },
  { vdot: 42, paces: { base: 560, steady: 470, power: 430, speed: 404 } },
  { vdot: 44, paces: { base: 536, steady: 450, power: 412, speed: 387 } },
  { vdot: 45, paces: { base: 525, steady: 441, power: 403, speed: 379 } },
  { vdot: 46, paces: { base: 514, steady: 432, power: 395, speed: 371 } },
  { vdot: 48, paces: { base: 494, steady: 415, power: 379, speed: 357 } },
  { vdot: 50, paces: { base: 474, steady: 399, power: 365, speed: 343 } },
  { vdot: 52, paces: { base: 456, steady: 383, power: 351, speed: 330 } },
  { vdot: 54, paces: { base: 439, steady: 369, power: 338, speed: 318 } },
  { vdot: 56, paces: { base: 423, steady: 355, power: 325, speed: 306 } },
  { vdot: 58, paces: { base: 408, steady: 343, power: 314, speed: 295 } },
  { vdot: 60, paces: { base: 394, steady: 331, power: 303, speed: 285 } },
  { vdot: 65, paces: { base: 362, steady: 304, power: 278, speed: 262 } },
  { vdot: 70, paces: { base: 334, steady: 280, power: 256, speed: 241 } },
  { vdot: 75, paces: { base: 309, steady: 260, power: 238, speed: 224 } },
  { vdot: 80, paces: { base: 287, steady: 241, power: 221, speed: 208 } },
];

/**
 * VDOT/effort-score → training-zone paces. Replicates `getPacesFromScore`'s interpolation exactly for
 * base/steady/power/speed (the deterministic-from-PACE_TABLE zone paces). Parity-locked to effort-score.
 */
export function paceZonesFromVdot(score: number): ZonePaces {
  let lower = PACE_TABLE[0];
  let upper = PACE_TABLE[PACE_TABLE.length - 1];
  for (let i = 0; i < PACE_TABLE.length - 1; i++) {
    const current = PACE_TABLE[i];
    const next = PACE_TABLE[i + 1];
    if (score >= current.vdot && score <= next.vdot) {
      lower = current;
      upper = next;
      break;
    }
  }
  if (score <= lower.vdot) return { ...lower.paces };
  if (score >= upper.vdot) return { ...upper.paces };
  const fraction = (score - lower.vdot) / (upper.vdot - lower.vdot);
  return {
    base: Math.round(lower.paces.base - fraction * (lower.paces.base - upper.paces.base)),
    steady: Math.round(lower.paces.steady - fraction * (lower.paces.steady - upper.paces.steady)),
    power: Math.round(lower.paces.power - fraction * (lower.paces.power - upper.paces.power)),
    speed: Math.round(lower.paces.speed - fraction * (lower.paces.speed - upper.paces.speed)),
  };
}
