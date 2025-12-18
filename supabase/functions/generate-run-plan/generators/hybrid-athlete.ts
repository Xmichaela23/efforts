// Hybrid Athlete Generator
// 
// Philosophy:
// - Strength training integrated from day one
// - Interference management: Never strength on quality run days
// - Phase-based strength periodization
// - Build complete athlete with proper recovery

import { BaseGenerator } from './base-generator.ts';
import { TrainingPlan, Session, StrengthExercise, Phase, PhaseStructure, TOKEN_PATTERNS } from '../types.ts';

export class HybridAthleteGenerator extends BaseGenerator {
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
      description: this.generateHybridDescription(),
      duration_weeks: this.params.duration_weeks,
      units: 'imperial',
      baselines_required: {
        run: ['fiveK_pace', 'easyPace'],
        strength: ['squat', 'deadlift', 'bench', 'overheadPress1RM']
      },
      weekly_summaries,
      sessions_by_week
    };
  }

  private generateHybridDescription(): string {
    return `Hybrid athlete plan combining structured run training with integrated strength work. ` +
      `Strength sessions are strategically placed to minimize interference with running quality. ` +
      `Features progressive strength loading in base phase, maintenance during build, and reduction in taper.`;
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

    // Hybrid structure:
    // Monday: Strength (Upper/Full)
    // Tuesday: Quality Run
    // Wednesday: Easy Run or Recovery
    // Thursday: Easy Run (before Friday strength)
    // Friday: Strength (Lower) - NOT before long run
    // Saturday: Easy Run or Rest
    // Sunday: Long Run

    // 1. LONG RUN (Sunday)
    const longRunMiles = Math.min(weekVolume * 0.28, this.getLongRunCap());
    const longRunMinutes = this.roundToFiveMinutes(this.milesToMinutes(
      isRecovery ? longRunMiles * 0.7 : longRunMiles
    ));
    sessions.push(this.createLongRun(longRunMinutes, 'Sunday'));

    // 2. QUALITY RUN (Tuesday - after Monday strength recovery)
    if (!isRecovery && phase.name !== 'Taper') {
      if (phase.name === 'Base') {
        sessions.push(this.createStridesSession(40, 'Tuesday'));
      } else if (phase.name === 'Speed') {
        sessions.push(this.createIntervalSession(week, phase));
      } else {
        sessions.push(this.createTempoSession(week, phase));
      }
    } else {
      sessions.push(this.createEasyRun(35, 'Tuesday'));
    }

    // 3. STRENGTH SESSIONS (based on phase)
    const strengthFrequency = this.getStrengthFrequencyForPhase(phase.name, isRecovery);
    
    if (strengthFrequency >= 1) {
      sessions.push(this.createUpperStrengthSession(phase, isRecovery));
    }
    
    if (strengthFrequency >= 2) {
      // Lower body on Friday (not before long run on Sunday, gives 1 full day recovery)
      sessions.push(this.createLowerStrengthSession(phase, isRecovery));
    }

    // 4. EASY RUNS to fill remaining days
    const remainingVolume = weekVolume - sessions
      .filter(s => s.type === 'run')
      .reduce((sum, s) => sum + (s.duration / (this.milesToMinutes(1) || 9)), 0);
    
    const usedDays = sessions.length;
    const remainingDays = runningDays - sessions.filter(s => s.type === 'run').length;
    
    if (remainingDays > 0 && remainingVolume > 0) {
      const easyMiles = remainingVolume / remainingDays;
      const easyMinutes = this.roundToFiveMinutes(this.milesToMinutes(easyMiles));
      
      for (let i = 0; i < remainingDays; i++) {
        sessions.push(this.createEasyRun(Math.max(25, Math.min(45, easyMinutes))));
      }
    }

    return this.assignDaysToSessionsWithStrength(sessions, runningDays + strengthFrequency);
  }

  // ============================================================================
  // HYBRID-SPECIFIC METHODS
  // ============================================================================

  /**
   * Get strength frequency based on training phase
   */
  private getStrengthFrequencyForPhase(phaseName: string, isRecovery: boolean): number {
    if (isRecovery) return 1; // Always reduce in recovery weeks

    switch (phaseName) {
      case 'Base':
        return 2; // Build strength foundation
      case 'Speed':
        return 2; // Maintain
      case 'Race Prep':
        return 1; // Reduce, prioritize running
      case 'Taper':
        return 0; // None or very light
      default:
        return 1;
    }
  }

  /**
   * Get strength intensity based on phase
   */
  private getStrengthIntensity(phaseName: string, isRecovery: boolean): { percent: number; sets: number; reps: number } {
    if (isRecovery) {
      return { percent: 65, sets: 3, reps: 8 };
    }

    switch (phaseName) {
      case 'Base':
        return { percent: 75, sets: 4, reps: 6 };
      case 'Speed':
        return { percent: 72, sets: 3, reps: 6 };
      case 'Race Prep':
        return { percent: 68, sets: 3, reps: 5 };
      case 'Taper':
        return { percent: 60, sets: 2, reps: 5 };
      default:
        return { percent: 70, sets: 3, reps: 6 };
    }
  }

  /**
   * Create upper body strength session
   */
  private createUpperStrengthSession(phase: Phase, isRecovery: boolean): Session {
    const intensity = this.getStrengthIntensity(phase.name, isRecovery);
    
    const exercises: StrengthExercise[] = [
      { name: 'Bench Press', sets: intensity.sets, reps: intensity.reps, weight: `${intensity.percent}% 1RM` },
      { name: 'Barbell Row', sets: intensity.sets, reps: intensity.reps + 2, weight: `${intensity.percent - 5}% 1RM` },
      { name: 'Overhead Press', sets: intensity.sets - 1, reps: intensity.reps, weight: `${intensity.percent - 5}% 1RM` },
      { name: 'Pull-ups', sets: 3, reps: 'AMRAP', weight: 'Bodyweight' },
      { name: 'Face Pulls', sets: 3, reps: 15, weight: '30% 1RM' }
    ];

    return {
      day: 'Monday',
      type: 'strength',
      name: 'Upper Body Strength',
      description: `Build and maintain upper body strength (${phase.name} phase)`,
      duration: 45,
      strength_exercises: exercises,
      tags: ['strength', 'upper_body']
    };
  }

  /**
   * Create lower body strength session
   */
  private createLowerStrengthSession(phase: Phase, isRecovery: boolean): Session {
    const intensity = this.getStrengthIntensity(phase.name, isRecovery);
    
    const exercises: StrengthExercise[] = [
      { name: 'Back Squat', sets: intensity.sets, reps: intensity.reps, weight: `${intensity.percent}% 1RM` },
      { name: 'Romanian Deadlift', sets: intensity.sets - 1, reps: intensity.reps + 2, weight: `${intensity.percent - 10}% 1RM` },
      { name: 'Bulgarian Split Squat', sets: 3, reps: 8, weight: 'Bodyweight' },
      { name: 'Hip Thrusts', sets: 3, reps: 10, weight: `${intensity.percent - 5}% 1RM` },
      { name: 'Single Leg RDL', sets: 3, reps: 8, weight: 'Bodyweight' }
    ];

    return {
      day: 'Friday',
      type: 'strength',
      name: 'Lower Body Strength',
      description: `Runner-focused lower body strength (${phase.name} phase)`,
      duration: 45,
      strength_exercises: exercises,
      tags: ['strength', 'lower_body']
    };
  }

  /**
   * Create interval session for hybrid athlete
   */
  private createIntervalSession(week: number, phase: Phase): Session {
    const weekInPhase = week - phase.start_week + 1;
    
    // Slightly reduced volume compared to pure running plans
    // Account for strength training fatigue
    const reps = 4 + Math.min(2, Math.floor(weekInPhase / 2));
    
    return this.createSession(
      'Tuesday',
      '5K Pace Intervals',
      `${reps}x800m at 5K pace - hybrid athlete volume`,
      45,
      [
        TOKEN_PATTERNS.warmup_quality_12min,
        TOKEN_PATTERNS.intervals_800(reps, 120),
        TOKEN_PATTERNS.cooldown_easy_10min
      ],
      ['hard_run', 'intervals']
    );
  }

  /**
   * Create tempo session for hybrid athlete
   */
  private createTempoSession(week: number, phase: Phase): Session {
    const weekInPhase = week - phase.start_week + 1;
    
    // Slightly reduced tempo volume
    const tempoMinutes = 15 + (weekInPhase * 2);
    
    return this.createSession(
      'Tuesday',
      'Tempo Run',
      `${tempoMinutes} minutes at threshold pace`,
      tempoMinutes + 25,
      [
        TOKEN_PATTERNS.warmup_quality_12min,
        TOKEN_PATTERNS.tempo_minutes(Math.min(tempoMinutes, 35)),
        TOKEN_PATTERNS.cooldown_easy_10min
      ],
      ['hard_run', 'tempo', 'threshold']
    );
  }

  /**
   * Assign days to sessions including strength workouts
   */
  private assignDaysToSessionsWithStrength(sessions: Session[], _totalDays: number): Session[] {
    const dayOrder = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
    
    // Pre-assign strength sessions
    const strengthSessions = sessions.filter(s => s.type === 'strength');
    const runningSessions = sessions.filter(s => s.type === 'run');
    
    // Assign strength: Upper on Monday, Lower on Friday
    for (const s of strengthSessions) {
      if (s.tags.includes('upper_body')) {
        s.day = 'Monday';
      } else if (s.tags.includes('lower_body')) {
        s.day = 'Friday';
      }
    }

    // Assign running sessions
    const usedDays = new Set(strengthSessions.map(s => s.day));
    
    // Long run on Sunday
    const longRuns = runningSessions.filter(s => s.tags.includes('long_run'));
    for (const lr of longRuns) {
      lr.day = 'Sunday';
      usedDays.add('Sunday');
    }

    // Quality runs on Tuesday (after Monday strength, before Friday strength)
    const qualityRuns = runningSessions.filter(s => 
      s.tags.some(t => ['hard_run', 'intervals', 'tempo'].includes(t))
    );
    for (const qr of qualityRuns) {
      qr.day = 'Tuesday';
      usedDays.add('Tuesday');
    }

    // Easy runs on remaining days
    const easyRuns = runningSessions.filter(s => 
      !s.tags.includes('long_run') && 
      !s.tags.some(t => ['hard_run', 'intervals', 'tempo'].includes(t))
    );
    
    const availableDays = dayOrder.filter(d => !usedDays.has(d));
    for (let i = 0; i < easyRuns.length && i < availableDays.length; i++) {
      easyRuns[i].day = availableDays[i];
    }

    return [...strengthSessions, ...runningSessions];
  }
}
