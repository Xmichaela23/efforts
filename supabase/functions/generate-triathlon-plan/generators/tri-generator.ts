// Triathlon Plan Generator
//
// Philosophy: Periodized multi-sport training aligned with run plan patterns.
// - Base → Build → Race-Specific → Taper phase structure
// - Brick sessions introduced in Build, peak in Race-Specific phase
// - Three-discipline weekly load budget seeded from athlete current state
// - Existing materialize-plan bike_ / swim_ / run token vocabulary
// - Session types use the same 'run' | 'bike' | 'swim' type field as workouts table

import {
  TriGeneratorParams,
  TriSession,
  TriTrainingPlan,
  TriPhase,
  TriPhaseStructure,
  TriWeeklySummary,
  TRI_VOLUME,
  TriDistance,
  type TrainingIntent,
} from '../types.ts';

import { pickSwimDrillTokens, swimDrillYardsFromToken } from '../../../../src/lib/plan-tokens/swim-drill-tokens.ts';

import { triathlonProtocol } from '../../shared/strength-system/protocols/triathlon.ts';
import { triathlonPerformanceProtocol } from '../../shared/strength-system/protocols/triathlon_performance.ts';
import type { ProtocolContext } from '../../shared/strength-system/protocols/types.ts';

// ============================================================================
// SWIM VOLUME TABLES (yards/week at peak by distance × fitness)
// ============================================================================

const SWIM_YARDS_PEAK: Record<TriDistance, Record<string, number>> = {
  sprint:  { beginner: 5000,  intermediate: 8000,  advanced: 12000 },
  olympic: { beginner: 8000,  intermediate: 12000, advanced: 16000 },
  '70.3':  { beginner: 10000, intermediate: 15000, advanced: 20000 },
  ironman: { beginner: 14000, intermediate: 20000, advanced: 26000 },
};

const SWIM_YARDS_START: Record<TriDistance, Record<string, number>> = {
  sprint:  { beginner: 2500,  intermediate: 4000,  advanced: 6000  },
  olympic: { beginner: 4000,  intermediate: 6000,  advanced: 8000  },
  '70.3':  { beginner: 5000,  intermediate: 7500,  advanced: 10000 },
  ironman: { beginner: 7000,  intermediate: 10000, advanced: 13000 },
};

// ============================================================================
// LONG RUN PROGRESSIONS (miles) — mirrors sustainable generator tables
// ============================================================================

const LONG_RUN_PROGRESSION: Record<TriDistance, Record<string, number[]>> = {
  sprint: {
    beginner:     [3, 4, 4, 3, 4, 5, 5, 4, 5, 6, 6, 4],
    intermediate: [4, 5, 5, 4, 5, 6, 6, 5, 6, 7, 7, 5],
    advanced:     [5, 6, 7, 5, 7, 8, 8, 6, 8, 9, 9, 7],
  },
  olympic: {
    beginner:     [4, 5, 5, 4, 5, 6, 7, 5, 6, 7, 8, 6, 8, 5, 3],
    intermediate: [5, 6, 7, 5, 7, 8, 9, 7, 8, 9, 10, 7, 9, 6, 4],
    advanced:     [6, 7, 8, 6, 8, 9, 10, 8, 10, 11, 12, 8, 10, 7, 5],
  },
  '70.3': {
    beginner:     [5, 6, 6, 5, 6, 7, 8, 6, 7, 8, 9, 7, 9, 10, 7, 5, 3],
    intermediate: [6, 7, 8, 6, 8, 9, 10, 7, 9, 10, 11, 8, 11, 12, 9, 6, 4],
    advanced:     [8, 9, 10, 7, 9, 10, 11, 8, 11, 12, 13, 9, 12, 14, 10, 7, 5],
  },
  ironman: {
    beginner:     [6, 7, 7, 6, 7, 8, 9, 7, 9, 10, 11, 8, 11, 13, 15, 11, 14, 16, 12, 8, 5, 3],
    intermediate: [8, 9, 10, 8, 10, 11, 12, 9, 11, 13, 14, 10, 13, 15, 17, 12, 16, 18, 14, 10, 6, 4],
    advanced:     [10, 11, 12, 9, 12, 13, 14, 10, 14, 15, 16, 11, 15, 17, 19, 13, 17, 20, 15, 11, 7, 5],
  },
};

// Full post-race transition week 1 — standalone tri parity with combined `recoveryRebuildWeek1`.
const RECOVERY_REBUILD_W1_LONG_RUN_CAP_MIN = 50;
const RECOVERY_REBUILD_W1_LONG_RIDE_CAP_HR = 1.5;

// ============================================================================
// LONG RIDE PROGRESSIONS (hours)
// ============================================================================

const LONG_RIDE_PROGRESSION: Record<TriDistance, Record<string, number[]>> = {
  sprint: {
    beginner:     [0.75, 1.0, 1.25, 1.0, 1.25, 1.5, 1.5, 1.0, 1.5, 1.75, 1.75, 1.25],
    intermediate: [1.0,  1.25, 1.5, 1.0, 1.5, 1.75, 2.0, 1.5, 1.75, 2.0, 2.0, 1.5],
    advanced:     [1.25, 1.5, 1.75, 1.25, 1.75, 2.0, 2.25, 1.75, 2.0, 2.25, 2.5, 1.75],
  },
  olympic: {
    beginner:     [1.25, 1.5, 1.75, 1.25, 1.75, 2.0, 2.25, 1.5, 2.0, 2.25, 2.5, 1.75, 2.5, 1.5, 1.0],
    intermediate: [1.5, 1.75, 2.0, 1.5, 2.0, 2.25, 2.5, 1.75, 2.25, 2.75, 3.0, 2.0, 3.0, 1.75, 1.25],
    advanced:     [2.0, 2.25, 2.5, 1.75, 2.5, 2.75, 3.0, 2.25, 2.75, 3.0, 3.5, 2.5, 3.5, 2.0, 1.5],
  },
  '70.3': {
    beginner:     [1.75, 2.0, 2.25, 1.75, 2.25, 2.5, 2.75, 2.0, 2.75, 3.0, 3.25, 2.5, 3.25, 3.5, 2.5, 1.75, 1.25],
    intermediate: [2.5, 2.75, 3.0, 2.25, 3.0, 3.25, 3.5, 2.5, 3.5, 3.75, 4.0, 3.0, 4.0, 4.5, 3.0, 2.0, 1.5],
    advanced:     [3.0, 3.25, 3.5, 2.5, 3.5, 3.75, 4.0, 3.0, 4.0, 4.5, 5.0, 3.5, 4.75, 5.5, 3.75, 2.5, 1.75],
  },
  ironman: {
    beginner:     [2.75, 3.0, 3.25, 2.5, 3.25, 3.5, 3.75, 2.75, 3.75, 4.0, 4.25, 3.0, 4.25, 4.75, 5.25, 3.75, 4.75, 5.5, 4.0, 2.75, 1.75, 1.25],
    intermediate: [3.5, 3.75, 4.0, 3.0, 4.0, 4.25, 4.5, 3.25, 4.5, 5.0, 5.5, 4.0, 5.5, 6.0, 6.5, 4.5, 6.0, 7.0, 5.0, 3.5, 2.25, 1.5],
    advanced:     [4.5, 4.75, 5.0, 3.5, 5.0, 5.25, 5.5, 4.0, 5.5, 6.0, 6.5, 4.5, 6.5, 7.0, 7.5, 5.0, 7.0, 8.5, 5.75, 4.0, 2.5, 1.75],
  },
};

