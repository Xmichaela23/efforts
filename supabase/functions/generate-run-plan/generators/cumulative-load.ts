// Cumulative Load Generator - Hansons Inspired
// 
// Philosophy:
// - Cumulative fatigue: Never fully recovered, simulates late-race conditions
// - Long run capped at 16 miles: "Run the last 16 of the marathon, not the first 16"
// - 6 days per week: Consistent daily running
// - SOS (Something of Substance): Two key workouts per week (Tue/Thu)
// - Speed phase → Strength phase transition midway

import { BaseGenerator } from './base-generator.ts';
import { TrainingPlan, Session, Phase, PhaseStructure, TOKEN_PATTERNS } from '../types.ts';

export class CumulativeLoadGenerator extends BaseGenerator {
  // Hansons caps long runs at 16 miles regardless of goal
  private readonly HANSONS_LONG_RUN_CAP = 16;

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
      description: this.generateHansonsDescription(),
      duration_weeks: this.params.duration_weeks,
      units: 'imperial',
      baselines_required: {
        run: ['fiveK_pace', 'easyPace', 'marathon_pace']
      },
      weekly_summaries,
      sessions_by_week
    };
  }

  private generateHansonsDescription(): string {
    return `Hansons-inspired cumulative fatigue plan. Long runs capped at ${this.HANSONS_LONG_RUN_CAP} miles - ` +
      `you'll simulate the last 16 miles of the marathon, not the first 16. ` +
      `Features SOS (Something of Substance) workouts Tuesday and Thursday with marathon pace work throughout. ` +
      `Designed to teach your body to perform on tired legs.`;
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

    // Hansons structure (6 days):
    // Monday: Easy
    // Tuesday: SOS - Speed or Strength
    // Wednesday: Easy
    // Thursday: SOS - Tempo (Marathon Pace)
    // Friday: Easy
    // Saturday: Easy or Off
    // Sunday: Long Run

    // Determine if we're in Speed phase or Strength phase
    // Hansons: Weeks 1-10 = Speed, Weeks 11+ = Strength
    const halfwayPoint = Math.floor(this.params.duration_weeks / 2);
    const isSpeedPhase = week <= halfwayPoint;

    // 1. LONG RUN (Sunday) - Capped at 16 miles
    const longRunMiles = this.calculateHansonsLongRun(week, phase, isRecovery);
    const longRunMinutes = this.roundToFiveMinutes(this.milesToMinutes(longRunMiles));
    sessions.push(this.createLongRun(longRunMinutes, 'Sunday'));

    // 2. SOS #1 - TUESDAY (Speed or Strength)
    if (!isRecovery) {
      if (isSpeedPhase) {
        sessions.push(this.createSpeedSession(week));
      } else {
        sessions.push(this.createStrengthSession(week, phase));
      }
    } else {
      sessions.push(this.createStridesSession(30, 'Tuesday'));
    }

    // 3. SOS #2 - THURSDAY (Tempo at Marathon Pace)
    if (!isRecovery) {
      sessions.push(this.createTempoSession(week, phase));
    } else {
      sessions.push(this.createEasyRun(35, 'Thursday'));
    }

    // 4. EASY RUNS to fill remaining days
    const remainingVolume = weekVolume - sessions.reduce((sum, s) => 
      sum + (s.duration / (this.milesToMinutes(1) || 9)), 0
    );
    const remainingDays = runningDays - sessions.length;
    
    if (remainingDays > 0 && remainingVolume > 0) {
      const easyMiles = remainingVolume / remainingDays;
      const easyMinutes = this.roundToFiveMinutes(this.milesToMinutes(easyMiles));
      
      for (let i = 0; i < remainingDays; i++) {
        // Hansons easy runs are TRULY easy (1:30-2:00 slower than MP)
        sessions.push(this.createEasyRun(Math.max(25, Math.min(50, easyMinutes))));
      }
    }

    return this.assignDaysToSessions(sessions, runningDays);
  }

  // ============================================================================
  // HANSONS-STYLE WORKOUTS
  // ============================================================================

  /**
   * Calculate Hansons long run (capped at 16 miles)
   * Progressive build: 10 → 12 → 14 → 16, with cutbacks
   */
  private calculateHansonsLongRun(week: number, phase: Phase, isRecovery: boolean): number {
    const totalWeeks = this.params.duration_weeks;
    const progressionPoint = week / totalWeeks;

    let longRunMiles: number;

    if (phase.name === 'Taper') {
      // Taper: 12 → 10 → 8 → 6 → race
      const taperWeek = week - phase.start_week + 1;
      longRunMiles = Math.max(6, 12 - (taperWeek * 2));
    } else if (isRecovery) {
      // Recovery weeks: shorter long run
      longRunMiles = 12;
    } else if (progressionPoint < 0.3) {
      // Early: 10-12 miles
      longRunMiles = 10 + Math.floor(progressionPoint * 10);
    } else if (progressionPoint < 0.6) {
      // Mid: 12-14 miles
      longRunMiles = 12 + Math.floor((progressionPoint - 0.3) * 10);
    } else {
      // Late: 14-16 miles (capped)
      longRunMiles = 14 + Math.floor((progressionPoint - 0.6) * 5);
    }

    // Apply Hansons cap
    return Math.min(longRunMiles, this.HANSONS_LONG_RUN_CAP);
  }

  /**
   * Create Speed session (Tuesday - Weeks 1-10)
   * Hansons: 12x400 → 8x600 → 6x800 → 5x1000 → 4x1200 → 3x1600
   */
  private createSpeedSession(week: number): Session {
    const totalWeeks = this.params.duration_weeks;
    const halfwayPoint = Math.floor(totalWeeks / 2);
    const weekInPhase = week;
    const progressionPoint = weekInPhase / halfwayPoint;

    let reps: number;
    let distance: '800' | '1000' | '1200';
    let restSec: number;
    let description: string;

    if (progressionPoint < 0.3) {
      // Early: 6x800m
      reps = 6;
      distance = '800';
      restSec = 90;
      description = 'Speed development: 6x800m at 5K pace';
    } else if (progressionPoint < 0.5) {
      // Mid-early: 5x1000m
      reps = 5;
      distance = '1000';
      restSec = 90;
      description = 'Speed endurance: 5x1000m at 5K pace';
    } else if (progressionPoint < 0.7) {
      // Mid: 4x1200m
      reps = 4;
      distance = '1200';
      restSec = 120;
      description = 'Extended speed: 4x1200m at 5K pace';
    } else {
      // Late: Back to shorter for sharpness
      reps = 6;
      distance = '800';
      restSec = 90;
      description = 'Speed maintenance: 6x800m at 5K pace';
    }

    const token = distance === '800' 
      ? TOKEN_PATTERNS.intervals_800(reps, restSec)
      : distance === '1000'
        ? TOKEN_PATTERNS.intervals_1000(reps, restSec)
        : TOKEN_PATTERNS.intervals_1200(reps, restSec);

    return this.createSession(
      'Tuesday',
      'Speed Workout',
      description,
      50,
      [
        TOKEN_PATTERNS.warmup_quality_12min,
        token,
        TOKEN_PATTERNS.cooldown_easy_10min
      ],
      ['hard_run', 'intervals', 'speed']
    );
  }

  /**
   * Create Strength session (Tuesday - Weeks 11+)
   * Hansons: Mile repeats at MP-10s (marathon pace minus 10 seconds)
   * Progression: 3x1mi → 4x1mi → 5x1mi → 6x1mi
   */
  private createStrengthSession(week: number, phase: Phase): Session {
    const halfwayPoint = Math.floor(this.params.duration_weeks / 2);
    const weekInStrengthPhase = week - halfwayPoint;
    
    // Progressive mile repeats
    const reps = Math.min(6, 3 + Math.floor(weekInStrengthPhase / 2));

    if (phase.name === 'Taper') {
      // Taper: reduced volume
      return this.createSession(
        'Tuesday',
        'Strength - Taper',
        '2x1mi at marathon pace minus 10s',
        35,
        [
          TOKEN_PATTERNS.warmup_quality_12min,
          TOKEN_PATTERNS.intervals_1mi(2, 2),
          TOKEN_PATTERNS.cooldown_easy_10min
        ],
        ['hard_run', 'strength']
      );
    }

    return this.createSession(
      'Tuesday',
      'Strength Workout',
      `${reps}x1mi at marathon pace minus 10s`,
      50,
      [
        TOKEN_PATTERNS.warmup_quality_12min,
        TOKEN_PATTERNS.intervals_1mi(reps, 2),
        TOKEN_PATTERNS.cooldown_easy_10min
      ],
      ['hard_run', 'strength']
    );
  }

  /**
   * Create Tempo session (Thursday - Marathon Pace)
   * Hansons: Start at 5mi, build to 10mi at MP
   */
  private createTempoSession(week: number, phase: Phase): Session {
    const totalWeeks = this.params.duration_weeks;
    const progressionPoint = week / totalWeeks;

    let tempoMiles: number;
    let description: string;

    if (phase.name === 'Taper') {
      // Taper: 3-4 miles
      tempoMiles = 3;
      description = 'Taper tempo: 3 miles at marathon pace';
    } else if (progressionPoint < 0.2) {
      tempoMiles = 5;
      description = 'Build tempo: 5 miles at marathon pace';
    } else if (progressionPoint < 0.4) {
      tempoMiles = 6;
      description = 'Tempo development: 6 miles at marathon pace';
    } else if (progressionPoint < 0.5) {
      tempoMiles = 7;
      description = 'Extended tempo: 7 miles at marathon pace';
    } else if (progressionPoint < 0.6) {
      tempoMiles = 8;
      description = 'Peak tempo build: 8 miles at marathon pace';
    } else if (progressionPoint < 0.7) {
      tempoMiles = 9;
      description = 'Peak tempo: 9 miles at marathon pace';
    } else if (progressionPoint < 0.85) {
      tempoMiles = 10;
      description = 'Maximum tempo: 10 miles at marathon pace';
    } else {
      tempoMiles = 8;
      description = 'Tempo maintenance: 8 miles at marathon pace';
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
      ['hard_run', 'tempo', 'marathon_pace']
    );
  }
}
