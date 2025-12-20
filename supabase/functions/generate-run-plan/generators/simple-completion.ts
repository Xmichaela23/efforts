// Simple Completion Generator - Hal Higdon Inspired
// 
// Philosophy:
// - Effort-based pacing: "easy", "moderate", "comfortably hard"
// - Minimal speedwork: optional strides and light fartlek only
// - Conservative volume progression
// - Flexible schedule (3-5 days/week)
// - Focus on finishing healthy and enjoying the journey
//
// Based on principles from Hal Higdon's training approach.
// This is an adaptation and not officially endorsed by Hal Higdon.

import { BaseGenerator } from './base-generator.ts';
import { TrainingPlan, Session, Phase, PhaseStructure, TOKEN_PATTERNS } from '../types.ts';

// Long run progression by fitness level (in miles)
// Conservative progression focused on completion
const LONG_RUN_PROGRESSION: Record<string, Record<string, number[]>> = {
  'marathon': {
    'beginner': [
      6, 7, 8, 5,       // Weeks 1-4 (recovery at 4)
      9, 10, 11, 7,     // Weeks 5-8 (recovery at 8)
      12, 13, 14, 10,   // Weeks 9-12 (recovery at 12)
      16, 18, 20, 8     // Weeks 13-16 (peak at 15, taper at 16)
    ],
    'intermediate': [
      8, 10, 12, 8,     // Weeks 1-4
      13, 14, 15, 10,   // Weeks 5-8
      16, 17, 18, 12,   // Weeks 9-12
      18, 20, 20, 10    // Weeks 13-16
    ],
    'advanced': [
      10, 12, 14, 10,   // Weeks 1-4
      15, 16, 17, 12,   // Weeks 5-8
      18, 19, 20, 14,   // Weeks 9-12
      20, 20, 20, 12    // Weeks 13-16
    ]
  },
  'half': {
    'beginner': [5, 6, 7, 5, 8, 9, 10, 7, 10, 11, 12, 6],
    'intermediate': [6, 8, 9, 6, 10, 11, 12, 8, 12, 13, 14, 8],
    'advanced': [8, 10, 11, 8, 12, 13, 14, 10, 14, 14, 14, 10]
  },
  '10k': {
    'beginner': [4, 5, 5, 4, 6, 6, 7, 5, 7, 8, 8, 5],
    'intermediate': [5, 6, 7, 5, 7, 8, 9, 6, 9, 10, 10, 6],
    'advanced': [7, 8, 9, 7, 9, 10, 11, 8, 11, 12, 12, 8]
  },
  '5k': {
    'beginner': [3, 4, 4, 3, 5, 5, 6, 4, 6, 6, 6, 4],
    'intermediate': [4, 5, 5, 4, 6, 6, 7, 5, 7, 8, 8, 5],
    'advanced': [5, 6, 7, 5, 7, 8, 8, 6, 8, 9, 9, 6]
  }
};

// Weekly mileage targets (conservative for completion)
const WEEKLY_MILEAGE: Record<string, Record<string, { start: number; peak: number }>> = {
  'marathon': {
    'beginner': { start: 20, peak: 40 },
    'intermediate': { start: 30, peak: 50 },
    'advanced': { start: 40, peak: 60 }
  },
  'half': {
    'beginner': { start: 15, peak: 30 },
    'intermediate': { start: 25, peak: 40 },
    'advanced': { start: 35, peak: 50 }
  },
  '10k': {
    'beginner': { start: 12, peak: 25 },
    'intermediate': { start: 20, peak: 35 },
    'advanced': { start: 30, peak: 45 }
  },
  '5k': {
    'beginner': { start: 10, peak: 20 },
    'intermediate': { start: 15, peak: 28 },
    'advanced': { start: 25, peak: 40 }
  }
};