// ============================================================================
// MAIN GENERATOR CLASS
// ============================================================================

export class TriathlonGenerator {
  protected params: TriGeneratorParams;

  constructor(params: TriGeneratorParams) {
    this.params = params;
  }

  generatePlan(): TriTrainingPlan {
    const phaseStructure = this.determinePhaseStructure();
    const sessions_by_week: Record<string, TriSession[]> = {};
    const weekly_summaries: Record<string, TriWeeklySummary> = {};

    for (let week = 1; week <= this.params.duration_weeks; week++) {
      const phase = this.getCurrentPhase(week, phaseStructure);
      const isRecovery = this.isRecoveryWeek(week, phaseStructure);
      const weekSessions = this.generateWeek(week, phase, phaseStructure, isRecovery);
      sessions_by_week[String(week)] = weekSessions;
      weekly_summaries[String(week)] = this.buildWeeklySummary(week, weekSessions, phase, isRecovery);
    }

    return {
      name: this.planName(),
      description: this.planDescription(phaseStructure),
      duration_weeks: this.params.duration_weeks,
      units: this.params.units ?? 'imperial',
      swim_unit: 'yd',
      baselines_required: {
        run:  ['easyPace'],
        bike: ['ftp'],
        swim: ['swim_pace_per_100_sec'],
      },
      weekly_summaries,
      sessions_by_week,
    };
  }

  // ============================================================================
  // PHASE STRUCTURE
  // ============================================================================

  determinePhaseStructure(): TriPhaseStructure {
    const d        = this.params.duration_weeks;
    const vol      = TRI_VOLUME[this.params.distance]?.[this.params.fitness];
    const taperW   = vol?.taperWeeks ?? 2;
    const approach = this.params.approach;

    // ── Phase ratio constants by approach ─────────────────────────────────────
    // base_first: 40% base / ~35% build / 15% RS — longer aerobic foundation,
    //             shorter race-specific (athlete needs durability, not peaking)
    // race_peak:  28% base / ~30% build / 20% RS — standard polarized structure,
    //             more race-specific time to sharpen the performance ceiling
    const basePct = approach === 'base_first' ? 0.40 : 0.28;
    const rsPct   = approach === 'base_first' ? 0.15 : 0.20;

    let phases: TriPhase[];

    if (d <= 10) {
      // Short: Base + Build + Taper (no RS block — too short)
      const base  = Math.max(2, Math.round(d * (approach === 'base_first' ? 0.45 : 0.40)));
      const build = Math.max(2, d - base - taperW);
      phases = [
        { name: 'Base',  start_week: 1,          end_week: base,           weeks_in_phase: base,  focus: approach === 'base_first' ? 'Aerobic foundation — technique and endurance before any intensity' : 'Aerobic foundation across all three disciplines', quality_density: 'low',  volume_multiplier: 0.70, bricks_per_week: 0 },
        { name: 'Build', start_week: base + 1,    end_week: base + build,   weeks_in_phase: build, focus: approach === 'base_first' ? 'Tempo quality + transition practice at Z2–Z3' : 'Discipline-specific quality + first bricks', quality_density: 'high', volume_multiplier: 1.00, bricks_per_week: 1 },
        { name: 'Taper', start_week: base+build+1,end_week: d,              weeks_in_phase: taperW,focus: 'Race sharpening and recovery',                       quality_density: 'low',  volume_multiplier: 0.55, bricks_per_week: 0 },
      ];
    } else if (d <= 16) {
      const base  = Math.max(3, Math.round(d * basePct));
      const rs    = Math.max(2, Math.round(d * rsPct));
      const build = Math.max(3, d - base - rs - taperW);
      const bStart  = base + 1;
      const rsStart = bStart + build;
      phases = [
        { name: 'Base',          start_week: 1,       end_week: base,           weeks_in_phase: base,  focus: approach === 'base_first' ? 'Extended aerobic base — build the engine before adding intensity' : 'Multi-sport aerobic base',                 quality_density: 'low',    volume_multiplier: 0.70, bricks_per_week: 0 },
        { name: 'Build',         start_week: bStart,  end_week: bStart+build-1, weeks_in_phase: build, focus: approach === 'base_first' ? 'Introduce Z3 tempo + Z2 brick transitions'                       : 'Threshold work + weekly bricks',              quality_density: 'high',   volume_multiplier: 1.00, bricks_per_week: 1 },
        { name: 'Race-Specific', start_week: rsStart, end_week: rsStart+rs-1,   weeks_in_phase: rs,    focus: approach === 'base_first' ? 'Race-pace rehearsal at comfortable effort'                        : 'Race-pace simulation + back-to-back long sessions', quality_density: 'medium', volume_multiplier: 0.95, bricks_per_week: 2 },
        { name: 'Taper',         start_week: rsStart+rs, end_week: d,           weeks_in_phase: taperW,focus: 'Race sharpening',                                       quality_density: 'low',    volume_multiplier: 0.55, bricks_per_week: 0 },
      ];
    } else {
      // Long (Ironman / 70.3)
      const base  = Math.max(4, Math.round(d * basePct));
      const rs    = Math.max(3, Math.round(d * rsPct));
      const build = Math.max(4, d - base - rs - taperW);
      const bStart  = base + 1;
      const rsStart = bStart + build;
      phases = [
        { name: 'Base',          start_week: 1,         end_week: base,           weeks_in_phase: base,  focus: approach === 'base_first' ? 'Extended aerobic base — 12+ weeks to build the durability engine' : 'Aerobic base + technique across disciplines',  quality_density: 'low',    volume_multiplier: 0.68, bricks_per_week: 0 },
        { name: 'Build',         start_week: bStart,    end_week: bStart+build-1, weeks_in_phase: build, focus: approach === 'base_first' ? 'Z3 tempo quality + Z2 brick transitions'                          : 'Volume + quality: threshold + brick integration', quality_density: 'high',   volume_multiplier: 1.00, bricks_per_week: 1 },
        { name: 'Race-Specific', start_week: rsStart,   end_week: rsStart+rs-1,   weeks_in_phase: rs,    focus: approach === 'base_first' ? 'Race-pace comfort — settle into finish-line pace'                  : 'Race-pace simulation + back-to-back long days',   quality_density: 'medium', volume_multiplier: 0.90, bricks_per_week: 2 },
        { name: 'Taper',         start_week: rsStart+rs,end_week: d,              weeks_in_phase: taperW,focus: 'Race sharpening and full recovery',                      quality_density: 'low',    volume_multiplier: 0.50, bricks_per_week: 0 },
      ];
    }

    // Recovery week interval:
    //   base_first → 2:1 (every 3rd week) — slower-recovering completion athletes
    //   race_peak  → 3:1 (every 4th week) — progressive overload for performance
    //   comeback / first_race → more frequent recovery (every 2nd week) — conservative ramp
    const intent = this.params.training_intent as TrainingIntent | undefined;
    const recoveryInterval = (() => {
      if (intent === 'comeback' || intent === 'first_race') return 2;
      return approach === 'base_first' ? 3 : 4;
    })();
    const taperStart = phases.find(p => p.name === 'Taper')?.start_week ?? d;
    const recovery_weeks: number[] = [];
    for (let w = recoveryInterval; w < taperStart; w += recoveryInterval) {
      recovery_weeks.push(w);
    }

    return { phases, recovery_weeks };
  }

