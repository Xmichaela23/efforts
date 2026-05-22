/**
 * Swim protocol v2.1 helpers — Full IM over-distance, distance-specific kick IF/TSS & gear.
 * Consumed by week-builder / session-factory (deterministic; no I/O).
 */

import type { Phase } from './types.ts';
import type { SwimDistanceKey } from '../_shared/swim-program-templates.ts';
import { parseSwimThresholdPaceSecPer100Yd } from './swim-tri-safety.ts';

export type SwimTrainingFitness = 'beginner' | 'intermediate' | 'advanced';

const OD_VOLUME_YD = 4600;

function normalizePhaseKey(phase: string): Phase {
  const p = String(phase ?? '')
    .trim()
    .toLowerCase()
    .replace(/-/g, '_');
  if (p === 'race_specific' || p === 'racespecific') return 'race_specific';
  if (p === 'taper' || p === 'race_week') return 'taper';
  if (p === 'recovery' || p === 'deload') return 'recovery';
  if (p === 'rebuild' || p === 'post_race_rebuild') return 'rebuild';
  if (p === 'base' || p === 'general') return 'base';
  if (p === 'build' || p === 'building') return 'build';
  return 'build';
}

export function normalizeSwimTrainingFitness(raw: string | undefined | null): SwimTrainingFitness {
  const s = String(raw ?? '').trim().toLowerCase();
  if (s === 'beginner' || s === 'intermediate' || s === 'advanced') return s;
  return 'intermediate';
}

/** Full Ironman advanced over-distance window → bump endurance yards (fixed protocol ceiling). */
export function applyOverdistanceIfApplicable(
  volumeYd: number,
  opts: {
    raceDistance: SwimDistanceKey;
    athleteFitness: SwimTrainingFitness;
    phase: string;
    weekInPhase: number;
    sessionType: 'endurance' | string;
  },
): number {
  if (opts.sessionType !== 'endurance') return volumeYd;
  if (opts.raceDistance !== 'full' || opts.athleteFitness !== 'advanced') return volumeYd;

  const ph = normalizePhaseKey(opts.phase);
  const useOverdistance =
    (ph === 'build' && opts.weekInPhase >= 4) || (ph === 'race_specific' && opts.weekInPhase <= 2);

  if (!useOverdistance) return volumeYd;
  /** Revised protocol (v2.1): fixed ceiling — replaces planned yards (may down-shift high templates). */
  return OD_VOLUME_YD;
}

/** True when Full IM advanced endurance slot may use fixed 4600 yd over-distance (week-builder). */
export function enduranceOverdistanceWindowActive(opts: {
  raceDistance: SwimDistanceKey;
  athleteFitness: SwimTrainingFitness;
  phase: string;
  weekInPhase: number;
}): boolean {
  if (opts.raceDistance !== 'full' || opts.athleteFitness !== 'advanced') return false;
  const ph = normalizePhaseKey(opts.phase);
  return (ph === 'build' && opts.weekInPhase >= 4) || (ph === 'race_specific' && opts.weekInPhase <= 2);
}

export function kickFocusIntensityFactor(raceDistance: SwimDistanceKey): number {
  return raceDistance === 'sprint' || raceDistance === 'olympic' ? 0.75 : 0.60;
}

/**
 * Protocol TSS: duration_hours × IF² × 100 (swim sport multiplier applied separately via weighted_tss).
 */
export function calculateSwimTss(
  sessionKind: 'kick_focused' | 'endurance' | 'pull_focused',
  durationMin: number,
  raceDistance: SwimDistanceKey,
): number {
  const hours = durationMin / 60;
  if (sessionKind === 'kick_focused') {
    const IF = kickFocusIntensityFactor(raceDistance);
    return Math.round(hours * IF * IF * 100);
  }
  if (sessionKind === 'pull_focused') {
    const IF = 0.8;
    return Math.round(hours * IF * IF * 100);
  }
  const IF = 0.70;
  return Math.round(hours * IF * IF * 100);
}

/** Canonical gear chips aligned with {@link swimGearNormalized} (`kickboard`, `fins`). */
export function kickFocusRequiredGear(raceDistance: SwimDistanceKey): string[] {
  return raceDistance === 'sprint' || raceDistance === 'olympic' ? ['kickboard'] : ['fins'];
}

/** Matches Training Baselines / {@link swimGearNormalized} (`pull buoy`). */
export function pullFocusRequiredGear(): string[] {
  return ['pull buoy'];
}

export function checkSwimEquipmentRequirements(
  sessionTypes: string[],
  athleteGearLower: Set<string>,
  raceDistance: SwimDistanceKey,
): { missingRequired: string[] } {
  const missing = new Set<string>();
  for (const st of sessionTypes) {
    if (st === 'kick_focused') {
      for (const req of kickFocusRequiredGear(raceDistance)) {
        if (!athleteGearLower.has(req)) missing.add(req);
      }
    }
    if (st === 'pull_focused') {
      for (const req of pullFocusRequiredGear()) {
        if (!athleteGearLower.has(req)) missing.add(req);
      }
    }
  }
  return { missingRequired: [...missing] };
}

/**
 * Schedule pairing hints for kick-focused swims (spec reference).
 * Long-course fins kick does not block long_run at the matrix layer — see `arePlannedSessionsCompatible` override.
 */
export function getSwimBlockingRulesKickFocus(raceDistance: SwimDistanceKey): Array<'long_run' | 'lower_body_strength'> {
  if (raceDistance === '70.3' || raceDistance === 'full') return ['lower_body_strength'];
  return ['long_run', 'lower_body_strength'];
}

/** CSS threshold pace for swim duration estimates — default 105 s/100 yd when unknown. */
export function resolveCssSecPer100Yd(swimThresholdPace: string | undefined | null): number {
  const p = parseSwimThresholdPaceSecPer100Yd(swimThresholdPace);
  if (p != null && Number.isFinite(p) && p > 40 && p < 600) return p;
  return 105;
}

/**
 * SWIM-PROTOCOL §7.5 — has the athlete supplied a usable CSS / swim threshold pace?
 *
 * Returns `true` only when `parseSwimThresholdPaceSecPer100Yd` produces a value in
 * the same valid window `resolveCssSecPer100Yd` accepts (40 < sec < 600 s/100yd).
 * Callers use this to decide whether session copy should annotate numeric pace
 * targets vs surface the §7.5 RPE fallback cue ("swim at a pace where you can
 * hold a short conversation but feel like you're working").
 *
 * Distinct from `resolveCssSecPer100Yd`: that helper SILENTLY returns 105 s/100yd
 * when CSS is missing/invalid (so duration math always works); this helper exposes
 * the missing state so session copy can speak honestly to the athlete.
 */
export function hasValidSwimThresholdPace(swimThresholdPace: string | undefined | null): boolean {
  const p = parseSwimThresholdPaceSecPer100Yd(swimThresholdPace);
  return p != null && Number.isFinite(p) && p > 40 && p < 600;
}
