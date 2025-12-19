// Balanced Build Generator - Jack Daniels Inspired
// 
// Philosophy:
// - DISTANCE-BASED: All runs specified in miles, not minutes
// - VDOT-based pacing (all paces derived from 5K time)
// - Phase-based: Foundation → Early Quality → Transition Quality → Taper
// - 2Q System: Two quality workouts per week, rest is easy running
// - Quality limits: No single workout exceeds 10K of interval work
// - GOAL-BASED: "complete" vs "speed" determines workout types

import { BaseGenerator } from './base-generator.ts';
import { TrainingPlan, Session, Phase, PhaseStructure, TOKEN_PATTERNS } from '../types.ts';

// Long run progression by fitness level (in miles)
// Index = week number - 1
const LONG_RUN_PROGRESSION: Record<string, Record<string, number[]>> = {
  'marathon': {
    'beginner': [
      8, 9, 10, 7,      // Weeks 1-4 (Base, recovery at 4)
      11, 12, 13, 9,    // Weeks 5-8 (Base continues, recovery at 8)
      14, 15, 16, 11,   // Weeks 9-12 (Speed, recovery at 12)
      17, 18, 20, 12    // Weeks 13-16 (Race Prep, Taper)
    ],
    'intermediate': [
      10, 12, 14, 10,   // Weeks 1-4
      15, 16, 17, 12,   // Weeks 5-8
      18, 19, 20, 14,   // Weeks 9-12
      20, 21, 22, 12    // Weeks 13-16
    ],
    'advanced': [
      12, 14, 16, 11,   // Weeks 1-4
      17, 18, 19, 14,   // Weeks 5-8
      20, 21, 22, 16,   // Weeks 9-12
      22, 22, 22, 14    // Weeks 13-16
    ]
  },
  'half': {
    'beginner': [
      6, 7, 8, 6,       // Weeks 1-4
      9, 10, 11, 8,     // Weeks 5-8
      11, 12, 13, 10    // Weeks 9-12
    ],
    'intermediate': [
      8, 9, 10, 7,
      11, 12, 13, 10,
      14, 14, 15, 10
    ],
    'advanced': [
      10, 11, 12, 9,
      13, 14, 15, 11,
      16, 16, 16, 12
    ]
  },
  '10k': {
    'beginner': [5, 6, 7, 5, 8, 8, 9, 6, 9, 10, 10, 7],
    'intermediate': [7, 8, 9, 7, 10, 10, 11, 8, 11, 12, 12, 8],
    'advanced': [9, 10, 11, 8, 12, 12, 13, 10, 13, 14, 14, 10]
  },
  '5k': {
    'beginner': [4, 5, 5, 4, 6, 6, 7, 5, 7, 8, 8, 5],
    'intermediate': [6, 7, 7, 5, 8, 8, 9, 6, 9, 10, 10, 7],
    'advanced': [8, 9, 9, 7, 10, 10, 11, 8, 11, 12, 12, 8]
  }
};