  protected getCurrentPhase(week: number, ps: TriPhaseStructure): TriPhase {
    for (const p of ps.phases) {
      if (week >= p.start_week && week <= p.end_week) return p;
    }
    return ps.phases[ps.phases.length - 1];
  }

  protected isRecoveryWeek(week: number, ps: TriPhaseStructure): boolean {
    return ps.recovery_weeks.includes(week);
  }

  /** Recent marathon / full post-race tier → `transition_mode: recovery_rebuild` from materialize. */
  protected isRecoveryRebuildWeek1(week: number): boolean {
    return week === 1 && this.params.transition_mode === 'recovery_rebuild';
  }

  // ============================================================================
  // WEEK GENERATION
  // ============================================================================

  protected generateWeek(
    week: number,
    phase: TriPhase,
    ps: TriPhaseStructure,
    isRecovery: boolean,
  ): TriSession[] {
    const vol = TRI_VOLUME[this.params.distance]?.[this.params.fitness]!;
    const recoveryRebuildW1 = this.isRecoveryRebuildWeek1(week);

    // Scale long run from progression table (seeded by recent fitness if provided)
    let longRunMi = this.getLongRun(week, phase, isRecovery);
    // Scale long ride from progression table
    let longRideHr = this.getLongRide(week, phase, isRecovery);

    if (recoveryRebuildW1) {
      const maxMi = Math.max(2, Math.round(RECOVERY_REBUILD_W1_LONG_RUN_CAP_MIN / this.easyPaceMinPerMile()));
      longRunMi = Math.min(longRunMi, maxMi);
      longRideHr = Math.min(longRideHr, RECOVERY_REBUILD_W1_LONG_RIDE_CAP_HR);
      longRideHr = Math.max(0, Math.round(longRideHr * 4) / 4);
    }

    // Volume multiplier
    const vm = isRecovery ? 0.65 : phase.volume_multiplier;

    // Weekly run mileage (excluding long run)
    const peakRunMi  = vol.peakRunMiles;
    const startRunMi = this.resolveStartRunMiles(vol.startRunMiles);
    const weekRunMi  = this.lerp(startRunMi, peakRunMi, week, this.params.duration_weeks) * vm;
    const supportRunMi = Math.max(0, weekRunMi - longRunMi);

    // Weekly swim yardage
    const peakSwimYd  = SWIM_YARDS_PEAK[this.params.distance]?.[this.params.fitness] ?? 10000;
    const startSwimYd = this.resolveStartSwimYards(SWIM_YARDS_START[this.params.distance]?.[this.params.fitness] ?? 5000);
    const weekSwimYd  = Math.round(this.lerp(startSwimYd, peakSwimYd, week, this.params.duration_weeks) * vm);

    const isTaper      = phase.name === 'Taper';
    const bricksThisWeek = recoveryRebuildW1 || isRecovery || isTaper ? 0 : phase.bricks_per_week;
    const weekInPhase  = Math.max(1, week - (phase.start_week ?? 1) + 1);

    const sessions: TriSession[] = [];

    // Days occupied by run sessions in a concurrent run plan — we treat those
    // sessions as satisfying the triathlon plan's run volume for that day rather
    // than stacking a second run on the same day.
    const existingRunDays = new Set<string>(
      (this.params.existing_run_days ?? []).map(d => String(d))
    );

    // ── Sunday: Long Run ────────────────────────────────────────────────────
    // Skip if run plan already covers Sunday (its long run IS this plan's long run).
    if (longRunMi > 0 && !existingRunDays.has('Sunday')) {
      sessions.push(this.longRunSession(longRunMi, 'Sunday'));
    }

    // ── Saturday: Long Ride (or Brick in Build/Race-Specific) ───────────────
    // Brick run leg is very short (≤20 min off-the-bike) — keep even if Saturday
    // is a run day, since brick specificity is critical for race prep.
    if (longRideHr > 0) {
      if (bricksThisWeek >= 1 && phase.name !== 'Base') {
        sessions.push(...this.brickSession(longRideHr, Math.min(20, Math.round(longRunMi * 0.20)), 'Saturday', phase, weekInPhase));
      } else {
        sessions.push(this.longRideSession(longRideHr, 'Saturday'));
      }
    }

    // ── Tuesday: Bike Quality ────────────────────────────────────────────────
    if (recoveryRebuildW1) {
      sessions.push(this.recoveryRebuildEasyBikeSession('Tuesday'));
    } else if (!isTaper || isRecovery) {
      sessions.push(this.bikeQualitySession(phase, isRecovery, 'Tuesday'));
    } else {
      sessions.push(this.bikeOpenersSession('Tuesday'));
    }

    // ── Wednesday: Run Quality + Swim ───────────────────────────────────────
    // If run plan already has a Wednesday run (e.g. tempo), skip the tri run quality
    // session — the run plan's hard effort counts toward triathlon run fitness.
    const runQualMi = this.runQualityMiles(phase, isRecovery, week);
    const swimWeekForQuality = recoveryRebuildW1 ? Math.round(weekSwimYd * 0.55) : weekSwimYd;
    if (!existingRunDays.has('Wednesday')) {
      if (recoveryRebuildW1) {
        const easyMi = Math.max(3, Math.round(longRunMi * 0.25));
        sessions.push(this.easyRunSession(easyMi, 'Wednesday'));
      } else {
        sessions.push(this.runQualitySession(runQualMi, phase, 'Wednesday'));
      }
    }
    sessions.push(this.swimQualitySession(swimWeekForQuality, phase, isRecovery, 'Wednesday', week));

    // ── Thursday: Second Brick (Race-Specific) or Endurance Ride ─────────────
    if (bricksThisWeek >= 2) {
      const brickBikeHr = Math.max(0.75, longRideHr * 0.5);
      const brickRunMin = 20;
      sessions.push(...this.brickSession(brickBikeHr, brickRunMin, 'Thursday', phase, weekInPhase));
    } else {
      const midRideHr = isRecovery ? longRideHr * 0.5 : longRideHr * 0.6;
      sessions.push(this.midRideSession(midRideHr, 'Thursday'));
    }

    // ── Monday: Easy Recovery Swim ───────────────────────────────────────────
    const recSwimYd = recoveryRebuildW1
      ? Math.max(1000, Math.round(weekSwimYd * 0.28))
      : Math.max(1500, Math.round(weekSwimYd * 0.35));
    sessions.push(this.easySwimSession(recSwimYd, 'Monday'));

    // ── Friday: Easy Run ─────────────────────────────────────────────────────
    // Skip if run plan already has a Friday run — no point doubling up easy miles.
    if (supportRunMi >= 3 && !isTaper && !existingRunDays.has('Friday')) {
      let easyRunMi = Math.max(3, Math.round(supportRunMi * 0.6));
      if (recoveryRebuildW1) {
        const capMi = Math.max(3, Math.round(30 / this.easyPaceMinPerMile()));
        easyRunMi = Math.min(easyRunMi, capMi);
      }
      sessions.push(this.easyRunSession(easyRunMi, 'Friday'));
    }

    // ── Strength (optional, protocol-driven) ─────────────────────────────────
    // Strength goes on the lightest aerobic days. The triathlon protocol selects
    // phase-appropriate exercises and respects brick-day placement guardrails.
    if ((this.params.strength_frequency ?? 0) > 0 && !isRecovery && !recoveryRebuildW1) {
      // Compute weekInPhase: how many weeks into the current phase is this week?
      const phaseStartWeek = ps.phases.find(p => p.name === phase.name)?.start_week ?? 1;
      const wipForStrength = Math.max(1, week - phaseStartWeek + 1);

      // Identify brick days in this week so placement avoids them
      const brickDays = sessions.filter(s => s.tags?.includes('brick')).map(s => s.day);
      const hasBrickMonday = brickDays.includes('Monday');
      const strDay1 = hasBrickMonday ? 'Tuesday' : 'Monday';

      const strSession = this.buildProtocolStrengthSession(strDay1, phase, wipForStrength, 0, brickDays);
      if (strSession) sessions.push(strSession);

      if ((this.params.strength_frequency ?? 0) >= 2) {
        const hasBrickWed = brickDays.includes('Wednesday');
        const strDay2 = hasBrickWed ? 'Thursday' : 'Wednesday';
        const strSession2 = this.buildProtocolStrengthSession(strDay2, phase, wipForStrength, 1, brickDays);
        if (strSession2) sessions.push(strSession2);
      }
    }

    return sessions;
  }

