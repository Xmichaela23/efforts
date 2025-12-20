// Balanced Build Generator - Jack Daniels Inspired
// 
// Philosophy:
// - VDOT-based pacing: E (Easy), M (Marathon), T (Threshold), I (Interval), R (Repetition)
// - 2Q System: Two Quality workouts per week (Q1 Tuesday, Q2 Thursday)
// - 4-Phase Structure: Foundation → Early Quality → Peak → Taper
// - Quality limits: No single workout exceeds 10K of hard running
// - All paces calculated from user's 5K baseline
//
// Based on principles from Jack Daniels' Running Formula.
// This is an adaptation and not officially endorsed by Jack Daniels or Human Kinetics.

import { BaseGenerator } from './base-generator.ts';
import { TrainingPlan, Session, Phase, PhaseStructure, TOKEN_PATTERNS } from '../types.ts';

// Long run progression by fitness level (in miles)
const LONG_RUN_PROGRESSION: Record<string, Record<string, number[]>> = {
  'marathon': {
    'intermediate': [
      10, 12, 14, 10,   // Weeks 1-4 (Phase I: Foundation)
      14, 16, 18, 12,   // Weeks 5-8 (Phase II: Early Quality)
      18, 19, 20, 14,   // Weeks 9-12 (Phase II continues)
      18, 20, 22, 12    // Weeks 13-16 (Phase III: Peak, then Taper)
    ],
    'advanced': [
      12, 14, 16, 12,   // Weeks 1-4
      16, 18, 20, 14,   // Weeks 5-8
      20, 21, 22, 16,   // Weeks 9-12
      20, 22, 22, 14    // Weeks 13-16
    ]
  },
  'half': {
    'intermediate': [8, 10, 12, 8, 12, 13, 14, 10, 14, 14, 15, 10],
    'advanced': [10, 12, 14, 10, 14, 15, 16, 12, 16, 16, 16, 12]
  },
  '10k': {
    'intermediate': [7, 8, 10, 7, 10, 11, 12, 9, 12, 12, 12, 8],
    'advanced': [9, 10, 12, 9, 12, 13, 14, 10, 14, 14, 14, 10]
  },
  '5k': {
    'intermediate': [6, 7, 8, 6, 8, 9, 10, 7, 10, 10, 10, 7],
    'advanced': [8, 9, 10, 8, 10, 11, 12, 9, 12, 12, 12, 9]
  }
};

// Weekly mileage targets (higher for performance focus)
const WEEKLY_MILEAGE: Record<string, Record<string, { start: number; peak: number }>> = {
  'marathon': {
    'intermediate': { start: 35, peak: 60 },
    'advanced': { start: 50, peak: 80 }
  },
  'half': {
    'intermediate': { start: 30, peak: 50 },
    'advanced': { start: 40, peak: 65 }
  },
  '10k': {
    'intermediate': { start: 25, peak: 45 },
    'advanced': { start: 35, peak: 60 }
  },
  '5k': {
    'intermediate': { start: 20, peak: 40 },
    'advanced': { start: 30, peak: 55 }
  }
};

