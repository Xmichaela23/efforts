// Time Efficient Generator - FIRST (Furman) Inspired
// 
// Philosophy:
// - 3 key runs only: Speed, Tempo, Long
// - Every run has specific purpose - no junk miles
// - Cross-training expected on other days
// - 10K pace as anchor for all training paces

import { BaseGenerator } from './base-generator.ts';
import { TrainingPlan, Session, Phase, PhaseStructure, TOKEN_PATTERNS } from '../types.ts';

export class TimeEfficientGenerator extends BaseGenerator {
  generatePlan(): TrainingPlan {
    const phaseStructure = this.determinePhaseStructure();
    const sessions_by_week: Record<string, Session[]> = {};
    const weekly_summaries: Record<string, any> = {};

    for (let week = 1; week <= this.params.duration_weeks; week++) {
      const phase = this.getCurrentPhase(week, phaseStructure);
      const isRecovery = this.isRecoveryWeek(week, phaseStructure);

      const weekSessions = this.generateWeekSessions(week, phase, phaseStructure, isRecovery);
      sessions_by_week[week.toString()] = weekSessions;
      weekly_summaries[week.toString()] = this.generateWeeklySummary(
        week, weekSessions, phase, isRecovery
      );
    }

    return {
      name: this.generatePlanName(),
      description: this.generateFIRSTDescription(),
      duration_weeks: this.params.duration_weeks,
      units: 'imperial',
      baselines_required: {
        run: ['fiveK_pace', 'easyPace']
      },
      weekly_summaries,
      sessions_by_week
    };
  }

  private generateFIRSTDescription(): string {
    return `FIRST-inspired "Run Less, Run Faster" plan with 3 quality runs per week. ` +
      `Each run has a specific purpose: speed development, threshold improvement, and endurance building. ` +
      `Cross-training (cycling, swimming) recommended on 2 additional days.`;
  }

  private generateWeekSessions(
    week: number,
    phase: Phase,
    phaseStructure: PhaseStructure,
    isRecovery: boolean
  ): Session[] {
    const sessions: Session[] = [];

    // FIRST always has exactly 3 key runs
    // Tuesday: Speed/Track
    // Thursday: Tempo
    // Saturday/Sunday: Long

    // 1. SPEED WORKOUT (Tuesday)
    sessions.push(this.createSpeedSession(week, phase, isRecovery));

    // 2. TEMPO WORKOUT (Thursday)
    sessions.push(this.createTempoSession(week, phase, isRecovery));

    // 3. LONG RUN (Sunday)
    sessions.push(this.createLongRunSession(week, phase, phaseStructure, isRecovery));

    return sessions;
  }

  // ============================================================================
  // FIRST-STYLE WORKOUTS
  // ============================================================================

  /**
   * Create speed/track workout (Tuesday)
   * FIRST uses 10K pace as reference, intervals get progressively faster
   */
  private createSpeedSession(week: number, phase: Phase, isRecovery: boolean): Session {
    if (isRecovery) {
      // Recovery week: shorter, easier intervals
      return this.createSession(
        'Tuesday',
        'Speed - Recovery',
        '6x400m at 5K pace with equal jog recovery',
        35,
        [
          TOKEN_PATTERNS.warmup_quality_12min,
          TOKEN_PATTERNS.intervals_800(4, 120),
          TOKEN_PATTERNS.cooldown_easy_10min
        ],
        ['hard_run', 'intervals']
      );
    }

    // FIRST progression pattern for 16-week plan (scaled for other durations)
    const totalWeeks = this.params.duration_weeks;
    const progressionPoint = week / totalWeeks;

    let reps: number;
    let distance: '800' | '1000' | '1200';
    let restSec: number;
    let description: string;

    if (phase.name === 'Taper') {
      // Taper: reduced volume, maintain intensity
      reps = 6;
      distance = '800';
      restSec = 90;
      description = 'Taper speed: 6x800m at 5K pace';
    } else if (progressionPoint < 0.25) {
      // Early: 12x400m or 8x600m equivalent → 6x800m
      reps = 6;
      distance = '800';
      restSec = 90;
      description = 'Build speed endurance: 6x800m at 5K pace';
    } else if (progressionPoint < 0.5) {
      // Mid-early: 6x800m
      reps = 6;
      distance = '800';
      restSec = 90;
      description = 'VO2max development: 6x800m at 5K pace';
    } else if (progressionPoint < 0.75) {
      // Mid-late: 5x1000m or 4x1200m
      reps = 5;
      distance = '1000';
      restSec = 120;
      description = 'Extended intervals: 5x1000m at 5K pace';
    } else {
      // Late: 4x1200m or 3x1600m
      reps = 4;
      distance = '1200';
      restSec = 120;
      description = 'Peak intervals: 4x1200m at 5K pace';
    }

    const token = distance === '800' 
      ? TOKEN_PATTERNS.intervals_800(reps, restSec)
      : distance === '1000'
        ? TOKEN_PATTERNS.intervals_1000(reps, restSec)
        : TOKEN_PATTERNS.intervals_1200(reps, restSec);

    return this.createSession(
      'Tuesday',
      'Track Repeats',
      description,
      50,
      [
        TOKEN_PATTERNS.warmup_quality_12min,
        token,
        TOKEN_PATTERNS.cooldown_easy_10min
      ],
      ['hard_run', 'intervals']
    );
  }