  // ============================================================================
  // PROGRESSION HELPERS
  // ============================================================================

  protected getLongRun(week: number, phase: TriPhase, isRecovery: boolean): number {
    const progression = LONG_RUN_PROGRESSION[this.params.distance]?.[this.params.fitness] ?? [];
    if (progression.length === 0) return 0;

    const offset = this.getProgressionOffset(progression);
    const idx = Math.min(offset + (week - 1), progression.length - 1);
    let miles = progression[idx];

    if (isRecovery) miles = Math.round(miles * 0.70);
    if (phase.name === 'Taper') miles = Math.max(3, Math.round(miles * 0.55));

    return Math.max(0, miles);
  }

  protected getLongRide(week: number, phase: TriPhase, isRecovery: boolean): number {
    const progression = LONG_RIDE_PROGRESSION[this.params.distance]?.[this.params.fitness] ?? [];
    if (progression.length === 0) return 0;

    const offset = this.getRideProgressionOffset(progression);
    const idx = Math.min(offset + (week - 1), progression.length - 1);
    let hours = progression[idx];

    if (isRecovery) hours = Math.round(hours * 0.70 * 4) / 4; // round to 0.25
    if (phase.name === 'Taper') hours = Math.max(0.75, Math.round(hours * 0.55 * 4) / 4);

    return Math.max(0, Math.round(hours * 4) / 4);
  }

  protected getProgressionOffset(progression: number[]): number {
    const recentLR = this.params.recent_long_run_miles;
    if (!recentLR || recentLR <= 0) return 0;
    const target = recentLR * 0.95;
    let best = 0;
    for (let i = 0; i < progression.length; i++) {
      if (progression[i] <= target) best = i; else break;
    }
    const max = Math.max(0, progression.length - this.params.duration_weeks);
    return Math.min(best, max);
  }

  protected getRideProgressionOffset(progression: number[]): number {
    const recentRide = this.params.recent_long_ride_hours;
    if (!recentRide || recentRide <= 0) return 0;
    const target = recentRide * 0.95;
    let best = 0;
    for (let i = 0; i < progression.length; i++) {
      if (progression[i] <= target) best = i; else break;
    }
    const max = Math.max(0, progression.length - this.params.duration_weeks);
    return Math.min(best, max);
  }