export class BalancedBuildGenerator extends BaseGenerator {
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
      description: this.generatePlanDescription(),
      duration_weeks: this.params.duration_weeks,
      units: 'imperial',
      baselines_required: {
        run: ['fiveK_pace', 'easyPace'] // Need 5K time for VDOT calculations
      },
      weekly_summaries,
      sessions_by_week
    };
  }

  protected generatePlanName(): string {
    const distanceNames: Record<string, string> = {
      '5k': '5K',
      '10k': '10K',
      'half': 'Half Marathon',
      'marathon': 'Marathon'
    };
    const distance = distanceNames[this.params.distance] || this.params.distance;
    return `${distance} Performance Plan - ${this.params.duration_weeks} Weeks`;
  }

  protected generatePlanDescription(): string {
    return `A ${this.params.duration_weeks}-week performance-focused plan using VDOT-based pacing. ` +
      `Features two quality workouts per week (intervals and tempo) with all paces calculated from your 5K time. ` +
      `Based on proven training principles.`;
  }

  private generateWeekSessions(
    weekNumber: number,
    phase: Phase,
    phaseStructure: PhaseStructure,
    isRecovery: boolean
  ): Session[] {
    const sessions: Session[] = [];
    const runningDays = this.getRunningDays();

    // Get targets
    const weeklyMiles = this.calculateWeeklyMileage(weekNumber, phase, isRecovery, phaseStructure);
    const longRunMiles = this.getLongRunMiles(weekNumber, isRecovery);
    
    // Long run (Sunday) - with MP segments in Phase III
    const withMP = phase.name === 'Race Prep' && !isRecovery && 
                   (this.params.distance === 'marathon' || this.params.distance === 'half');
    const mpMiles = withMP ? this.getMPSegmentMiles(weekNumber, phase) : 0;
    sessions.push(this.createVDOTLongRun(longRunMiles, mpMiles));

    let usedMiles = longRunMiles;

    // Two Quality Days (2Q System) - not in recovery or taper
    if (!isRecovery) {
      const quality = this.addQualitySessions(sessions, weekNumber, phase, runningDays);
      usedMiles += quality;
    } else {
      // Recovery week: just strides
      sessions.push(this.createEasyWithStrides(4, 'Tuesday'));
      usedMiles += 4;
    }

    // Fill with easy runs
    this.fillWithEasyRuns(sessions, runningDays, weeklyMiles - usedMiles);

    return this.assignDaysToSessions(sessions, runningDays);
  }

  // ============================================================================
  // QUALITY SESSIONS (2Q SYSTEM)
  // ============================================================================

  /**
   * Add quality sessions based on phase
   * Returns total quality miles added
   */
  private addQualitySessions(
    sessions: Session[], 
    weekNumber: number, 
    phase: Phase, 
    runningDays: number
  ): number {
    let mileageUsed = 0;
    const weekInPhase = weekNumber - phase.start_week + 1;

    switch (phase.name) {
      case 'Base':
        // Phase I: Foundation - introduce T pace
        sessions.push(this.createEasyWithStrides(5, 'Tuesday'));
        mileageUsed += 5;
        if (runningDays >= 5 && weekNumber >= 2) {
          sessions.push(this.createTempoRun(weekInPhase));
          mileageUsed += 6;
        }
        break;

      case 'Speed':
        // Phase II: Add I pace intervals, continue T work
        // Q1: Intervals (Tuesday)
        sessions.push(this.createIntervalSession(weekInPhase));
        mileageUsed += 6;
        
        // Q2: Cruise Intervals or Tempo (Thursday)
        if (runningDays >= 5) {
          sessions.push(this.createCruiseIntervals(weekInPhase));
          mileageUsed += 7;
        }
        break;

      case 'Race Prep':
        // Phase III: Marathon-specific M pace work
        if (this.params.distance === 'marathon' || this.params.distance === 'half') {
          // Q1: Tempo or MP run
          sessions.push(this.createMarathonPaceRun(weekInPhase));
          mileageUsed += 6;
          
          // Q2: Cruise intervals
          if (runningDays >= 5) {
            sessions.push(this.createCruiseIntervals(weekInPhase));
            mileageUsed += 7;
          }
        } else {
          // Shorter distances: continue intervals
          sessions.push(this.createIntervalSession(weekInPhase));
          mileageUsed += 6;
          if (runningDays >= 5) {
            sessions.push(this.createTempoRun(weekInPhase));
            mileageUsed += 6;
          }
        }
        break;

      case 'Taper':
        // Phase IV: Reduced volume sharpening
        sessions.push(this.createTaperInterval());
        mileageUsed += 4;
        break;
    }

    return mileageUsed;
  }

  // ============================================================================
  // MILEAGE CALCULATIONS
  // ============================================================================

  private calculateWeeklyMileage(
    weekNumber: number, 
    phase: Phase, 
    isRecovery: boolean,
    phaseStructure: PhaseStructure
  ): number {
    const mileageConfig = WEEKLY_MILEAGE[this.params.distance]?.[this.params.fitness];
    if (!mileageConfig) return 40;

    const { start, peak } = mileageConfig;
    const totalWeeks = this.params.duration_weeks;
    
    const taperPhase = phaseStructure.phases.find(p => p.name === 'Taper');
    const taperStart = taperPhase?.start_week || totalWeeks;
    
    let targetMiles: number;
    if (weekNumber < taperStart) {
      const progress = (weekNumber - 1) / Math.max(1, taperStart - 2);
      targetMiles = start + (peak - start) * Math.min(1, progress);
    } else {
      const weekInTaper = weekNumber - taperStart + 1;
      targetMiles = peak * (weekInTaper === 1 ? 0.6 : 0.4);
    }
    
    if (isRecovery) {
      targetMiles = targetMiles * 0.7;
    }
    
    return Math.round(targetMiles);
  }

  private getLongRunMiles(weekNumber: number, isRecovery: boolean): number {
    const progression = LONG_RUN_PROGRESSION[this.params.distance]?.[this.params.fitness];
    if (!progression) return 14;
    
    const index = Math.min(weekNumber - 1, progression.length - 1);
    return progression[index] || 14;
  }

  private getMPSegmentMiles(weekNumber: number, phase: Phase): number {
    const weekInPhase = weekNumber - phase.start_week + 1;
    // Progressive MP segments: 2 → 3 → 4 → 5 miles
    return Math.min(5, 1 + weekInPhase);
  }

  // ============================================================================
  // WORKOUT CREATORS - VDOT BASED
  // ============================================================================

  /**
   * Long run with VDOT pacing description
   */
  private createVDOTLongRun(miles: number, mpMiles: number = 0): Session {
    const duration = this.milesToMinutes(miles);
    
    let description: string;
    let tokens: string[];
    
    if (mpMiles > 0) {
      description = `${miles} miles: First ${miles - mpMiles} miles at E pace (easy, conversational), ` +
        `final ${mpMiles} miles at M pace (marathon goal pace). ` +
        `Practice race-day fueling and pacing.`;
      tokens = [TOKEN_PATTERNS.long_run_with_mp_miles(miles, mpMiles)];
    } else {
      description = `${miles} miles at E pace (easy, conversational). ` +
        `Stay relaxed and save energy for quality days.`;
      tokens = [TOKEN_PATTERNS.long_run_miles(miles)];
    }
    
    return this.createSession('Sunday', 'Long Run', description, duration, tokens, ['long_run']);
  }

  /**
   * Interval session (I pace) - VO2max development
   */
  private createIntervalSession(weekInPhase: number): Session {
    // Progressive intervals
    let reps: number;
    let distance: '800' | '1000' | '1200';
    let restSec: number;

    if (weekInPhase <= 2) {
      reps = 5;
      distance = '800';
      restSec = 120;
    } else if (weekInPhase <= 4) {
      reps = 6;
      distance = '800';
      restSec = 90;
    } else {
      reps = 5;
      distance = '1000';
      restSec = 120;
    }

    const qualityMiles = distance === '800' ? (reps * 0.5) : (reps * 0.62);
    
    return this.createSession(
      'Tuesday',
      'I Pace Intervals',
      `${reps}×${distance}m at I pace (5K effort). ` +
      `Jog ${restSec}s recovery between reps. ` +
      `Total quality: ~${qualityMiles.toFixed(1)} miles. ` +
      `These develop VO2max and running economy.`,
      50,
      [
        TOKEN_PATTERNS.warmup_1mi,
        distance === '800' 
          ? TOKEN_PATTERNS.intervals_800(reps, restSec)
          : TOKEN_PATTERNS.intervals_1000(reps, restSec),
        TOKEN_PATTERNS.cooldown_1mi
      ],
      ['hard_run', 'intervals', 'vo2max']
    );
  }

  /**
   * Tempo/Threshold run (T pace)
   */
  private createTempoRun(weekInPhase: number): Session {
    // Progressive tempo: 15 → 25 minutes
    const tempoMinutes = Math.min(25, 15 + weekInPhase * 2);
    const tempoMiles = Math.round(tempoMinutes / 7); // ~7 min/mile at T pace

    return this.createSession(
      'Thursday',
      'T Pace Tempo',
      `${tempoMinutes} minutes continuous at T pace (comfortably hard, ~10K effort). ` +
      `~${tempoMiles} miles of quality. ` +
      `Should feel controlled but challenging.`,
      tempoMinutes + 25,
      [
        TOKEN_PATTERNS.warmup_1mi,
        TOKEN_PATTERNS.tempo_minutes(tempoMinutes),
        TOKEN_PATTERNS.cooldown_1mi
      ],
      ['hard_run', 'tempo', 'threshold']
    );
  }

  /**
   * Cruise intervals (T pace with short rest)
   */
  private createCruiseIntervals(weekInPhase: number): Session {
    // Progressive: 3×1mi → 4×1mi → 3×1.5mi
    const reps = Math.min(4, 2 + weekInPhase);
    const milesEach = weekInPhase > 3 ? 1.5 : 1;
    const totalQuality = reps * milesEach;

    return this.createSession(
      'Thursday',
      'Cruise Intervals',
      `${reps}×${milesEach}mi at T pace with 60-90s jog recovery. ` +
      `Total: ${totalQuality} miles @ T. ` +
      `Cruise intervals build lactate threshold with brief recovery.`,
      50 + reps * 2,
      [
        TOKEN_PATTERNS.warmup_1mi,
        TOKEN_PATTERNS.cruise_intervals(reps, milesEach),
        TOKEN_PATTERNS.cooldown_1mi
      ],
      ['hard_run', 'threshold']
    );
  }

  /**
   * Marathon pace run
   */
  private createMarathonPaceRun(weekInPhase: number): Session {
    // Progressive: 4 → 6 miles at MP
    const mpMiles = Math.min(6, 3 + weekInPhase);

    return this.createSession(
      'Tuesday',
      'M Pace Run',
      `${mpMiles} miles at M pace (marathon goal pace). ` +
      `Practice your race-day rhythm and pacing. ` +
      `Should feel sustainable for the full marathon.`,
      this.milesToMinutes(mpMiles) + 25,
      [
        TOKEN_PATTERNS.warmup_1mi,
        TOKEN_PATTERNS.mp_run_miles(mpMiles),
        TOKEN_PATTERNS.cooldown_1mi
      ],
      ['hard_run', 'marathon_pace']
    );
  }

  /**
   * Easy run with strides
   */
  private createEasyWithStrides(miles: number, day: string): Session {
    return this.createSession(
      day,
      'Easy + Strides',
      `${miles} miles at E pace, then 4×100m strides (fast but relaxed, full recovery). ` +
      `Strides maintain leg turnover and neuromuscular coordination.`,
      this.milesToMinutes(miles) + 10,
      [TOKEN_PATTERNS.easy_run_miles(miles), TOKEN_PATTERNS.strides_4x100m],
      ['easy_run', 'strides']
    );
  }

  /**
   * Taper sharpening workout
   */
  private createTaperInterval(): Session {
    return this.createSession(
      'Tuesday',
      'Race Tune-up',
      `4×400m at I pace with full recovery (2-3 min jog). ` +
      `Short, sharp effort to stay sharp without fatigue. ` +
      `Trust your fitness - the hay is in the barn!`,
      35,
      [
        TOKEN_PATTERNS.warmup_1mi,
        TOKEN_PATTERNS.intervals_800(3, 180), // Lighter than usual
        TOKEN_PATTERNS.cooldown_1mi
      ],
      ['moderate_run', 'intervals']
    );
  }

  /**
   * Fill remaining days with easy runs
   */
  private fillWithEasyRuns(
    sessions: Session[], 
    targetDays: number,
    remainingMiles: number
  ): void {
    const remainingDays = Math.max(0, targetDays - sessions.length);
    if (remainingDays <= 0) return;

    const milesPerDay = Math.max(4, Math.round(remainingMiles / remainingDays));
    const easyMiles = Math.max(4, Math.min(8, milesPerDay));
    
    for (let i = 0; i < remainingDays; i++) {
      sessions.push(this.createSession(
        '',
        'Easy Run',
        `${easyMiles} miles at E pace. Recovery and aerobic maintenance.`,
        this.milesToMinutes(easyMiles),
        [TOKEN_PATTERNS.easy_run_miles(easyMiles)],
        ['easy_run']
      ));
    }
  }
}