// Weekly mileage targets by fitness (start → peak)
const WEEKLY_MILEAGE: Record<string, Record<string, { start: number; peak: number }>> = {
  'marathon': {
    'beginner': { start: 25, peak: 50 },
    'intermediate': { start: 35, peak: 65 },
    'advanced': { start: 50, peak: 85 }
  },
  'half': {
    'beginner': { start: 20, peak: 40 },
    'intermediate': { start: 30, peak: 50 },
    'advanced': { start: 40, peak: 60 }
  },
  '10k': {
    'beginner': { start: 15, peak: 30 },
    'intermediate': { start: 25, peak: 40 },
    'advanced': { start: 35, peak: 55 }
  },
  '5k': {
    'beginner': { start: 12, peak: 25 },
    'intermediate': { start: 20, peak: 35 },
    'advanced': { start: 30, peak: 50 }
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
        run: ['fiveK_pace', 'easyPace']
      },
      weekly_summaries,
      sessions_by_week
    };
  }

  private generateWeekSessions(
    weekNumber: number,
    phase: Phase,
    phaseStructure: PhaseStructure,
    isRecovery: boolean
  ): Session[] {
    const sessions: Session[] = [];
    const runningDays = this.getRunningDays();
    const isCompletionGoal = this.params.goal === 'complete';

    // Get target weekly mileage
    const weeklyMiles = this.calculateWeeklyMileage(weekNumber, phase, isRecovery, phaseStructure);
    
    // Get long run distance
    const longRunMiles = this.getLongRunMiles(weekNumber, isRecovery);
    
    // Long run with MP segments in Race Prep phase
    const withMP = phase.name === 'Race Prep' && !isRecovery && 
                   (this.params.distance === 'marathon' || this.params.distance === 'half');
    // MP segment: 2-3 miles for completion, 2-4 miles for speed
    const mpMiles = withMP ? this.getMPSegmentMiles(weekNumber, phase, isCompletionGoal) : 0;
    
    sessions.push(this.createLongRunMiles(longRunMiles, 'Sunday', mpMiles));

    // Track mileage used
    let usedMiles = longRunMiles;

    // Quality sessions based on phase AND GOAL
    if (!isRecovery) {
      if (isCompletionGoal) {
        usedMiles += this.addCompletionQualitySessions(sessions, weekNumber, phase, runningDays);
      } else {
        usedMiles += this.addSpeedQualitySessions(sessions, weekNumber, phase, runningDays);
      }
    } else {
      // Recovery week: Just easy with strides
      sessions.push(this.createStridesSessionMiles(3, 'Tuesday'));
      usedMiles += 3;
    }

    // Fill remaining days with easy runs to hit target mileage
    this.fillWithEasyRunsMiles(sessions, runningDays, weeklyMiles - usedMiles);

    // Assign specific days to sessions
    return this.assignDaysToSessions(sessions, runningDays);
  }

  // ============================================================================
  // MILEAGE CALCULATIONS
  // ============================================================================

  /**
   * Calculate weekly mileage target based on week and phase
   */
  private calculateWeeklyMileage(
    weekNumber: number, 
    phase: Phase, 
    isRecovery: boolean,
    phaseStructure: PhaseStructure
  ): number {
    const mileageConfig = WEEKLY_MILEAGE[this.params.distance]?.[this.params.fitness];
    if (!mileageConfig) {
      return 30; // Default fallback
    }

    const { start, peak } = mileageConfig;
    const totalWeeks = this.params.duration_weeks;
    
    // Find taper phase
    const taperPhase = phaseStructure.phases.find(p => p.name === 'Taper');
    const taperStart = taperPhase?.start_week || totalWeeks;
    
    // Linear progression to peak (excluding taper)
    let targetMiles: number;
    if (weekNumber < taperStart) {
      const progress = (weekNumber - 1) / Math.max(1, taperStart - 2);
      targetMiles = start + (peak - start) * Math.min(1, progress);
    } else {
      // Taper: reduce from peak
      const weekInTaper = weekNumber - taperStart + 1;
      const taperWeeks = totalWeeks - taperStart + 1;
      if (weekInTaper === 1) {
        targetMiles = peak * 0.65; // First taper week: 65%
      } else {
        targetMiles = peak * 0.4; // Race week: 40%
      }
    }
    
    // Recovery week: 70% of target
    if (isRecovery) {
      targetMiles = targetMiles * 0.7;
    }
    
    return Math.round(targetMiles);
  }

  /**
   * Get long run miles for specific week
   */
  private getLongRunMiles(weekNumber: number, isRecovery: boolean): number {
    const progression = LONG_RUN_PROGRESSION[this.params.distance]?.[this.params.fitness];
    if (!progression) {
      return 10; // Default fallback
    }
    
    // Clamp week to array bounds
    const index = Math.min(weekNumber - 1, progression.length - 1);
    let miles = progression[index] || 10;
    
    // Recovery weeks already have reduced long runs in the progression
    // but ensure we don't exceed the table
    return miles;
  }

  /**
   * Get MP segment miles for Race Prep long runs
   */
  private getMPSegmentMiles(weekNumber: number, phase: Phase, isCompletion: boolean): number {
    const weekInPhase = weekNumber - phase.start_week + 1;
    
    if (isCompletion) {
      // Conservative MP segments for completion goal: 2 miles
      return 2;
    } else {
      // Progressive MP segments for speed goal: 2 → 3 → 4 miles
      return Math.min(4, 1 + weekInPhase);
    }
  }

  // ============================================================================
  // COMPLETION GOAL QUALITY SESSIONS
  // ============================================================================

  /**
   * Quality sessions for COMPLETION goal
   * Focus: Aerobic development, tempo runs, NO intervals
   * Returns miles used by quality sessions
   */
  private addCompletionQualitySessions(
    sessions: Session[], 
    weekNumber: number, 
    phase: Phase, 
    runningDays: number
  ): number {
    let mileageUsed = 0;
    
    switch (phase.name) {
      case 'Base':
        // Foundation: Fartlek and strides only
        sessions.push(this.createStridesSessionMiles(4, 'Tuesday'));
        mileageUsed += 4;
        if (runningDays >= 5 && weekNumber >= 2) {
          sessions.push(this.createFartlekSession(weekNumber));
          mileageUsed += 4; // Fartlek ~4 miles total
        }
        break;

      case 'Speed':
        // For completion goal: Tempo runs instead of intervals
        sessions.push(this.createTempoRun(weekNumber, phase));
        mileageUsed += 5; // Tempo ~5 miles with warmup/cooldown
        if (runningDays >= 5) {
          sessions.push(this.createFartlekSession(weekNumber));
          mileageUsed += 4;
        }
        break;

      case 'Race Prep':
        // Race prep for completion: Moderate tempo + race pace familiarity
        const mpMiles = this.getCompletionMPRunMiles(weekNumber, phase);
        sessions.push(this.createMarathonPaceRun(mpMiles, 'Tuesday'));
        mileageUsed += mpMiles + 2; // +2 for warmup/cooldown
        if (runningDays >= 5) {
          sessions.push(this.createTempoRun(weekNumber, phase));
          mileageUsed += 5;
        }
        break;

      case 'Taper':
        // Very easy week - just strides to stay sharp
        sessions.push(this.createStridesSessionMiles(3, 'Tuesday'));
        mileageUsed += 3;
        break;
    }
    
    return mileageUsed;
  }

  /**
   * Get MP run miles for completion goal - progressive
   */
  private getCompletionMPRunMiles(weekNumber: number, phase: Phase): number {
    const weekInPhase = weekNumber - phase.start_week + 1;
    // Progressive: 2 → 3 → 4 → 5 miles (capped at 5 for beginners)
    const maxMiles = this.params.fitness === 'beginner' ? 5 : 6;
    return Math.min(maxMiles, 1 + weekInPhase);
  }

  // ============================================================================
  // SPEED GOAL QUALITY SESSIONS
  // ============================================================================

  /**
   * Quality sessions for SPEED goal
   * Full Daniels 2Q system with intervals and threshold
   * Returns miles used
   */
  private addSpeedQualitySessions(
    sessions: Session[], 
    weekNumber: number, 
    phase: Phase, 
    runningDays: number
  ): number {
    let mileageUsed = 0;
    
    switch (phase.name) {
      case 'Base':
        // Foundation: Strides and fartlek
        sessions.push(this.createStridesSessionMiles(4, 'Tuesday'));
        mileageUsed += 4;
        if (runningDays >= 5 && weekNumber >= 2) {
          sessions.push(this.createFartlekSession(weekNumber));
          mileageUsed += 4;
        }
        break;

      case 'Speed':
        // Quality phase: Intervals + Threshold
        sessions.push(this.createIntervalSession(weekNumber, phase));
        mileageUsed += 5; // Intervals ~5 miles total
        if (runningDays >= 5) {
          sessions.push(this.createThresholdSession(weekNumber, phase));
          mileageUsed += 6; // Threshold ~6 miles
        }
        break;

      case 'Race Prep':
        // Transition phase: Race-specific work
        sessions.push(this.createRacePrepSession(weekNumber, phase));
        mileageUsed += 6;
        if (runningDays >= 5) {
          sessions.push(this.createCruiseIntervalSession(weekNumber, phase));
          mileageUsed += 6;
        }
        break;

      case 'Taper':
        // Sharpening: Light quality, reduced volume
        sessions.push(this.createTaperSharpener());
        mileageUsed += 4;
        break;
    }
    
    return mileageUsed;
  }

  // ============================================================================
  // EASY RUN FILLER - DISTANCE BASED
  // ============================================================================

  /**
   * Fill remaining days with easy runs to hit target mileage
   */
  private fillWithEasyRunsMiles(
    sessions: Session[], 
    targetDays: number,
    remainingMiles: number
  ): void {
    const remainingDays = Math.max(0, targetDays - sessions.length);
    
    if (remainingDays <= 0) return;

    // Distribute remaining miles across easy run days
    const milesPerDay = Math.max(3, Math.round(remainingMiles / remainingDays));
    
    // Clamp to reasonable range (3-7 miles for easy runs)
    const easyMiles = Math.max(3, Math.min(7, milesPerDay));
    
    for (let i = 0; i < remainingDays; i++) {
      sessions.push(this.createEasyRunMiles(easyMiles));
    }
  }

  // ============================================================================
  // WORKOUT CREATORS
  // ============================================================================

  /**
   * Tempo run for completion goal
   * Comfortably hard pace, not threshold
   */
  private createTempoRun(weekNumber: number, phase: Phase): Session {
    const weekInPhase = weekNumber - phase.start_week + 1;
    
    // Progressive tempo duration: 15 → 25 min (time-based per Daniels)
    const tempoMinutes = Math.min(25, 15 + weekInPhase * 2);

    return this.createSession(
      'Tuesday',
      'Tempo Run',
      `${tempoMinutes} minutes at comfortably hard pace (~3.5 miles)`,
      tempoMinutes + 20,
      [
        TOKEN_PATTERNS.warmup_1mi,
        TOKEN_PATTERNS.tempo_minutes(tempoMinutes),
        TOKEN_PATTERNS.cooldown_1mi
      ],
      ['moderate_run', 'tempo']
    );
  }

  /**
   * Create interval session (I-pace work) - SPEED GOAL ONLY
   * Daniels: 3-5 min intervals at VO2max pace (5K pace or slightly faster)
   */
  private createIntervalSession(weekNumber: number, phase: Phase): Session {
    const weekInPhase = weekNumber - phase.start_week + 1;
    
    // Progressive interval volume
    let reps: number;
    let distance: '800' | '1000' | '1200';
    let restSec: number;

    if (weekInPhase <= 2) {
      reps = 4 + (this.params.fitness === 'beginner' ? 0 : 1);
      distance = '800';
      restSec = 90;
    } else if (weekInPhase <= 4) {
      reps = 5 + (this.params.fitness === 'advanced' ? 1 : 0);
      distance = '800';
      restSec = 90;
    } else {
      reps = 4;
      distance = '1000';
      restSec = 120;
    }

    const intervalMiles = distance === '800' ? reps * 0.5 : reps * 0.62;
    
    return this.createSession(
      'Tuesday',
      '5K Pace Intervals',
      `${reps}×${distance}m at 5K pace (~${intervalMiles.toFixed(1)} miles of quality)`,
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
   * Create threshold session (T-pace work) - SPEED GOAL ONLY
   */
  private createThresholdSession(weekNumber: number, phase: Phase): Session {
    const weekInPhase = weekNumber - phase.start_week + 1;
    
    // Progressive tempo: 18 → 30 min
    const tempoMinutes = Math.min(30, 18 + weekInPhase * 2);

    return this.createSession(
      'Thursday',
      'Threshold Run',
      `${tempoMinutes} minutes at threshold pace (~${Math.round(tempoMinutes / 8)} miles)`,
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
   * Create race prep session - SPEED GOAL ONLY
   */
  private createRacePrepSession(weekNumber: number, phase: Phase): Session {
    const weekInPhase = weekNumber - phase.start_week + 1;
    
    if (this.params.distance === 'marathon' || this.params.distance === 'half') {
      // Limit MP work based on fitness
      const maxMpMiles = this.params.fitness === 'beginner' ? 5 : 
                         this.params.fitness === 'intermediate' ? 7 : 8;
      const mpMiles = Math.min(maxMpMiles, 3 + weekInPhase);
      
      return this.createSession(
        'Tuesday',
        'Marathon Pace Run',
        `${mpMiles} miles at goal marathon pace`,
        this.milesToMinutes(mpMiles) + 25,
        [
          TOKEN_PATTERNS.warmup_1mi,
          TOKEN_PATTERNS.mp_run_miles(mpMiles),
          TOKEN_PATTERNS.cooldown_1mi
        ],
        ['hard_run', 'marathon_pace']
      );
    } else {
      const reps = Math.min(6, 3 + weekInPhase);
      
      return this.createSession(
        'Tuesday',
        'Race Pace Intervals',
        `${reps}×1K at goal race pace (~${(reps * 0.62).toFixed(1)} miles)`,
        45,
        [
          TOKEN_PATTERNS.warmup_1mi,
          TOKEN_PATTERNS.intervals_1000(reps, 90),
          TOKEN_PATTERNS.cooldown_1mi
        ],
        ['hard_run', 'intervals']
      );
    }
  }

  /**
   * Create cruise interval session - progressive
   */
  private createCruiseIntervalSession(weekNumber: number, phase: Phase): Session {
    const weekInPhase = weekNumber - phase.start_week + 1;
    
    // Progressive: 3 → 5 × 1 mile
    const reps = Math.min(5, 2 + weekInPhase);
    
    return this.createSession(
      'Thursday',
      'Cruise Intervals',
      `${reps}×1mi at threshold pace with 60s recovery`,
      45 + reps * 2,
      [
        TOKEN_PATTERNS.warmup_1mi,
        TOKEN_PATTERNS.cruise_intervals(reps, 1),
        TOKEN_PATTERNS.cooldown_1mi
      ],
      ['hard_run', 'threshold']
    );
  }

  /**
   * Create taper sharpener session
   */
  private createTaperSharpener(): Session {
    const reps = this.params.fitness === 'beginner' ? 3 : 4;
    
    return this.createSession(
      'Tuesday',
      'Race Tune-up',
      `Light intervals: ${reps}×800m to maintain sharpness (~${(reps * 0.5).toFixed(1)} miles)`,
      35,
      [
        TOKEN_PATTERNS.warmup_1mi,
        TOKEN_PATTERNS.intervals_800(reps, 120),
        TOKEN_PATTERNS.cooldown_1mi
      ],
      ['moderate_run', 'intervals']
    );
  }

  /**
   * Create fartlek session
   */
  private createFartlekSession(weekNumber: number): Session {
    const pickups = Math.min(8, 4 + Math.floor(weekNumber / 2));
    
    return this.createSession(
      'Thursday',
      'Aerobic Fartlek',
      `${pickups}×30-60s pickups at comfortably hard effort (~4 miles total)`,
      40,
      [
        TOKEN_PATTERNS.warmup_1mi,
        TOKEN_PATTERNS.fartlek(pickups),
        TOKEN_PATTERNS.cooldown_1mi
      ],
      ['moderate_run', 'fartlek']
    );
  }
}