  protected resolveStartRunMiles(tableStart: number): number {
    const current = this.params.current_weekly_run_miles;
    if (!current || current <= 0) return tableStart;
    const vol = TRI_VOLUME[this.params.distance]?.[this.params.fitness]!;
    let effective = Math.max(tableStart * 0.7, Math.min(vol.peakRunMiles * 0.95, current));
    if (this.params.current_acwr != null && this.params.current_acwr > 1.3) {
      effective *= Math.max(0.80, 1.0 - (this.params.current_acwr - 1.3) * 0.5);
    }
    if (this.params.volume_trend === 'declining') effective *= 0.95;
    return Math.round(effective);
  }

  protected resolveStartSwimYards(tableStart: number): number {
    const current = this.params.current_weekly_swim_yards;
    if (!current || current <= 0) return tableStart;
    const peakYd = SWIM_YARDS_PEAK[this.params.distance]?.[this.params.fitness] ?? 15000;
    return Math.max(tableStart * 0.7, Math.min(peakYd * 0.95, current));
  }

  protected runQualityMiles(phase: TriPhase, isRecovery: boolean, week: number): number {
    if (isRecovery || phase.name === 'Taper') return 4;
    const vol = TRI_VOLUME[this.params.distance]?.[this.params.fitness]!;
    const start = Math.max(3, Math.round(vol.startRunMiles * 0.20));
    const peak  = Math.max(5, Math.round(vol.peakRunMiles  * 0.22));
    return Math.round(this.lerp(start, peak, week, this.params.duration_weeks));
  }

  /** Linear interpolation scaled to week position (0→1 across plan) */
  protected lerp(start: number, end: number, week: number, total: number): number {
    const t = Math.min(1, (week - 1) / Math.max(1, total - 1));
    return start + (end - start) * t;
  }

  // ============================================================================
  // SESSION FACTORIES
  // ============================================================================

  protected longRunSession(miles: number, day: string): TriSession {
    return {
      day, type: 'run', name: 'Long Run',
      description: `${miles} miles at easy, conversational pace. Heart rate Zone 2.`,
      duration: Math.round(miles * this.easyPaceMinPerMile()),
      steps_preset: [`longrun_${miles}mi_easypace`],
      tags: ['long_run', 'endurance'],
    };
  }

  protected easyRunSession(miles: number, day: string): TriSession {
    return {
      day, type: 'run', name: 'Easy Run',
      description: `${miles} miles easy. Active recovery from bike/swim sessions.`,
      duration: Math.round(miles * this.easyPaceMinPerMile()),
      steps_preset: [`run_easy_${miles}mi`],
      tags: ['easy_run'],
    };
  }

  protected runQualitySession(miles: number, phase: TriPhase, day: string): TriSession {
    const approach = this.params.approach;
    const isTaper  = phase.name === 'Taper';

    if (isTaper) return this.easyRunSession(miles, day);

    if (phase.name === 'Base') {
      return {
        day, type: 'run', name: 'Easy Run + Strides',
        description: `${miles} miles easy with 6×20s strides to maintain leg turnover.`,
        duration: Math.round(miles * this.easyPaceMinPerMile()) + 5,
        steps_preset: [`run_easy_${miles}mi`, 'strides_6x20s'],
        tags: ['easy_run', 'strides'],
      };
    }

    if (approach === 'base_first') {
      // base_first: quality time favours Z3 tempo — muscular endurance without
      // spiking the stress load. No track intervals until the final 2 weeks of RS.
      if (phase.name === 'Race-Specific') {
        const racePaceMi = Math.max(2, Math.round(miles * 0.50));
        return {
          day, type: 'run', name: 'Race Pace Run',
          description: `Warm-up 1 mi easy, ${racePaceMi} mi at goal race pace (Z3 — comfortably hard, sustainable), cool-down 1 mi. Getting comfortable at finish-line effort.`,
          duration: Math.round((miles + 2) * this.easyPaceMinPerMile()) + 5,
          steps_preset: ['warmup_run_easy_1mi', `run_race_pace_${racePaceMi}mi`, 'cooldown_easy_1mi'],
          tags: ['race_pace', 'tempo', 'hard_run'],
        };
      }
      // Build: tempo (Z3) — not intervals — to stay within completion-athlete load
      const tempoMi = Math.max(2, Math.round(miles * 0.50));
      return {
        day, type: 'run', name: 'Tempo Run',
        description: `Warm-up 1 mi easy, ${tempoMi} mi at tempo/Z3 (comfortably hard — you can say a few words), cool-down 1 mi. Builds muscular endurance without deep fatigue.`,
        duration: Math.round((miles + 2) * this.easyPaceMinPerMile()),
        steps_preset: ['warmup_run_easy_1mi', `tempo_${tempoMi}mi_z3`, 'cooldown_easy_1mi'],
        tags: ['tempo', 'hard_run', 'z3'],
      };
    }

    // race_peak: quality time mixes Z4 threshold and strategic Z5.
    // Build → VO2 intervals to raise the ceiling; RS → threshold tempo.
    if (phase.name === 'Race-Specific') {
      const tempoMi = Math.max(2, Math.round(miles * 0.55));
      return {
        day, type: 'run', name: 'Tempo Run',
        description: `Warm-up 1 mi, ${tempoMi} mi at threshold / 10K effort, cool-down 1 mi.`,
        duration: Math.round((miles + 2) * this.easyPaceMinPerMile()) + 5,
        steps_preset: ['warmup_run_easy_1mi', `tempo_${tempoMi}mi_threshold`, 'cooldown_easy_1mi'],
        tags: ['tempo', 'hard_run', 'threshold'],
      };
    }
    // Build: 5K-pace intervals — elevates VO2max ceiling for performance
    const reps = this.params.distance === 'sprint' ? 4 : this.params.distance === 'olympic' ? 5 : 6;
    return {
      day, type: 'run', name: 'Run Intervals',
      description: `Warm-up 1 mi, ${reps}×1 km at 5K effort (90s jog recovery), cool-down 1 mi. VO2max stimulus — controlled aggression.`,
      duration: Math.round(miles * this.easyPaceMinPerMile()) + 10,
      steps_preset: ['warmup_run_easy_1mi', `interval_${reps}x1km_5kpace_r90s`, 'cooldown_easy_1mi'],
      tags: ['intervals', 'hard_run', 'vo2max'],
    };
  }

