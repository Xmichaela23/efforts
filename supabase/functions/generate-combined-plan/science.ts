// generate-combined-plan/science.ts
//
// All training science constants.
// Sources: Friel "Triathlete's Training Bible" 5e, Fitzgerald & Warden "80/20 Triathlon",
// Seiler 2010, Hickson 1980, Couzens ramp rate tables.

import type { Phase, Sport, Intensity, Priority } from './types.ts';

// ── §1.1  TSS impact multipliers ────────────────────────────────────────────
// Normalize systemic recovery cost across sports.
// Swim lowest (non-weight-bearing), run highest (eccentric load).
export const SPORT_IMPACT_MULTIPLIER: Record<Sport, number> = {
  run:      1.3,
  bike:     1.0,
  swim:     0.8,
  strength: 1.0, // treated as bike-equivalent systemic stress
  race:     1.0, // multi-sport / tri event day (bike-like systemic cost)
};

// Strength TSS counts at 50% toward the weekly budget (§12.2 open question default)
export const STRENGTH_BUDGET_FRACTION = 0.5;

// ── §1.2  TSS budget ranges by phase ────────────────────────────────────────
// TSS is in RAW units (not weighted). Weighted total used only for ramp rate.
export const PHASE_TSS_RANGES: Record<Phase, { min: number; max: number }> = {
  base:          { min: 250, max: 450 },
  build:         { min: 400, max: 600 },
  race_specific: { min: 450, max: 700 },
  taper:         { min: 200, max: 400 },
  recovery:      { min: 80,  max: 200 },
};

// TSS/hour by sport × intensity class.
// Derived from TSS = hours × IF² × 100:
//   Z2 IF ≈ 0.72 → 52/hr,  Z3 IF ≈ 0.87 → 76/hr,  Z4 IF ≈ 1.0 → 100/hr
export const TSS_PER_HOUR: Record<Sport, Record<Intensity, number>> = {
  run:      { EASY: 55, MODERATE: 75, HARD: 100 },
  bike:     { EASY: 50, MODERATE: 70, HARD: 100 },
  swim:     { EASY: 35, MODERATE: 55, HARD:  75 },
  strength: { EASY: 40, MODERATE: 55, HARD:  75 },
  race:     { EASY: 50, MODERATE: 70, HARD: 100 },
};

export function estimateSessionTSS(
  sport: Sport,
  intensity: Intensity,
  durationMin: number,
): number {
  const rate = TSS_PER_HOUR[sport][intensity] / 60; // per minute
  const raw = durationMin * rate;
  const adjusted = sport === 'strength' ? raw * STRENGTH_BUDGET_FRACTION : raw;
  return Math.round(adjusted);
}

export function weightedTSS(sport: Sport, rawTSS: number): number {
  return rawTSS * SPORT_IMPACT_MULTIPLIER[sport];
}

// ── §1.2 (continued)  Scale weekly TSS budget from athlete CTL + hours ───────
// Called by week-builder and validator.
export function scaledWeeklyTSS(
  phase: Phase,
  currentCTL: number,
  weeklyHours: number,
  tssMultiplier: number,
): number {
  const { min, max } = PHASE_TSS_RANGES[phase];
  const ctlFactor  = Math.min(1.5, Math.max(0.5, currentCTL / 60));
  const hourFactor = Math.min(1.5, Math.max(0.5, weeklyHours / 10));
  const mid = (min + max) / 2;
  return Math.round(Math.max(min, Math.min(max, mid * ctlFactor * hourFactor)) * tssMultiplier);
}

// ── §1.3  CTL ramp rate thresholds ──────────────────────────────────────────
// Returns { low, moderate } CTL/week ceilings for the given current CTL.
export function rampThresholds(currentCTL: number): { low: number; moderate: number } {
  if (currentCTL <= 45)  return { low: 4, moderate: 6 };
  if (currentCTL <= 70)  return { low: 5, moderate: 7 };
  if (currentCTL <= 100) return { low: 6, moderate: 8 };
  return { low: 7, moderate: 10 };
}

