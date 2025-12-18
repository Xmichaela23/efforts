// Balanced Build Generator - Jack Daniels Inspired
// 
// Philosophy:
// - VDOT-based pacing (all paces derived from 5K time)
// - Phase-based: Foundation → Early Quality → Transition Quality → Taper
// - 2Q System: Two quality workouts per week, rest is easy running
// - Quality limits: No single workout exceeds 10K of interval work
// - GOAL-BASED: "complete" vs "speed" determines workout types

import { BaseGenerator } from './base-generator.ts';
import { TrainingPlan, Session, Phase, PhaseStructure, TOKEN_PATTERNS } from '../types.ts';

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

    // Calculate long run with SMOOTH progression
    const longRunMinutes = this.calculateLongRunMinutes(weekNumber, phase, isRecovery, phaseStructure);
    
    // Long run (always on Sunday)
    const withMP = phase.name === 'Race Prep' && !isRecovery && !isCompletionGoal &&
                   (this.params.distance === 'marathon' || this.params.distance === 'half');
    const mpMinutes = withMP ? Math.round(longRunMinutes * 0.15) : 0;
    
    sessions.push(this.createLongRun(longRunMinutes, 'Sunday', withMP, mpMinutes));

    // Quality sessions based on phase AND GOAL
    if (!isRecovery) {
      if (isCompletionGoal) {
        // COMPLETION GOAL: No intervals, focus on aerobic development
        this.addCompletionQualitySessions(sessions, weekNumber, phase, runningDays);
      } else {
        // SPEED GOAL: Full Daniels 2Q system
        this.addSpeedQualitySessions(sessions, weekNumber, phase, runningDays);
      }
    } else {
      // Recovery week: Just easy with strides
      sessions.push(this.createStridesSession(30, 'Tuesday'));
    }

    // Fill remaining days with easy runs
    this.fillWithEasyRuns(sessions, runningDays, weekNumber, phase, phaseStructure);

    // Assign specific days to sessions
    return this.assignDaysToSessions(sessions, runningDays);
  }

  // ============================================================================
  // LONG RUN PROGRESSION
  // ============================================================================

  /**
   * Calculate long run duration with SMOOTH linear progression
   */
  private calculateLongRunMinutes(
    weekNumber: number, 
    phase: Phase, 
    isRecovery: boolean,
    phaseStructure: PhaseStructure
  ): number {
    const totalWeeks = this.params.duration_weeks;
    const isCompletionGoal = this.params.goal === 'complete';
    
    // Peak long run based on distance and fitness
    const peakMinutes = this.getPeakLongRunMinutes();
    
    // Starting long run (week 1)
    const startMinutes = this.getStartingLongRunMinutes();
    
    // Find peak week (2-3 weeks before end for taper)
    const taperWeeks = phase.name === 'Taper' ? phaseStructure.phases.find(p => p.name === 'Taper')?.weeks_in_phase || 2 : 0;
    const peakWeek = totalWeeks - taperWeeks - 1;
    
    // Linear progression to peak
    let targetMinutes: number;
    if (weekNumber <= peakWeek) {
      const progress = (weekNumber - 1) / Math.max(1, peakWeek - 1);
      targetMinutes = startMinutes + (peakMinutes - startMinutes) * progress;
    } else {
      // Taper: reduce from peak
      const taperProgress = (weekNumber - peakWeek) / taperWeeks;
      targetMinutes = peakMinutes * (1 - taperProgress * 0.4); // 40% reduction by race week
    }
    
    // Recovery week: 30% reduction
    if (isRecovery) {
      targetMinutes = targetMinutes * 0.7;
    }
    
    return this.roundToFiveMinutes(Math.max(40, targetMinutes));
  }

  private getPeakLongRunMinutes(): number {
    const fitness = this.params.fitness;
    const distance = this.params.distance;
    
    // Peak long run in minutes based on distance and fitness
    const peaks: Record<string, Record<string, number>> = {
      'marathon': { 'beginner': 150, 'intermediate': 165, 'advanced': 180 }, // 2.5-3 hours
      'half': { 'beginner': 100, 'intermediate': 110, 'advanced': 120 },
      '10k': { 'beginner': 70, 'intermediate': 80, 'advanced': 90 },
      '5k': { 'beginner': 55, 'intermediate': 65, 'advanced': 75 }
    };
    
    return peaks[distance]?.[fitness] || 120;
  }

  private getStartingLongRunMinutes(): number {
    const fitness = this.params.fitness;
    
    // Starting long run based on fitness
    const starts: Record<string, number> = {
      'beginner': 50,
      'intermediate': 70,
      'advanced': 90
    };
    
    return starts[fitness] || 60;
  }

  // ============================================================================
  // COMPLETION GOAL QUALITY SESSIONS
  // ============================================================================

  /**
   * Quality sessions for COMPLETION goal
   * Focus: Aerobic development, tempo runs, NO intervals
   */
  private addCompletionQualitySessions(
    sessions: Session[], 
    weekNumber: number, 
    phase: Phase, 
    runningDays: number
  ): void {
    switch (phase.name) {
      case 'Base':
        // Foundation: Fartlek and strides only
        sessions.push(this.createStridesSession(35, 'Tuesday'));
        if (runningDays >= 5 && weekNumber >= 2) {
          sessions.push(this.createBaseFartlek(weekNumber));
        }
        break;

      case 'Speed':
        // For completion goal: Tempo runs instead of intervals
        sessions.push(this.createTempoRun(weekNumber, phase));
        if (runningDays >= 5) {
          sessions.push(this.createBaseFartlek(weekNumber));
        }
        break;

      case 'Race Prep':
        // Race prep for completion: Moderate tempo + race pace familiarity
        sessions.push(this.createCompletionRacePrepSession(weekNumber, phase));
        if (runningDays >= 5) {
          sessions.push(this.createTempoRun(weekNumber, phase));
        }
        break;

      case 'Taper':
        // Light fartlek to stay fresh
        sessions.push(this.createBaseFartlek(weekNumber));
        break;
    }
  }

  // ============================================================================
  // SPEED GOAL QUALITY SESSIONS
  // ============================================================================

  /**
   * Quality sessions for SPEED goal
   * Full Daniels 2Q system with intervals and threshold
   */
  private addSpeedQualitySessions(
    sessions: Session[], 
    weekNumber: number, 
    phase: Phase, 
    runningDays: number
  ): void {
    switch (phase.name) {
      case 'Base':
        // Foundation: Strides and fartlek
        sessions.push(this.createStridesSession(35, 'Tuesday'));
        if (runningDays >= 5 && weekNumber >= 2) {
          sessions.push(this.createBaseFartlek(weekNumber));
        }
        break;

      case 'Speed':
        // Quality phase: Intervals + Threshold
        sessions.push(this.createIntervalSession(weekNumber, phase));
        if (runningDays >= 5) {
          sessions.push(this.createThresholdSession(weekNumber, phase));
        }
        break;

      case 'Race Prep':
        // Transition phase: Race-specific work
        sessions.push(this.createRacePrepSession(weekNumber, phase));
        if (runningDays >= 5) {
          sessions.push(this.createCruiseIntervalSession(weekNumber, phase));
        }
        break;

      case 'Taper':
        // Sharpening: Light quality, reduced volume
        sessions.push(this.createTaperSharpener());
        break;
    }
  }

  // ============================================================================
  // EASY RUN FILLER
  // ============================================================================

  private fillWithEasyRuns(
    sessions: Session[], 
    runningDays: number,
    weekNumber: number,
    phase: Phase,
    phaseStructure: PhaseStructure
  ): void {
    const weekVolume = this.calculateWeekVolume(weekNumber, phase, phaseStructure);
    const usedVolume = sessions.reduce((sum, s) => sum + (s.duration / 9), 0); // rough miles estimate
    const remainingVolume = Math.max(0, weekVolume - usedVolume);
    const remainingDays = Math.max(0, runningDays - sessions.length);
    
    if (remainingDays > 0 && remainingVolume > 0) {
      const easyMilesEach = remainingVolume / remainingDays;
      const easyMinutes = this.roundToFiveMinutes(this.milesToMinutes(easyMilesEach));
      
      for (let i = 0; i < remainingDays; i++) {
        sessions.push(this.createEasyRun(Math.max(25, Math.min(60, easyMinutes))));
      }
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
    
    // Progressive tempo duration: 15 → 25 min
    const tempoMinutes = Math.min(25, 15 + weekInPhase * 2);

    return this.createSession(
      'Tuesday',
      'Tempo Run',
      `${tempoMinutes} minutes at comfortably hard pace`,
      tempoMinutes + 20,
      [
        TOKEN_PATTERNS.warmup_easy_10min,
        TOKEN_PATTERNS.tempo_minutes(tempoMinutes),
        TOKEN_PATTERNS.cooldown_easy_10min
      ],
      ['moderate_run', 'tempo']
    );
  }

  /**
   * Race prep for completion goal
   * Short marathon pace segments for familiarity
   */
  private createCompletionRacePrepSession(weekNumber: number, phase: Phase): Session {
    const weekInPhase = weekNumber - phase.start_week + 1;
    
    // Short MP work: 2-4 miles max for beginners
    const mpMiles = Math.min(4, 2 + weekInPhase);
    
    if (this.params.distance === 'marathon' || this.params.distance === 'half') {
      return this.createSession(
        'Tuesday',
        'Goal Pace Practice',
        `${mpMiles} miles at goal race pace for familiarity`,
        this.milesToMinutes(mpMiles) + 20,
        [
          TOKEN_PATTERNS.warmup_easy_10min,
          TOKEN_PATTERNS.tempo_miles(mpMiles),
          TOKEN_PATTERNS.cooldown_easy_10min
        ],
        ['moderate_run', 'race_pace']
      );
    } else {
      return this.createTempoRun(weekNumber, phase);
    }
  }

  /**
   * Create interval session (I-pace work) - SPEED GOAL ONLY
   * Daniels: 3-5 min intervals at VO2max pace (5K pace or slightly faster)
   */
  private createIntervalSession(weekNumber: number, phase: Phase): Session {
    const weekInPhase = weekNumber - phase.start_week + 1;
    
    // Progressive interval volume (Daniels style)
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

    const tokens: string[] = [
      TOKEN_PATTERNS.warmup_quality_12min,
      distance === '800' 
        ? TOKEN_PATTERNS.intervals_800(reps, restSec)
        : TOKEN_PATTERNS.intervals_1000(reps, restSec),
      TOKEN_PATTERNS.cooldown_easy_10min
    ];

    return this.createSession(
      'Tuesday',
      '5K Pace Intervals',
      `${reps}×${distance}m at 5K pace with ${restSec}s recovery`,
      50,
      tokens,
      ['hard_run', 'intervals', 'vo2max']
    );
  }

  /**
   * Create threshold session (T-pace work) - SPEED GOAL ONLY
   */
  private createThresholdSession(weekNumber: number, phase: Phase): Session {
    const weekInPhase = weekNumber - phase.start_week + 1;
    
    // Progressive tempo duration
    const tempoMinutes = Math.min(30, 18 + weekInPhase * 2);

    return this.createSession(
      'Thursday',
      'Threshold Run',
      `${tempoMinutes} minutes at threshold pace`,
      tempoMinutes + 25,
      [
        TOKEN_PATTERNS.warmup_quality_12min,
        TOKEN_PATTERNS.tempo_minutes(tempoMinutes),
        TOKEN_PATTERNS.cooldown_easy_10min
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
          TOKEN_PATTERNS.warmup_quality_12min,
          TOKEN_PATTERNS.tempo_miles(mpMiles),
          TOKEN_PATTERNS.cooldown_easy_10min
        ],
        ['hard_run', 'marathon_pace']
      );
    } else {
      const reps = Math.min(6, 3 + weekInPhase);
      
      return this.createSession(
        'Tuesday',
        'Race Pace Intervals',
        `${reps}×1K at goal race pace`,
        45,
        [
          TOKEN_PATTERNS.warmup_quality_12min,
          TOKEN_PATTERNS.intervals_1000(reps, 90),
          TOKEN_PATTERNS.cooldown_easy_10min
        ],
        ['hard_run', 'intervals']
      );
    }
  }

  /**
   * Create cruise interval session - with PROGRESSION
   */
  private createCruiseIntervalSession(weekNumber: number, phase: Phase): Session {
    const weekInPhase = weekNumber - phase.start_week + 1;
    
    // Progressive cruise intervals: 3 → 5 x 1 mile
    const reps = Math.min(5, 2 + weekInPhase);
    
    return this.createSession(
      'Thursday',
      'Cruise Intervals',
      `${reps}×1mi at threshold pace with 60s recovery`,
      45 + reps * 2,
      [
        TOKEN_PATTERNS.warmup_quality_12min,
        TOKEN_PATTERNS.cruise_intervals(reps, 1),
        TOKEN_PATTERNS.cooldown_easy_10min
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
      `Light intervals: ${reps}×800m to maintain sharpness`,
      35,
      [
        TOKEN_PATTERNS.warmup_quality_12min,
        TOKEN_PATTERNS.intervals_800(reps, 120),
        TOKEN_PATTERNS.cooldown_easy_10min
      ],
      ['moderate_run', 'intervals']
    );
  }

  /**
   * Create base phase fartlek session
   */
  private createBaseFartlek(weekNumber: number): Session {
    const pickups = Math.min(8, 4 + Math.floor(weekNumber / 2));
    
    return this.createSession(
      'Thursday',
      'Aerobic Fartlek',
      `${pickups}×30-60s pickups at comfortably hard effort`,
      40,
      [
        TOKEN_PATTERNS.warmup_easy_10min,
        `fartlek_${pickups}x30-60s_moderate`,
        TOKEN_PATTERNS.cooldown_easy_10min
      ],
      ['moderate_run', 'fartlek']
    );
  }
}