  protected longRideSession(hours: number, day: string): TriSession {
    const mins = Math.round(hours * 60);
    return {
      day, type: 'bike', name: 'Long Ride',
      description: `${hours.toFixed(2).replace(/\.?0+$/, '')}h aerobic endurance ride. Stay in Zone 2 (55–75% FTP). Focus on fueling practice.`,
      duration: mins,
      steps_preset: [`bike_endurance_${mins}min_Z2`],
      tags: ['long_ride', 'endurance'],
    };
  }

  protected midRideSession(hours: number, day: string): TriSession {
    const mins = Math.round(hours * 60);
    return {
      day, type: 'bike', name: 'Aerobic Ride',
      description: `${Math.round(hours * 60)} min steady aerobic ride at 65–75% FTP.`,
      duration: mins,
      steps_preset: [`bike_endurance_${mins}min_Z2`],
      tags: ['aerobic_ride'],
    };
  }

  /** Week 1 after full post-race context — easy spin only (mirrors combined `recoveryRebuildWeek1` bike slot). */
  protected recoveryRebuildEasyBikeSession(day: string): TriSession {
    return {
      day,
      type: 'bike',
      name: 'Easy Ride',
      description:
        '50 min easy aerobic ride, Zone 2. Legs are rebuilding after recent racing — keep power and duration conservative.',
      duration: 50,
      steps_preset: ['bike_endurance_50min_Z2'],
      tags: ['aerobic_ride'],
    };
  }

  protected bikeQualitySession(phase: TriPhase, isRecovery: boolean, day: string): TriSession {
    const approach = this.params.approach;

    if (isRecovery || phase.name === 'Base') {
      return {
        day, type: 'bike', name: 'Aerobic Ride',
        description: `60 min steady aerobic ride. Zone 2 effort (55–75% FTP). Good pedal mechanics.`,
        duration: 60,
        steps_preset: ['bike_endurance_60min_Z2'],
        tags: ['aerobic_ride'],
      };
    }
    if (phase.name === 'Taper') {
      return this.bikeOpenersSession(day);
    }

    if (approach === 'base_first') {
      // base_first: the 20% quality time favours Zone 3 (comfortably hard).
      // Build → tempo over-unders; Race-Specific → sweet spot near race pace.
      if (phase.name === 'Race-Specific') {
        return {
          day, type: 'bike', name: 'Sweet Spot Intervals',
          description: `Warm-up 10 min, 3×12 min at sweet spot (88–93% FTP) with 5 min recovery, cool-down 10 min. Steady, sustainable — race-pace comfort over max power.`,
          duration: 71,
          steps_preset: ['warmup_bike_quality_10min_fastpedal', 'bike_ss_3x12min_r5min', 'cooldown_easy_10min'],
          tags: ['sweet_spot', 'hard_ride', 'tempo'],
        };
      }
      // Build: tempo blocks (Z3) — not threshold, to stay within 20% non-easy budget
      return {
        day, type: 'bike', name: 'Tempo Ride',
        description: `Warm-up 10 min, 2×20 min at tempo (82–88% FTP) with 5 min recovery, cool-down 10 min. Comfortably hard — you should be able to speak a few words.`,
        duration: 75,
        steps_preset: ['warmup_bike_quality_10min_fastpedal', 'bike_tempo_2x20min_r5min', 'cooldown_easy_10min'],
        tags: ['tempo', 'aerobic_power', 'hard_ride'],
      };
    }

    // race_peak: the 20% quality time mixes Zone 4 threshold + strategic Zone 5.
    if (phase.name === 'Race-Specific') {
      return {
        day, type: 'bike', name: 'Sweet Spot Intervals',
        description: `Warm-up 10 min, 3×15 min at sweet spot (88–93% FTP) with 5 min recovery, cool-down 10 min.`,
        duration: 75,
        steps_preset: ['warmup_bike_quality_10min_fastpedal', 'bike_ss_3x15min_r5min', 'cooldown_easy_10min'],
        tags: ['sweet_spot', 'hard_ride', 'threshold'],
      };
    }
    // Build: threshold intervals (95–105% FTP)
    return {
      day, type: 'bike', name: 'Threshold Intervals',
      description: `Warm-up 10 min, 4×8 min at threshold (95–105% FTP) with 5 min recovery, cool-down 10 min.`,
      duration: 82,
      steps_preset: ['warmup_bike_quality_10min_fastpedal', 'bike_thr_4x8min_r5min', 'cooldown_easy_10min'],
      tags: ['threshold', 'hard_ride'],
    };
  }

  protected bikeOpenersSession(day: string): TriSession {
    return {
      day, type: 'bike', name: 'Race Openers',
      description: `30 min easy spin with 4×30s race-pace efforts to open the legs. Stay relaxed.`,
      duration: 35,
      steps_preset: ['bike_openers'],
      tags: ['openers', 'easy_ride'],
    };
  }

  /** Returns TWO sessions: the bike leg and the run leg, both on the same day.
   *
   * Brick escalation by approach:
   *   base_first  — Z2 throughout. Pure neuromuscular transition practice.
   *                 Run leg stays easy; race-pace bricks only appear in the
   *                 final 2 weeks of Race-Specific.
   *   race_peak   — Z3/Z4 race-simulation bricks from mid-Build onward.
   *                 Bike finishes at race effort; run leg at goal pace.
   *
   * weekInPhase and phase are used to determine escalation timing.
   */
  protected brickSession(
    bikeHours: number,
    runMinutes: number,
    day: string,
    phase?: TriPhase,
    weekInPhase?: number,
  ): TriSession[] {
    const approach  = this.params.approach;
    const bikeMins  = Math.round(bikeHours * 60);
    const runMi     = Math.max(2, Math.round(runMinutes / this.easyPaceMinPerMile()));

    // Determine whether this brick is race-intensity:
    //   base_first  → only in final 2 weeks of Race-Specific
    //   race_peak   → from mid-Build (week 3+) onward
    const isRSPhase     = phase?.name === 'Race-Specific';
    const isBuildPhase  = phase?.name === 'Build';
    const wip           = weekInPhase ?? 1;
    const totalWip      = phase?.weeks_in_phase ?? 4;

    const useRacePace = approach === 'race_peak'
      ? (isBuildPhase && wip >= Math.ceil(totalWip / 2)) || isRSPhase
      : isRSPhase && wip >= totalWip - 1;  // base_first: only last 2 weeks of RS

    if (useRacePace) {
      return [
        {
          day, type: 'bike', name: 'Race-Simulation Brick — Bike',
          description: `${bikeHours.toFixed(2).replace(/\.?0+$/, '')}h. First 60% aerobic Z2, final 40% building to race effort (Z3–Z4). Simulate race-day fueling. Transition immediately to run.`,
          duration: bikeMins,
          steps_preset: [`bike_race_sim_${bikeMins}min_z2_to_z4`],
          tags: ['brick', 'race_simulation', 'long_ride'],
          timing: 'AM',
        },
        {
          day, type: 'run', name: 'Race-Simulation Brick — Run',
          description: `${runMi} miles at goal race pace (Z3–Z4). First half mile to shake out the legs, then settle into target effort. This teaches race-day metabolic switching.`,
          duration: Math.round(runMi * this.easyPaceMinPerMile()),
          steps_preset: [`run_race_pace_${runMi}mi`],
          tags: ['brick', 'race_pace', 'race_simulation'],
          timing: 'PM (immediately after bike)',
        },
      ];
    }

    // Default: Z2 transition brick (neuromuscular adaptation, not metabolic stress)
    return [
      {
        day, type: 'bike', name: 'Brick — Bike Leg',
        description: `${bikeHours.toFixed(2).replace(/\.?0+$/, '')}h at aerobic Z2 effort. Finish strong last 10 min. Transition directly to run.`,
        duration: bikeMins,
        steps_preset: [`bike_endurance_${bikeMins}min_Z2`],
        tags: ['brick', 'long_ride'],
        timing: 'AM',
      },
      {
        day, type: 'run', name: 'Brick — Run Leg',
        description: `${runMi} miles off the bike at easy Z2. First mile feels awkward — this is normal. No pushing pace; the goal is the transition itself.`,
        duration: Math.round(runMi * this.easyPaceMinPerMile()),
        steps_preset: [`run_easy_${runMi}mi`],
        tags: ['brick', 'easy_run'],
        timing: 'PM (immediately after bike)',
      },
    ];
  }