// Weekly TSS required to increase CTL by N points in 7 days.
// CTL = 42-day EMA of daily TSS.  Alpha = 1 - exp(-1/42).
// CTL_new = CTL_old + alpha * (avg_daily_tss - CTL_old)
// Solving for avg_daily_tss: avg_daily = CTL_old + delta / alpha
const ALPHA_CTL = 1 - Math.exp(-1 / 42);
export function weeklyTSSForCTLRamp(currentCTL: number, targetWeeklyRamp: number): number {
  const dailyDelta = targetWeeklyRamp / 7;
  const requiredDailyTSS = currentCTL + dailyDelta / ALPHA_CTL;
  return Math.round(requiredDailyTSS * 7);
}

// Compute projected new CTL after a week with this total weighted TSS.
export function projectedCTL(currentCTL: number, weeklyWeightedTSS: number): number {
  const dailyTSS = weeklyWeightedTSS / 7;
  return currentCTL + ALPHA_CTL * (dailyTSS - currentCTL);
}

// ── §2.1  Sport distribution by triathlon distance ───────────────────────────
// Values are midpoints; limiter_sport shift applied separately.
export const TRI_SPORT_DIST: Record<string, Record<Sport, number>> = {
  sprint:  { swim: 0.22, bike: 0.38, run: 0.32, strength: 0.08, race: 0 },
  olympic: { swim: 0.22, bike: 0.42, run: 0.30, strength: 0.06, race: 0 },
  '70.3':  { swim: 0.18, bike: 0.50, run: 0.26, strength: 0.06, race: 0 },
  ironman: { swim: 0.13, bike: 0.55, run: 0.26, strength: 0.06, race: 0 },
};

/** Wire-format tri distances + aliases; used for long-ride ceiling vs expected bike leg duration. */
export type TriRaceDistance = 'sprint' | 'olympic' | '70.3' | 'ironman' | 'half' | 'full' | string;

/** Conservative expected bike leg duration (hours) when no per-athlete projection is wired. */
export function expectedBikeDurationHours(distance: TriRaceDistance): number {
  switch (distance) {
    case 'sprint': return 1.0;
    case 'olympic': return 1.5;
    case '70.3':
    case 'half': return 3.0;
    case 'ironman':
    case 'full': return 6.0;
    default: return 3.0;
  }
}

/** Brick run length (mi) from race run distance and phase; distance-first for off-bike work. */
export function brickRunTargetMiles(distance: TriRaceDistance, phase: string): number {
  const raceRunMiles: Record<string, number> = {
    sprint: 3.1,
    olympic: 6.2,
    '70.3': 13.1,
    half: 13.1,
    ironman: 26.2,
    full: 26.2,
    half_marathon: 13.1,
    marathon: 26.2,
  };
  const raceRun = raceRunMiles[distance] ?? 13.1;

  const p = String(phase || '').toLowerCase();
  const multiplier = (() => {
    switch (p) {
      case 'base': return 0.20;
      case 'build': return 0.30;
      case 'peak':
      case 'race_specific': return 0.42;
      case 'taper': return 0.22;
      default: return 0.20;
    }
  })();

  const raw = raceRun * multiplier;
  return Math.min(8, Math.max(1.5, Math.round(raw * 2) / 2));
}

/** Minimum long-run mileage by race distance and calendar phase (after TSS-derived miles). */
export function longRunFloorMiles(distance: TriRaceDistance, phase: Phase): number {
  const peakTarget: Record<string, number> = {
    sprint: 4.0,
    olympic: 7.0,
    '70.3': 11.0,
    half: 11.0,
    ironman: 18.0,
    full: 18.0,
    half_marathon: 11.0,
    marathon: 18.0,
  };
  const peak = peakTarget[distance] ?? 11.0;

  const multiplier = (() => {
    switch (phase) {
      case 'base': return 0.50;
      case 'build': return 0.75;
      case 'race_specific': return 1.00;
      // Taper long-run floor: keep pre–A-race Sunday run conservative (e.g. 70.3 ≈ 5 mi, not 6+).
      case 'taper': return 0.45;
      case 'recovery': return 0.40;
      default: return 0.50;
    }
  })();

  return Math.round(peak * multiplier * 2) / 2;
}

