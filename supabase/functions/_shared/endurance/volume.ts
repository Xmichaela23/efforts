// Shared endurance model — long-run volume. LIFTED FAITHFULLY from generate-combined-plan/science.ts
// (longRunMilesForWeek / longRunFloorMiles / longRunPeakTarget / LONG_RUN_RAMP_ENDPOINTS / helpers).
// RUN-PROTOCOL §4.5 within-phase lerp ramp + per-distance peaks. Two-copy-with-parity-lock vs combined.
//
// ONE INTENTIONAL DIFFERENCE from the source: `longRunFloorMiles` adds a `retest` case (rested-terminal
// floor = taper level 0.45), fixing the scout's D2 hole where combined falls through to the 0.75 default.
// Asserted SEPARATELY in the parity test as the documented fix, not a parity match.
// See SPEC-shared-endurance-model.md + docs/STRENGTH-SCOUT-REPORT.md (D2).

/** Combined-engine phase vocabulary (the volume model keys off these strings, faithfully). */
export type PhaseKey =
  | 'base' | 'build' | 'race_specific' | 'taper' | 'recovery' | 'rebuild' | 'retest';

/** Distance-keyed long-run peak target (mi). Covers tri AND running distances (half/marathon). */
export function longRunPeakTarget(distance: string): number {
  const peakTarget: Record<string, number> = {
    sprint: 4.0, olympic: 7.0,
    '70.3': 13.0, half: 13.0, half_marathon: 13.0,
    ironman: 18.0, full: 18.0, marathon: 18.0,
  };
  return peakTarget[distance] ?? 13.0;
}

const LONG_RUN_RAMP_ENDPOINTS: Record<'base' | 'build' | 'race_specific', { start: number; peak: number }> = {
  base:          { start: 0.65, peak: 0.75 },
  build:         { start: 0.75, peak: 0.85 },
  race_specific: { start: 0.85, peak: 1.00 },
};

/** RUN-PROTOCOL §4 ramp-window length per phase (weeks). */
export function rampWeeksForPhase(phase: string): number {
  return String(phase ?? '').toLowerCase() === 'base' ? 6 : 4;
}

/** 1-based week index → [0,1] progress within phase ramp. */
function runPhaseProgress(weekInPhase: number, rampWeeks: number): number {
  const w = Math.max(1, Math.round(weekInPhase));
  if (rampWeeks <= 1) return 1;
  const t = (w - 1) / (rampWeeks - 1);
  if (t <= 0) return 0;
  if (t >= 1) return 1;
  return t;
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function roundHalfMile(mi: number): number {
  return Math.round(mi * 2) / 2;
}

/** Minimum long-run mileage by race distance and phase. */
export function longRunFloorMiles(distance: string, phase: PhaseKey | string): number {
  const peak = longRunPeakTarget(distance);
  const multiplier = (() => {
    switch (phase) {
      case 'base': return 0.75;
      case 'build': return 0.85;
      case 'race_specific': return 1.00;
      case 'rebuild': return 0.85;
      case 'taper': return 0.45;
      case 'recovery': return 0.40;
      // FIX (shared-endurance, scout D2): combined has no `retest` case → falls to 0.75 (build-ish).
      // A retest is a rested hold-and-rebenchmark terminal → taper-level floor.
      case 'retest': return 0.45;
      default: return 0.75;
    }
  })();
  return Math.round(peak * multiplier * 2) / 2;
}

/**
 * Long-run within-phase RAMP (RUN-PROTOCOL §4.5). base/build/race_specific lerp from `START × peak` to
 * `PEAK × peak` across `rampWeeks`; other phases delegate to `longRunFloorMiles`. `loadThrottle < 1.0`
 * (rebuild mode, D-031) multiplies the lerp and floors at peak-of-base. Faithful to combined.
 */
export function longRunMilesForWeek(
  distance: string,
  phase: PhaseKey | string,
  weekInPhase: number,
  rampWeeks: number,
  loadThrottle: number = 1.0,
): number {
  const phaseKey = String(phase ?? '').toLowerCase() as 'base' | 'build' | 'race_specific';
  const endpoints = LONG_RUN_RAMP_ENDPOINTS[phaseKey];
  if (!endpoints) return longRunFloorMiles(distance, phase);
  const peak = longRunPeakTarget(distance);
  const start = peak * endpoints.start;
  const target = peak * endpoints.peak;
  const t = runPhaseProgress(weekInPhase, rampWeeks);
  const lerped = lerp(start, target, t);
  if (loadThrottle >= 1.0) return roundHalfMile(lerped);
  const floor = longRunFloorMiles(distance, 'base');
  return Math.max(floor, roundHalfMile(lerped * loadThrottle));
}
