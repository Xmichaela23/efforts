// Volume Progression Generator - Pfitzinger Inspired
// 
// Philosophy:
// - High weekly mileage as primary training stimulus
// - Medium-Long Runs (MLR) midweek - critical endurance builder
// - 10% rule - never increase weekly mileage more than 10%
// - Long runs with marathon pace segments in race prep phase
// - Multiple long-ish runs to distribute endurance work

import { BaseGenerator } from './base-generator.ts';
import { TrainingPlan, Session, Phase, PhaseStructure, TOKEN_PATTERNS } from '../types.ts';

export class VolumeProgressionGenerator extends BaseGenerator {
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
      description: this.generatePfitzDescription(),
      duration_weeks: this.params.duration_weeks,
      units: 'imperial',
      baselines_required: {
        run: ['fiveK_pace', 'easyPace', 'marathon_pace']
      },
      weekly_summaries,
      sessions_by_week
    };
  }

  private generatePfitzDescription(): string {
    const peakVolume = this.calculatePeakVolume();
    return `Pfitzinger-inspired high-mileage plan peaking at ${peakVolume} miles/week. ` +
      `Features medium-long runs midweek, progressive volume build, and marathon pace work in race prep phase. ` +
      `Suitable for runners who thrive on consistent high volume.`;
  }

  private generateWeekSessions(
    week: number,
    phase: Phase,
    phaseStructure: PhaseStructure,
    isRecovery: boolean
  ): Session[] {
    const sessions: Session[] = [];
    const runningDays = this.getRunningDays();
    const weekVolume = this.calculateWeekVolume(week, phase, phaseStructure);

    // Pfitz structure:
    // Monday: Recovery
    // Tuesday: General Aerobic or VO2
    // Wednesday: Medium-Long Run (MLR)
    // Thursday: Lactate Threshold
    // Friday: Recovery
    // Saturday: Long Run
    // Sunday: Recovery or easy

    // 1. LONG RUN (Saturday)
    const longRunMiles = this.calculateLongRunMiles(weekVolume, phase, isRecovery);
    const longRunMinutes = this.roundToFiveMinutes(this.milesToMinutes(longRunMiles));
    
    // Add marathon pace finish in race prep phase
    const withMP = phase.name === 'Race Prep' && !isRecovery && 
                   (this.params.distance === 'marathon' || this.params.distance === 'half');
    const mpMinutes = withMP ? Math.round(longRunMinutes * 0.2) : 0;
    
    sessions.push(this.createLongRun(longRunMinutes, 'Saturday', withMP, mpMinutes));

    // 2. MEDIUM-LONG RUN (Wednesday) - Pfitz signature
    const mlrMiles = this.calculateMLRMiles(weekVolume);
    const mlrMinutes = this.roundToFiveMinutes(this.milesToMinutes(mlrMiles));
    sessions.push(this.createMLRSession(mlrMinutes, isRecovery));

    // 3. QUALITY SESSION (Tuesday or Thursday based on phase)
    if (!isRecovery) {
      if (phase.name === 'Base') {
        // Base: General aerobic with strides
        sessions.push(this.createGeneralAerobicSession(weekVolume));
      } else if (phase.name === 'Speed') {
        // Speed: VO2max intervals
        sessions.push(this.createVO2Session(week, phase));
      } else if (phase.name === 'Race Prep') {
        // Race prep: Lactate threshold
        sessions.push(this.createLTSession(week, phase));
      } else {
        // Taper: Easy with strides
        sessions.push(this.createStridesSession(30, 'Tuesday'));
      }
    } else {
      sessions.push(this.createStridesSession(30, 'Tuesday'));
    }

    // 4. SECOND QUALITY OR GENERAL AEROBIC (Thursday if running 5+ days)
    if (runningDays >= 5 && !isRecovery && phase.name !== 'Taper') {
      if (phase.name === 'Speed' || phase.name === 'Race Prep') {
        sessions.push(this.createLTSession(week, phase));
      } else {
        sessions.push(this.createGeneralAerobicSession(weekVolume));
      }
    }

    // 5. RECOVERY RUNS to fill remaining days
    const remainingVolume = weekVolume - sessions.reduce((sum, s) => 
      sum + (s.duration / (this.milesToMinutes(1) || 9)), 0
    );
    const remainingDays = runningDays - sessions.length;
    
    if (remainingDays > 0 && remainingVolume > 0) {
      const recoveryMiles = remainingVolume / remainingDays;
      const recoveryMinutes = this.roundToFiveMinutes(this.milesToMinutes(recoveryMiles));
      
      for (let i = 0; i < remainingDays; i++) {
        sessions.push(this.createRecoveryRun(Math.max(25, Math.min(45, recoveryMinutes))));
      }
    }

    return this.assignDaysToSessions(sessions, runningDays);
  }

  // ============================================================================
  // PFITZINGER-STYLE WORKOUTS
  // ============================================================================

  /**
   * Calculate long run miles (25-30% of weekly, capped)
   */
  private calculateLongRunMiles(weekVolume: number, phase: Phase, isRecovery: boolean): number {
    let longRunMiles = weekVolume * 0.28;
    longRunMiles = Math.min(longRunMiles, this.getLongRunCap());
    
    if (isRecovery) {
      longRunMiles = Math.round(longRunMiles * 0.75);
    }
    
    if (phase.name === 'Taper') {
      longRunMiles = Math.round(longRunMiles * 0.6);
    }
    
    return Math.round(longRunMiles);
  }

  /**
   * Calculate Medium-Long Run miles (15-20% of weekly)
   * Pfitz MLR is a signature workout
   */
  private calculateMLRMiles(weekVolume: number): number {
    const mlrMiles = weekVolume * 0.17;
    return Math.min(Math.round(mlrMiles), 15); // Cap at 15 miles
  }

  /**
   * Create Medium-Long Run session
   */
  private createMLRSession(durationMinutes: number, isRecovery: boolean): Session {
    const actualDuration = isRecovery ? Math.round(durationMinutes * 0.75) : durationMinutes;
    
    return this.createSession(
      'Wednesday',
      'Medium-Long Run',
      'Endurance run at general aerobic pace',
      actualDuration,
      [TOKEN_PATTERNS.long_run(actualDuration)],
      ['endurance', 'mlr']
    );
  }

  /**
   * Create General Aerobic session
   */
  private createGeneralAerobicSession(weekVolume: number): Session {
    const gaMiles = weekVolume * 0.12;
    const gaMinutes = this.roundToFiveMinutes(this.milesToMinutes(gaMiles));
    
    return this.createSession(
      'Tuesday',
      'General Aerobic + Strides',
      'Aerobic run with 6 strides at the end',
      gaMinutes + 5,
      [TOKEN_PATTERNS.easy_run(gaMinutes), TOKEN_PATTERNS.strides_6x20s],
      ['easy_run', 'strides']
    );
  }

  /**
   * Create VO2max interval session (Pfitz style)
   */
  private createVO2Session(week: number, phase: Phase): Session {
    const weekInPhase = week - phase.start_week + 1;
    
    // Pfitz VO2 progression: 5x600m → 5x800m → 5x1000m → 4x1200m
    let reps: number;
    let distance: '800' | '1000' | '1200';
    
    if (weekInPhase <= 2) {
      reps = 5;
      distance = '800';
    } else if (weekInPhase <= 4) {
      reps = 5;
      distance = '1000';
    } else {
      reps = 4;
      distance = '1200';
    }

    const token = distance === '800' 
      ? TOKEN_PATTERNS.intervals_800(reps, 120)
      : distance === '1000'
        ? TOKEN_PATTERNS.intervals_1000(reps, 120)
        : TOKEN_PATTERNS.intervals_1200(reps, 150);

    return this.createSession(
      'Tuesday',
      'VO2max Intervals',
      `${reps}x${distance}m at 5K pace`,
      50,
      [
        TOKEN_PATTERNS.warmup_quality_12min,
        token,
        TOKEN_PATTERNS.cooldown_easy_10min
      ],
      ['hard_run', 'intervals', 'vo2max']
    );
  }

  /**
   * Create Lactate Threshold session (Pfitz style)
   * Can be tempo or cruise intervals
   */
  private createLTSession(week: number, phase: Phase): Session {
    const weekInPhase = week - phase.start_week + 1;
    
    // Pfitz LT progression: tempo runs or cruise intervals
    // Alternate between continuous tempo and cruise intervals
    const useCruise = weekInPhase % 2 === 0;
    
    if (useCruise) {
      // Cruise intervals: 4x1mi at T pace with 60s rest
      const reps = 3 + Math.floor(weekInPhase / 2);
      
      return this.createSession(
        'Thursday',
        'Cruise Intervals',
        `${reps}x1mi at lactate threshold pace`,
        50,
        [
          TOKEN_PATTERNS.warmup_quality_12min,
          TOKEN_PATTERNS.cruise_intervals(Math.min(reps, 5), 1),
          TOKEN_PATTERNS.cooldown_easy_10min
        ],
        ['hard_run', 'threshold']
      );
    } else {
      // Continuous tempo
      const tempoMinutes = 20 + (weekInPhase * 3);
      
      return this.createSession(
        'Thursday',
        'Tempo Run',
        `${tempoMinutes} minutes at lactate threshold pace`,
        tempoMinutes + 25,
        [
          TOKEN_PATTERNS.warmup_quality_12min,
          TOKEN_PATTERNS.tempo_minutes(Math.min(tempoMinutes, 45)),
          TOKEN_PATTERNS.cooldown_easy_10min
        ],
        ['hard_run', 'tempo', 'threshold']
      );
    }
  }

  /**
   * Create recovery run (Pfitz: marathon pace + 60-90s)
   */
  private createRecoveryRun(durationMinutes: number): Session {
    return this.createSession(
      'Monday',
      'Recovery Run',
      'Easy recovery run at relaxed pace',
      durationMinutes,
      [TOKEN_PATTERNS.easy_run(durationMinutes)],
      ['recovery', 'easy_run']
    );
  }
}