// For a run-only event, all non-strength budget goes to run.
export const RUN_SPORT_DIST: Record<string, Record<Sport, number>> = {
  marathon:      { run: 0.82, bike: 0.00, swim: 0.00, strength: 0.10, race: 0 },
  half_marathon: { run: 0.84, bike: 0.00, swim: 0.00, strength: 0.10, race: 0 },
  '10k':         { run: 0.86, bike: 0.00, swim: 0.00, strength: 0.10, race: 0 },
  '5k':          { run: 0.86, bike: 0.00, swim: 0.00, strength: 0.10, race: 0 },
};

// Blended distribution for multi-sport weeks (tri + run event concurrent).
// The tri distribution IS the combined plan distribution since it already
// includes run. Limiter shift applied on top.
export function getBaseDistribution(
  primaryGoalSport: string,
  primaryDistance: string,
  limiterSport?: Sport,
): Record<Sport, number> {
  let dist: Record<Sport, number>;

  const isTri = ['triathlon', 'tri'].includes(primaryGoalSport.toLowerCase());
  if (isTri) {
    dist = { ...(TRI_SPORT_DIST[primaryDistance] ?? TRI_SPORT_DIST['70.3']) };
  } else {
    dist = { ...(RUN_SPORT_DIST[primaryDistance] ?? RUN_SPORT_DIST['marathon']) };
  }

  // §2.1 limiter shift: increase limiter sport by 7%, reduce others proportionally
  if (limiterSport && limiterSport in dist) {
    const shift = 0.07;
    const current = dist[limiterSport] ?? 0;
    const newVal = Math.min(0.65, current + shift);
    const delta = newVal - current;
    dist[limiterSport] = newVal;
    const others = (Object.keys(dist) as Sport[]).filter(s => s !== limiterSport);
    others.forEach(s => { dist[s] = Math.max(0, (dist[s] ?? 0) - delta / others.length); });
  }

  return dist;
}

// §2.2  Maintenance volume floors (min sessions/week in non-recovery weeks)
export const MAINTENANCE_FLOORS: Partial<Record<Sport, { sessions: number; pct: number }>> = {
  swim:     { sessions: 1, pct: 0.08 },
  bike:     { sessions: 1, pct: 0.12 },
  run:      { sessions: 2, pct: 0.15 },
  strength: { sessions: 1, pct: 0.03 },
};

// ── §3.3  Zone distribution by phase ────────────────────────────────────────
// Fraction of total training time at each zone band.
export const PHASE_ZONE_DIST: Record<Phase, { low: number; tempo: number; high: number }> = {
  base:          { low: 0.87, tempo: 0.08, high: 0.05 },
  build:         { low: 0.80, tempo: 0.10, high: 0.10 },
  race_specific: { low: 0.77, tempo: 0.13, high: 0.10 },
  taper:         { low: 0.83, tempo: 0.07, high: 0.10 },
  recovery:      { low: 0.95, tempo: 0.05, high: 0.00 },
};

// ── §5.2  Brick frequency by phase ──────────────────────────────────────────
export const BRICKS_PER_WEEK: Record<Phase, number> = {
  base:          0,
  build:         1,
  race_specific: 2,
  taper:         1,
  recovery:      0,
};

// ── §6.1  Taper duration in weeks (distance × priority) ─────────────────────
const TAPER_WEEKS_BY_PRIORITY: Record<Priority, Record<string, number>> = {
  A: {
    sprint: 1,
    olympic: 1,
    '70.3': 2,
    half: 2,
    ironman: 3,
    full: 3,
    marathon: 3,
    half_marathon: 2,
    '10k': 1,
    '5k': 1,
  },
  B: {
    sprint: 1,
    olympic: 1,
    '70.3': 1,
    half: 1,
    ironman: 2,
    full: 2,
    marathon: 2,
    half_marathon: 1,
    '10k': 1,
    '5k': 1,
  },
  C: {
    sprint: 1,
    olympic: 1,
    '70.3': 1,
    half: 1,
    ironman: 1,
    full: 1,
    marathon: 1,
    half_marathon: 1,
    '10k': 1,
    '5k': 1,
  },
};