  protected swimQualitySession(weekYards: number, phase: TriPhase, isRecovery: boolean, day: string, planWeek: number): TriSession {
    // Main swim session is ~40% of weekly yardage
    const yd       = Math.max(1500, Math.round(weekYards * 0.40 / 50) * 50);
    const approach = this.params.approach;

    if (isRecovery || phase.name === 'Base') {
      // Both approaches: aerobic technique work during base — same physiological goal
      const mainYd = Math.max(800, yd - 600);
      return {
        day, type: 'swim', name: 'Aerobic Swim',
        description: `${yd} yards. Warm-up 300, ${mainYd} yards aerobic, cool-down 200. Focus on technique — catch, pull, rotation.`,
        duration: Math.round(yd / 50),
        steps_preset: ['swim_warmup_300yd_easy', `swim_aerobic_${Math.floor(mainYd/100)}x100yd_easy_r15`, 'swim_cooldown_200yd'],
        tags: ['aerobic_swim'],
      };
    }

    if (approach === 'base_first') {
      // base_first: CSS-aerobic pace (comfortable 2:10–2:20/100 for avg athlete).
      // No threshold. The goal is comfort at race pace, not lactate stimulation.
      if (phase.name === 'Race-Specific') {
        const sets = Math.max(5, Math.round((yd - 500) / 100));
        return {
          day, type: 'swim', name: 'Race Pace CSS',
          description: `${yd} yards. Warm-up 300, ${sets}×100 at comfortable race-pace CSS (15s rest) — sustainable, not maximal. Practice sighting between sets. Cool-down 200.`,
          duration: Math.round(yd / 46),
          steps_preset: ['swim_warmup_300yd_easy', `swim_aerobic_css_${sets}x100yd_r15`, 'swim_cooldown_200yd'],
          tags: ['css_aerobic', 'swim_intervals', 'race_specific'],
        };
      }
      // Build: continuous + drill combo — volume + technique (token from shared drill library)
      const drillTok = pickSwimDrillTokens(planWeek, 3, 1)[0]!;
      const drillYd = swimDrillYardsFromToken(drillTok);
      const contAdj = Math.max(400, yd - 500 - drillYd);
      return {
        day, type: 'swim', name: 'Continuous Swim + Drills',
        description: `${yd} yards. Warm-up 300, ${contAdj} yards continuous aerobic (build effort in final 200), technique drills (${drillYd} yd), cool-down 200. Endurance and stroke refinement.`,
        duration: Math.round(yd / 47),
        steps_preset: ['swim_warmup_300yd_easy', `swim_continuous_${Math.floor(contAdj / 100)}x100yd_aerobic`, drillTok, 'swim_cooldown_200yd'],
        tags: ['aerobic_swim', 'swim_drills', 'endurance'],
      };
    }

    // race_peak: CSS threshold pace — raises lactate threshold in water.
    // 10×100 at CSS is the gold standard for time-constrained threshold work.
    if (phase.name === 'Race-Specific') {
      const sets = Math.max(6, Math.round((yd - 500) / 100));
      return {
        day, type: 'swim', name: 'CSS Threshold Intervals',
        description: `${yd} yards. Warm-up 300, ${sets}×100 at CSS pace (10s rest — barely enough), cool-down 200. These should be sustainably hard — if splits blow up, slow down 2 sec/100.`,
        duration: Math.round(yd / 44),
        steps_preset: ['swim_warmup_300yd_easy', `swim_threshold_${sets}x100yd_r10`, 'swim_cooldown_200yd'],
        tags: ['css_threshold', 'swim_intervals', 'hard_swim', 'threshold'],
      };
    }
    // Build: aerobic sets with pace progression
    const sets = Math.max(4, Math.round((yd - 500) / 150));
    return {
      day, type: 'swim', name: 'Swim Build',
      description: `${yd} yards. Warm-up 300, ${sets}×150 aerobic building to CSS effort (20s rest), cool-down 200.`,
      duration: Math.round(yd / 48),
      steps_preset: ['swim_warmup_300yd_easy', `swim_aerobic_${sets}x150yd_r20`, 'swim_cooldown_200yd'],
      tags: ['aerobic_swim', 'swim_build'],
    };
  }

  protected easySwimSession(yards: number, day: string): TriSession {
    const roundedYd = Math.round(yards / 50) * 50;
    return {
      day, type: 'swim', name: 'Easy Swim',
      description: `${roundedYd} yards easy. Drills + aerobic sets. Active recovery.`,
      duration: Math.round(roundedYd / 50),
      steps_preset: ['swim_warmup_300yd_easy', `swim_aerobic_${Math.max(3, Math.round((roundedYd - 500) / 100))}x100yd_easy_r20`, 'swim_cooldown_200yd'],
      tags: ['easy_swim'],
    };
  }