  /**
   * Create tempo workout (Thursday)
   * FIRST: Sustained tempo at 10K pace + 15-30 seconds
   */
  private createTempoSession(week: number, phase: Phase, isRecovery: boolean): Session {
    if (isRecovery) {
      return this.createSession(
        'Thursday',
        'Tempo - Recovery',
        '3 miles at threshold pace',
        35,
        [
          TOKEN_PATTERNS.warmup_quality_12min,
          TOKEN_PATTERNS.tempo_miles(3),
          TOKEN_PATTERNS.cooldown_easy_10min
        ],
        ['hard_run', 'tempo', 'threshold']
      );
    }

    // FIRST tempo progression: 4mi → 5mi → 6mi → 7mi → 8mi, then back down for taper
    const totalWeeks = this.params.duration_weeks;
    const progressionPoint = week / totalWeeks;

    let tempoMiles: number;
    let description: string;

    if (phase.name === 'Taper') {
      tempoMiles = 4;
      description = 'Taper tempo: 4 miles at threshold pace';
    } else if (progressionPoint < 0.25) {
      tempoMiles = 4;
      description = 'Build threshold: 4 miles at tempo pace';
    } else if (progressionPoint < 0.4) {
      tempoMiles = 5;
      description = 'Threshold development: 5 miles at tempo pace';
    } else if (progressionPoint < 0.6) {
      tempoMiles = 6;
      description = 'Extended threshold: 6 miles at tempo pace';
    } else if (progressionPoint < 0.8) {
      tempoMiles = 7;
      description = 'Peak threshold: 7 miles at tempo pace';
    } else {
      tempoMiles = 6;
      description = 'Maintain threshold: 6 miles at tempo pace';
    }

    return this.createSession(
      'Thursday',
      'Tempo Run',
      description,
      this.milesToMinutes(tempoMiles) + 25,
      [
        TOKEN_PATTERNS.warmup_quality_12min,
        TOKEN_PATTERNS.tempo_miles(tempoMiles),
        TOKEN_PATTERNS.cooldown_easy_10min
      ],
      ['hard_run', 'tempo', 'threshold']
    );
  }

  /**
   * Create long run (Sunday)
   * FIRST: Long runs at 10K pace + 60-75 seconds (controlled easy)
   */
  private createLongRunSession(
    week: number,
    phase: Phase,
    phaseStructure: PhaseStructure,
    isRecovery: boolean
  ): Session {
    const weekVolume = this.calculateWeekVolume(week, phase, phaseStructure);
    
    // FIRST long run is ~40-45% of weekly volume (more than typical since only 3 runs)
    let longRunMiles = Math.min(weekVolume * 0.42, this.getLongRunCap());
    
    if (isRecovery) {
      longRunMiles = Math.round(longRunMiles * 0.7);
    }

    // FIRST long run progression with cutback pattern
    const totalWeeks = this.params.duration_weeks;
    const progressionPoint = week / totalWeeks;

    // Apply cutback every 3rd week (FIRST pattern)
    const weekInCycle = week % 3;
    if (weekInCycle === 0 && !isRecovery && phase.name !== 'Taper') {
      longRunMiles = Math.round(longRunMiles * 0.85);
    }

    if (phase.name === 'Taper') {
      // Progressive taper reduction
      if (progressionPoint > 0.9) {
        longRunMiles = Math.min(4, longRunMiles);
      } else if (progressionPoint > 0.85) {
        longRunMiles = Math.round(longRunMiles * 0.5);
      } else {
        longRunMiles = Math.round(longRunMiles * 0.7);
      }
    }

    const longRunMinutes = this.roundToFiveMinutes(this.milesToMinutes(longRunMiles));

    return this.createSession(
      'Sunday',
      'Long Run',
      `${longRunMiles} miles at easy pace (10K pace + 60-75s)`,
      longRunMinutes,
      [TOKEN_PATTERNS.long_run(longRunMinutes)],
      ['long_run']
    );
  }
}