/** Taper length in weeks: B/C races get shorter tapers than A; 70.3 A uses 2w (not 3). */
export function taperWeeks(distance: string, priority: Priority | string): number {
  const d0 = String(distance || '').toLowerCase();
  const key = d0 === 'half_marathon' ? 'half' : d0;
  const pri = String(priority || 'A').toUpperCase();
  const tier = (pri === 'B' || pri === 'C' ? pri : 'A') as Priority;
  const byDist = TAPER_WEEKS_BY_PRIORITY[tier] ?? TAPER_WEEKS_BY_PRIORITY.A;
  if (typeof byDist[key] === 'number') return byDist[key];
  return 2;
}

// §6.4  Post-race mandatory recovery in days (distance × priority of the race that just finished)
const RECOVERY_DAYS_BY_PRIORITY: Record<Priority, Record<string, number>> = {
  A: {
    sprint: 5,
    olympic: 7,
    '70.3': 14,
    half: 14,
    ironman: 21,
    full: 21,
    marathon: 21,
    half_marathon: 14,
    '10k': 7,
    '5k': 5,
  },
  B: {
    sprint: 3,
    olympic: 5,
    '70.3': 7,
    half: 7,
    ironman: 14,
    full: 14,
    marathon: 14,
    half_marathon: 7,
    '10k': 5,
    '5k': 3,
  },
  C: {
    sprint: 3,
    olympic: 4,
    '70.3': 5,
    half: 5,
    ironman: 7,
    full: 7,
    marathon: 7,
    half_marathon: 5,
    '10k': 4,
    '5k': 3,
  },
};

/** Calendar days of easy-only / reduced load after a race; scales with priority (B/C shorter than A). */
export function recoveryDaysPostRace(distance: string, priority: Priority | string): number {
  const d0 = String(distance || '').toLowerCase();
  const key = d0 === 'half_marathon' ? 'half' : d0;
  const pri = String(priority || 'A').toUpperCase();
  const tier = (pri === 'B' || pri === 'C' ? pri : 'A') as Priority;
  const byDist = RECOVERY_DAYS_BY_PRIORITY[tier] ?? RECOVERY_DAYS_BY_PRIORITY.A;
  if (typeof byDist[key] === 'number') return byDist[key];
  return 7;
}

/** Whole weeks allocated to recovery block (min 1). */
export function recoveryWeeksPostRace(distance: string, priority: Priority | string): number {
  return Math.max(1, Math.ceil(recoveryDaysPostRace(distance, priority) / 7));
}

// ── §7.2  Mesocycle loading pattern ─────────────────────────────────────────
// Returns the TSS multiplier for week-within-block (1-indexed).
export function blockWeekMultiplier(weekInBlock: number, pattern: '3:1' | '2:1'): number {
  if (pattern === '3:1') {
    return [1.00, 1.08, 1.15, 0.65][weekInBlock - 1] ?? 1.00;
  } else {
    return [1.00, 1.10, 0.65][weekInBlock - 1] ?? 1.00;
  }
}

// ── §4.2  Session intensity classification  ──────────────────────────────────
// Maps zone targets to intensity class.
export function classifyIntensity(zoneTargets: string): Intensity {
  const z = zoneTargets.toLowerCase();
  if (/z4|z5|vo2|threshold|intervals|tempo\s*(>|longer)/.test(z)) return 'HARD';
  if (/z3|tempo|moderate|sweet.?spot/.test(z)) return 'MODERATE';
  return 'EASY';
}

// ── §4.3  Sequencing constraint check ───────────────────────────────────────
// Returns true if placing `next` intensity on the day after `prev` is allowed.
export function hardEasyOk(prev: Intensity, next: Intensity): boolean {
  if (prev === 'HARD' && next === 'HARD') return false;
  return true;
}

// Days of the week ordered Mon-Sun (index 0-6)
export const DAYS_OF_WEEK = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'] as const;
export type DayOfWeek = typeof DAYS_OF_WEEK[number];

export const DAY_INDEX: Record<string, number> = Object.fromEntries(
  DAYS_OF_WEEK.map((d, i) => [d, i])
);
