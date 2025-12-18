// Balanced Build Generator - Jack Daniels Inspired
// 
// Philosophy:
// - VDOT-based pacing (all paces derived from 5K time)
// - Phase-based: Foundation → Early Quality → Transition Quality → Taper
// - 2Q System: Two quality workouts per week, rest is easy running
// - Quality limits: No single workout exceeds 10K of interval work

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
    const weekVolume = this.calculateWeekVolume(weekNumber, phase, phaseStructure);

    // Calculate long run duration
    const longRunMiles = Math.min(weekVolume * 0.28, this.getLongRunCap());
    const longRunMinutes = this.roundToFiveMinutes(this.milesToMinutes(longRunMiles));

    // Long run (always on Sunday)
    const withMP = phase.name === 'Race Prep' && !isRecovery && 
                   (this.params.distance === 'marathon' || this.params.distance === 'half');
    const mpMinutes = withMP ? Math.round(longRunMinutes * 0.15) : 0;
    
    sessions.push(this.createLongRun(
      isRecovery ? Math.round(longRunMinutes * 0.7) : longRunMinutes,
      'Sunday',
      withMP,
      mpMinutes
    ));

    // Quality sessions based on phase (Daniels 2Q system)
    if (!isRecovery) {
      switch (phase.name) {
        case 'Base':
          // Foundation phase: Build aerobic base with strides and light fartlek
          sessions.push(this.createStridesSession(35, 'Tuesday'));
          if (runningDays >= 5) {
            // Add fartlek or hill strides for variety in Base phase
            if (weekNumber >= 2) {
              sessions.push(this.createBaseFartlek(weekNumber));
            } else {
              sessions.push(this.createStridesSession(30, 'Thursday'));
            }
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
            sessions.push(this.createCruiseIntervalSession(weekNumber));
          }
          break;

        case 'Taper':
          // Sharpening: Light quality, reduced volume
          sessions.push(this.createTaperSharpener());
          break;
      }
    } else {
      // Recovery week: Just easy with strides
      sessions.push(this.createStridesSession(30, 'Tuesday'));
    }

    // Fill remaining days with easy runs
    const remainingVolume = weekVolume - sessions.reduce((sum, s) => 
      sum + (s.duration / (this.milesToMinutes(1) || 9)), 0
    );
    const remainingDays = runningDays - sessions.length;
    
    if (remainingDays > 0 && remainingVolume > 0) {
      const easyMilesEach = remainingVolume / remainingDays;
      const easyMinutes = this.roundToFiveMinutes(this.milesToMinutes(easyMilesEach));
      
      for (let i = 0; i < remainingDays; i++) {
        sessions.push(this.createEasyRun(Math.max(25, easyMinutes)));
      }
    }

    // Assign specific days to sessions
    return this.assignDaysToSessions(sessions, runningDays);
  }

  // ============================================================================
  // DANIELS-STYLE WORKOUT CREATION
  // ============================================================================

  /**
   * Create interval session (I-pace work)
   * Daniels: 3-5 min intervals at VO2max pace (5K pace or slightly faster)
   */
  private createIntervalSession(weekNumber: number, phase: Phase): Session {
    const weekInPhase = weekNumber - phase.start_week + 1;
    
    // Progressive interval volume (Daniels style)
    // Start with shorter intervals, progress to longer
    let reps: number;
    let distance: '800' | '1000' | '1200' | '1mi';
    let restSec: number;

    if (weekInPhase <= 2) {
      // Early: 5-6 x 800m with 90s rest
      reps = 5;
      distance = '800';
      restSec = 90;
    } else if (weekInPhase <= 4) {
      // Mid: 6 x 800m or 5 x 1000m
      reps = 6;
      distance = '800';
      restSec = 90;
    } else {
      // Late: Mix of 800m and mile reps
      reps = 4;
      distance = '1000';
      restSec = 120;
    }

    const tokens: string[] = [
      TOKEN_PATTERNS.warmup_quality_12min,
      distance === '800' 
        ? TOKEN_PATTERNS.intervals_800(reps, restSec)
        : distance === '1000'
          ? TOKEN_PATTERNS.intervals_1000(reps, restSec)
          : TOKEN_PATTERNS.intervals_1mi(reps, 2),
      TOKEN_PATTERNS.cooldown_easy_10min
    ];

    return this.createSession(
      'Tuesday',
      '5K Pace Intervals',
      `Develop VO2max with ${reps}x${distance} at 5K pace`,
      50,
      tokens,
      ['hard_run', 'intervals']
    );
  }

  /**
   * Create threshold session (T-pace work)
   * Daniels: Sustained tempo at lactate threshold (comfortably hard)
   */
  private createThresholdSession(weekNumber: number, phase: Phase): Session {
    const weekInPhase = weekNumber - phase.start_week + 1;
    
    // Progressive tempo duration
    let tempoMinutes: number;
    if (weekInPhase <= 2) {
      tempoMinutes = 20;
    } else if (weekInPhase <= 4) {
      tempoMinutes = 25;
    } else {
      tempoMinutes = 30;
    }

    const tokens: string[] = [
      TOKEN_PATTERNS.warmup_quality_12min,
      TOKEN_PATTERNS.tempo_minutes(tempoMinutes),
      TOKEN_PATTERNS.cooldown_easy_10min
    ];

    return this.createSession(
      'Thursday',
      'Threshold Run',
      `Continuous tempo at threshold pace for ${tempoMinutes} minutes`,
      tempoMinutes + 25,
      tokens,
      ['hard_run', 'tempo', 'threshold']
    );
  }

  /**
   * Create race prep session
   * Focus on race-specific pace work
   */
  private createRacePrepSession(weekNumber: number, phase: Phase): Session {
    const weekInPhase = weekNumber - phase.start_week + 1;
    
    // Marathon/Half: Marathon pace work
    // 10K/5K: Race pace intervals
    if (this.params.distance === 'marathon' || this.params.distance === 'half') {
      const mpMiles = 4 + weekInPhase;
      
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
      // 5K/10K: Race pace intervals
      const reps = 3 + weekInPhase;
      
      return this.createSession(
        'Tuesday',
        'Race Pace Intervals',
        `${reps}x1K at goal race pace`,
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
   * Create cruise interval session
   * Daniels: T-pace intervals with short rest
   */
  private createCruiseIntervalSession(weekNumber: number): Session {
    // Cruise intervals: 3-4 x 1 mile at T pace with 1 min rest
    const reps = weekNumber < 8 ? 3 : 4;
    
    return this.createSession(
      'Thursday',
      'Cruise Intervals',
      `${reps}x1mi at threshold pace with short recovery`,
      50,
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
   * Light quality work to maintain speed
   */
  private createTaperSharpener(): Session {
    return this.createSession(
      'Tuesday',
      'Race Tune-up',
      'Light intervals to maintain sharpness',
      35,
      [
        TOKEN_PATTERNS.warmup_quality_12min,
        TOKEN_PATTERNS.intervals_800(4, 120),
        TOKEN_PATTERNS.cooldown_easy_10min
      ],
      ['hard_run', 'intervals']
    );
  }

  /**
   * Create base phase fartlek session
   * Unstructured speed play to build aerobic capacity
   */
  private createBaseFartlek(weekNumber: number): Session {
    const pickups = 4 + Math.min(weekNumber, 4); // 5-8 pickups as weeks progress
    
    return this.createSession(
      'Thursday',
      'Aerobic Fartlek',
      `${pickups}x30-60s pickups at comfortably hard effort with easy jogging recovery`,
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