  /**
   * Builds a protocol-driven strength session via the shared triathlon protocol.
   * Returns null for taper/recovery phases (no strength generated by protocol).
   *
   * sessionIndex: 0 = lower/posterior chain, 1 = upper/swim shoulder
   */
  protected buildProtocolStrengthSession(
    day: string,
    phase: TriPhase,
    weekInPhase: number,
    sessionIndex: 0 | 1,
    brickDays: string[],
  ): TriSession | null {
    // Guard: never place strength on a brick day
    if (brickDays.includes(day)) return null;

    // Map plan phase *names* to the strength protocol (keys must be strings — TriPhase is an object, never use it as a map key).
    const phaseNameMap: Record<string, string> = {
      Base: 'Base',
      Build: 'Build',
      'Race-Specific': 'Race Prep',
      Taper: 'Taper',
    };

    const limiter = this.params.limiter_sport ?? 'run';
    const equipmentType = this.params.equipment_type ?? 'commercial_gym';

    const protocolPhaseName = phaseNameMap[phase.name] ?? phase.name ?? 'Base';

    const usePerformanceStrength =
      this.params.goal === 'performance' || this.params.training_intent === 'performance';

    const ctx: ProtocolContext = {
      weekIndex: weekInPhase,
      weekInPhase,
      phase: { name: protocolPhaseName, start_week: 1, end_week: 4, weeks_in_phase: 4 },
      totalWeeks: this.params.total_weeks ?? 16,
      isRecovery: false,
      primarySchedule: {
        longSessionDays: ['Saturday', 'Sunday'],
        qualitySessionDays: ['Tuesday', 'Thursday'],
        easySessionDays: ['Monday', 'Wednesday', 'Friday'],
      },
      userBaselines: { equipment: equipmentType },
      strengthFrequency: (this.params.strength_frequency ?? 1) as 1 | 2,
      constraints: {},
      triathlonContext: {
        limiterSport: limiter,
        brickDays,
        strengthIntent: usePerformanceStrength ? 'performance' : 'support',
      },
    };

    const protocol = usePerformanceStrength ? triathlonPerformanceProtocol : triathlonProtocol;
    const sessions = protocol.createWeekSessions(ctx);
    const intent = sessions[Math.min(sessionIndex, sessions.length - 1)];
    if (!intent) return null;

    // Convert to TriSession format
    const exercises = (intent.exercises ?? []).map(ex =>
      `${ex.name}: ${ex.sets}×${ex.reps}${ex.notes ? ` (${ex.notes})` : ''}`
    ).join(' | ');

    return {
      day,
      type: 'strength',
      name: intent.name,
      description: `${intent.description}${exercises ? ` — ${exercises}` : ''}`,
      duration: intent.duration,
      tags: intent.tags,
    };
  }

  /** @deprecated Use buildProtocolStrengthSession instead */
  protected strengthSession(day: string): TriSession {
    return {
      day, type: 'strength', name: 'Triathlon Strength',
      description: 'Single-leg stability, hip strength, shoulder endurance. 40 min total.',
      duration: 40,
      tags: ['strength', 'durability'],
    };
  }

  // ============================================================================
  // PACE HELPERS
  // ============================================================================

  protected easyPaceMinPerMile(): number {
    const paces: Record<string, number> = { beginner: 11.0, intermediate: 9.5, advanced: 8.0 };
    return paces[this.params.fitness] ?? 9.5;
  }

  // ============================================================================
  // WEEKLY SUMMARY
  // ============================================================================

  protected buildWeeklySummary(
    _week: number,
    sessions: TriSession[],
    phase: TriPhase,
    isRecovery: boolean,
  ): TriWeeklySummary {
    const hardCount = sessions.filter(s =>
      s.tags.some(t => ['hard_run', 'hard_ride', 'hard_swim', 'threshold', 'intervals', 'sweet_spot', 'swim_intervals'].includes(t))
    ).length;

    const totalMins = sessions.reduce((sum, s) => sum + s.duration, 0);
    const hours = Math.round(totalMins / 60 * 10) / 10;

    const runMi = sessions
      .filter(s => s.type === 'run')
      .reduce((sum, s) => {
        const m = s.description.match(/(\d+)\s*miles?/i);
        return sum + (m ? Number(m[1]) : 0);
      }, 0);

    const bikeHr = sessions
      .filter(s => s.type === 'bike')
      .reduce((sum, s) => sum + s.duration / 60, 0);

    const swimYd = sessions
      .filter(s => s.type === 'swim')
      .reduce((sum, s) => {
        const m = s.description.match(/(\d+)\s*yards?/i);
        return sum + (m ? Number(m[1]) : 0);
      }, 0);

    const keyWorkouts = sessions
      .filter(s => s.tags.some(t => ['long_run', 'long_ride', 'brick', 'threshold', 'swim_intervals'].includes(t)))
      .map(s => s.name);

    return {
      focus: isRecovery ? 'Recovery Week' : phase.focus,
      key_workouts: [...new Set(keyWorkouts)],
      estimated_hours: hours,
      hard_sessions: hardCount,
      total_run_miles: Math.round(runMi * 10) / 10,
      total_bike_hours: Math.round(bikeHr * 10) / 10,
      total_swim_yards: Math.round(swimYd),
      notes: isRecovery ? 'Reduced volume for recovery and adaptation' : '',
    };
  }

  // ============================================================================
  // PLAN METADATA
  // ============================================================================

  protected planName(): string {
    const distLabel: Record<string, string> = {
      sprint: 'Sprint Triathlon', olympic: 'Olympic Triathlon',
      '70.3': '70.3 Half-Iron', ironman: 'Ironman',
    };
    const goalLabel = this.params.goal === 'performance' ? 'Performance' : 'Finisher';
    const label = distLabel[this.params.distance] ?? this.params.distance;
    if (this.params.race_name) return `${this.params.race_name} — ${goalLabel} Plan`;
    return `${label} ${goalLabel} Plan — ${this.params.duration_weeks} Weeks`;
  }

  protected planDescription(ps: TriPhaseStructure): string {
    const phaseNames = ps.phases.map(p => p.name).join(' → ');
    return `A ${this.params.duration_weeks}-week ${this.params.fitness}-level triathlon plan for ${this.params.distance} racing. ` +
      `Progresses through ${phaseNames} phases with swim, bike, run, and brick sessions each week.`;
  }
}