export class SimpleCompletionGenerator extends BaseGenerator {
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
        run: ['easyPace'] // Only need easy pace - effort-based training
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
    return `${distance} Completion Plan - ${this.params.duration_weeks} Weeks`;
  }

  protected generatePlanDescription(): string {
    return `A ${this.params.duration_weeks}-week plan designed to get you to the finish line healthy and confident. ` +
      `Uses effort-based pacing (no complicated pace charts) with optional light speedwork. ` +
      `Based on progressive training principles.`;
  }

  private generateWeekSessions(
    weekNumber: number,
    phase: Phase,
    phaseStructure: PhaseStructure,
    isRecovery: boolean
  ): Session[] {
    const sessions: Session[] = [];
    const runningDays = this.getRunningDays();

    // Get target weekly mileage
    const weeklyMiles = this.calculateWeeklyMileage(weekNumber, phase, isRecovery, phaseStructure);
    
    // Get long run distance
    const longRunMiles = this.getLongRunMiles(weekNumber);
    
    // Long run (always on Sunday)
    sessions.push(this.createSimpleLongRun(longRunMiles));

    let usedMiles = longRunMiles;

    // Add optional speedwork (not in recovery weeks or taper)
    if (!isRecovery && phase.name !== 'Taper') {
      // Light speedwork: strides or fartlek (only 1x per week, optional feel)
      if (weekNumber >= 3 && runningDays >= 4) {
        const speedworkMiles = 4;
        sessions.push(this.createOptionalSpeedwork(weekNumber, phase));
        usedMiles += speedworkMiles;
      }
    }

    // Fill remaining days with easy runs
    this.fillWithSimpleEasyRuns(sessions, runningDays, weeklyMiles - usedMiles);

    // Assign days
    return this.assignDaysToSessions(sessions, runningDays);
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
    if (!mileageConfig) return 25;

    const { start, peak } = mileageConfig;
    const totalWeeks = this.params.duration_weeks;
    
    const taperPhase = phaseStructure.phases.find(p => p.name === 'Taper');
    const taperStart = taperPhase?.start_week || totalWeeks;
    
    let targetMiles: number;
    if (weekNumber < taperStart) {
      const progress = (weekNumber - 1) / Math.max(1, taperStart - 2);
      targetMiles = start + (peak - start) * Math.min(1, progress);
    } else {
      // Taper: significant reduction
      targetMiles = peak * 0.5;
    }
    
    if (isRecovery) {
      targetMiles = targetMiles * 0.7;
    }
    
    return Math.round(targetMiles);
  }

  private getLongRunMiles(weekNumber: number): number {
    const progression = LONG_RUN_PROGRESSION[this.params.distance]?.[this.params.fitness];
    if (!progression) return 10;
    
    const index = Math.min(weekNumber - 1, progression.length - 1);
    return progression[index] || 10;
  }

  // ============================================================================
  // WORKOUT CREATORS - SIMPLE, EFFORT-BASED
  // ============================================================================

  /**
   * Create simple long run - effort-based description
   */
  private createSimpleLongRun(miles: number): Session {
    const duration = this.milesToMinutes(miles);
    
    return this.createSession(
      'Sunday',
      'Long Run',
      `${miles} miles at easy, conversational pace. You should be able to talk in full sentences throughout. Focus on time on your feet, not speed.`,
      duration,
      [TOKEN_PATTERNS.long_run_miles(miles)],
      ['long_run']
    );
  }

  /**
   * Create optional speedwork - strides or light fartlek
   * Description emphasizes "optional" and "fun"
   */
  private createOptionalSpeedwork(weekNumber: number, phase: Phase): Session {
    // Alternate between strides and fartlek
    const useStrides = weekNumber % 2 === 0;
    
    if (useStrides) {
      return this.createSession(
        'Tuesday',
        'Easy Run + Strides',
        `4 miles easy, then 6×100m strides (quick but relaxed sprints with full recovery). Strides are optional - skip if tired. Focus on good form and having fun.`,
        this.milesToMinutes(4) + 10,
        [TOKEN_PATTERNS.easy_run_miles(4), TOKEN_PATTERNS.strides_4x100m],
        ['easy_run', 'strides']
      );
    } else {
      const pickups = Math.min(8, 5 + Math.floor(weekNumber / 4));
      return this.createSession(
        'Tuesday',
        'Fartlek Run',
        `4 miles with ${pickups} pick-ups: run comfortably hard for 30-60 seconds when you feel like it, then easy jog to recover. No watch needed - run by feel and enjoy it!`,
        this.milesToMinutes(4) + 5,
        [TOKEN_PATTERNS.fartlek(pickups)],
        ['easy_run', 'fartlek']
      );
    }
  }

  /**
   * Create simple easy run - effort-based
   */
  private createSimpleEasyRun(miles: number, day: string = ''): Session {
    const duration = this.milesToMinutes(miles);
    
    const descriptions = [
      `${miles} miles at easy, conversational pace.`,
      `${miles} miles nice and easy. Enjoy the run!`,
      `${miles} miles at a comfortable effort. Chat with a friend or enjoy some music.`
    ];
    
    const description = descriptions[Math.floor(Math.random() * descriptions.length)];
    
    return this.createSession(
      day,
      'Easy Run',
      description,
      duration,
      [TOKEN_PATTERNS.easy_run_miles(miles)],
      ['easy_run']
    );
  }

  /**
   * Fill remaining days with easy runs
   */
  private fillWithSimpleEasyRuns(
    sessions: Session[], 
    targetDays: number,
    remainingMiles: number
  ): void {
    const remainingDays = Math.max(0, targetDays - sessions.length);
    if (remainingDays <= 0) return;

    const milesPerDay = Math.max(3, Math.round(remainingMiles / remainingDays));
    const easyMiles = Math.max(3, Math.min(6, milesPerDay)); // Cap at 6 miles for easy runs
    
    for (let i = 0; i < remainingDays; i++) {
      sessions.push(this.createSimpleEasyRun(easyMiles));
    }
  }
}
