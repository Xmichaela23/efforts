// Abstract base class for run plan generators
// Provides common methods used by all approach-specific generators

import {
  TrainingPlan,
  GeneratorParams,
  PhaseStructure,
  Phase,
  Session,
  WeeklySummary,
  FITNESS_TO_VOLUME,
  TOKEN_PATTERNS
} from '../types.ts';

export abstract class BaseGenerator {
  protected params: GeneratorParams;

  constructor(params: GeneratorParams) {
    this.params = params;
  }

  // Main generation method (implemented by subclasses)
  abstract generatePlan(): TrainingPlan;

  // ============================================================================
  // RACE DATE AWARENESS
  // ============================================================================

  /**
   * Calculate the date for a specific day in a given week
   * Week 1 starts on startDate (Monday), days are Monday=0, Tuesday=1, ..., Sunday=6
   */
  protected getDateForSession(weekNumber: number, dayOfWeek: string, startDate?: string): Date | null {
    if (!startDate) return null;
    
    const dayOffsets: Record<string, number> = {
      'Monday': 0,
      'Tuesday': 1,
      'Wednesday': 2,
      'Thursday': 3,
      'Friday': 4,
      'Saturday': 5,
      'Sunday': 6
    };
    
    const dayOffset = dayOffsets[dayOfWeek] ?? 0;
    const weekOffset = (weekNumber - 1) * 7;
    
    const start = new Date(startDate + 'T00:00:00');
    const sessionDate = new Date(start.getTime() + (weekOffset + dayOffset) * 24 * 60 * 60 * 1000);
    
    return sessionDate;
  }

  /**
   * Calculate days until race for a given session
   * Returns null if no race date is set
   */
  protected getDaysUntilRace(weekNumber: number, dayOfWeek: string, startDate?: string, raceDate?: string): number | null {
    if (!raceDate || !startDate) return null;
    
    const sessionDate = this.getDateForSession(weekNumber, dayOfWeek, startDate);
    if (!sessionDate) return null;
    
    const race = new Date(raceDate + 'T00:00:00');
    const diffMs = race.getTime() - sessionDate.getTime();
    const diffDays = Math.floor(diffMs / (24 * 60 * 60 * 1000));
    
    return diffDays;
  }

  /**
   * Determine what type of session is appropriate based on days until race
   * 
   * Returns:
   * - 'race': This is race day
   * - 'shakeout': 1-2 days before race (2-3 mi easy only)
   * - 'easy_short': 3-4 days before race (4-5 mi easy max, no quality)
   * - 'easy_medium': 5-7 days before race (normal easy, no long run)
   * - 'reduced_quality': 8-14 days before race (reduced long run, light quality)
   * - 'normal': More than 14 days out, train normally
   */
  protected getRaceProximitySession(daysUntilRace: number | null): 'race' | 'shakeout' | 'easy_short' | 'easy_medium' | 'reduced_quality' | 'normal' {
    if (daysUntilRace === null) return 'normal';
    if (daysUntilRace <= 0) return 'race';
    if (daysUntilRace <= 2) return 'shakeout';
    if (daysUntilRace <= 4) return 'easy_short';
    if (daysUntilRace <= 7) return 'easy_medium';
    if (daysUntilRace <= 14) return 'reduced_quality';
    return 'normal';
  }

  /**
   * Create a shakeout run (1-2 days before race)
   */
  protected createShakeoutRun(day: string = 'Saturday'): Session {
    return this.createSession(
      day,
      'Shakeout Run',
      '2-3 miles very easy with a few strides. Stay loose and relaxed.',
      25,
      [TOKEN_PATTERNS.easy_run_miles(3), TOKEN_PATTERNS.strides_4x100m],
      ['easy_run', 'shakeout']
    );
  }

  /**
   * Create rest day placeholder (for race day or day before)
   */
  protected createRestDay(day: string = 'Saturday', reason: string = 'Race preparation'): Session {
    return this.createSession(
      day,
      'Rest',
      reason,
      0,
      [],
      ['rest']
    );
  }

  // ============================================================================
  // ATHLETE STATE HELPERS
  // ============================================================================

  /**
   * Find the first index in a long-run progression table that matches the
   * athlete's recent long run, so week 1 continues from where they actually are
   * rather than always resetting to the table's week-1 default.
   *
   * Uses a 95% target so there's a very slight pullback (no regression beyond ~5%).
   * Caps the offset at half the progression length so the plan still builds to peak.
   */
  protected getProgressionOffset(progression: number[]): number {
    const recentLongRun = this.params.recent_long_run_miles;
    if (!recentLongRun || recentLongRun <= 0 || progression.length === 0) return 0;

    const target = recentLongRun * 0.95;
    let bestIndex = 0;
    for (let i = 0; i < progression.length; i++) {
      if (progression[i] <= target) {
        bestIndex = i;
      } else {
        break;
      }
    }

    // Allow entering up to (progression.length - duration_weeks) positions in
    // so there's always enough remaining table for the full plan duration.
    // The old cap of duration_weeks/2 was too conservative: for a 6-week plan
    // it capped at 3, forcing week 1 to start at position 3 (8 miles) even
    // for athletes already at 18-mile peak fitness.
    const maxOffset = Math.max(0, progression.length - this.params.duration_weeks);
    return Math.min(bestIndex, maxOffset);
  }

  /**
   * Returns true when the athlete is already at or near their peak long-run
   * fitness for this progression. Used to switch short plans into taper mode
   * rather than continuing a build arc.
   */
  protected isAtPeakFitness(progression: number[]): boolean {
    const recentLongRun = this.params.recent_long_run_miles;
    if (!recentLongRun || progression.length === 0) return false;
    const peakValue = Math.max(...progression);
    return recentLongRun >= peakValue * 0.80; // within 20% of the table's peak
  }

  /**
   * Resolve the effective week-1 weekly volume based on the athlete's actual
   * current_weekly_miles, volume_trend, and current_acwr.
   *
   * Rules:
   *   • If no current_weekly_miles → fall back to the table's start value.
   *   • Clamp to [tableStart * 0.7, tablePeak * 0.95] to guard edge cases.
   *   • ACWR > 1.3: scale down by up to 20% (fatigued athlete).
   *   • volume_trend 'declining': apply an extra 5% conservative buffer.
   */
  protected resolveEffectiveStartVolume(tableStart: number, tablePeak: number): number {
    const currentMiles = this.params.current_weekly_miles;
    if (!currentMiles || currentMiles <= 0) return tableStart;

    let effective = Math.max(tableStart * 0.7, Math.min(tablePeak * 0.95, currentMiles));

    // ACWR fatigue guard
    const acwr = this.params.current_acwr;
    if (acwr != null && acwr > 1.3) {
      const fatigueScale = Math.max(0.80, 1.0 - (acwr - 1.3) * 0.5);
      effective = effective * fatigueScale;
    }

    // Declining-trend buffer
    if (this.params.volume_trend === 'declining') {
      effective = effective * 0.95;
    }

    return Math.round(effective);
  }

  // ============================================================================
  // VOLUME CALCULATIONS
  // ============================================================================

  /**
   * Calculate starting weekly volume based on fitness level and distance
   */
  protected calculateStartingVolume(): number {
    const volumeParams = FITNESS_TO_VOLUME[this.params.distance]?.[this.params.fitness];
    if (!volumeParams) {
      throw new Error(`No volume parameters for ${this.params.distance} ${this.params.fitness}`);
    }
    return volumeParams.startWeekly;
  }

  /**
   * Calculate peak weekly volume
   */
  protected calculatePeakVolume(): number {
    const volumeParams = FITNESS_TO_VOLUME[this.params.distance]?.[this.params.fitness];
    if (!volumeParams) {
      throw new Error(`No volume parameters for ${this.params.distance} ${this.params.fitness}`);
    }
    return volumeParams.peakWeekly;
  }

  /**
   * Get long run cap for fitness level
   */
  protected getLongRunCap(): number {
    const volumeParams = FITNESS_TO_VOLUME[this.params.distance]?.[this.params.fitness];
    if (!volumeParams) {
      throw new Error(`No volume parameters for ${this.params.distance} ${this.params.fitness}`);
    }
    return volumeParams.longRunCap;
  }

  /**
   * Get weekly increase allowance
   */
  protected getWeeklyIncrease(): number {
    const volumeParams = FITNESS_TO_VOLUME[this.params.distance]?.[this.params.fitness];
    if (!volumeParams) {
      throw new Error(`No volume parameters for ${this.params.distance} ${this.params.fitness}`);
    }
    return volumeParams.weeklyIncrease;
  }

  // ============================================================================
  // PHASE STRUCTURE CALCULATION
  // ============================================================================

  /**
   * Determine phase structure based on total duration
   * Returns phases with start/end weeks and characteristics
   */
  protected determinePhaseStructure(): PhaseStructure {
    const duration = this.params.duration_weeks;

    if (duration < 4) {
      throw new Error('Minimum 4 weeks required for training plan');
    }

    let phases: Phase[];

    if (duration >= 4 && duration <= 6) {
      // Short plans: Base + Speed + Taper
      const baseWeeks = Math.round(duration * 0.4);
      const speedWeeks = Math.round(duration * 0.4);
      const taperWeeks = Math.max(1, duration - baseWeeks - speedWeeks);

      phases = [
        {
          name: 'Base',
          start_week: 1,
          end_week: baseWeeks,
          weeks_in_phase: baseWeeks,
          focus: 'Aerobic foundation and movement patterns',
          quality_density: 'low',
          volume_multiplier: 0.7
        },
        {
          name: 'Speed',
          start_week: baseWeeks + 1,
          end_week: baseWeeks + speedWeeks,
          weeks_in_phase: speedWeeks,
          focus: 'VO2max development and race pace',
          quality_density: 'high',
          volume_multiplier: 1.0
        },
        {
          name: 'Taper',
          start_week: baseWeeks + speedWeeks + 1,
          end_week: duration,
          weeks_in_phase: taperWeeks,
          focus: 'Recovery and race preparation',
          quality_density: 'low',
          volume_multiplier: 0.6
        }
      ];
    } else if (duration >= 7 && duration <= 11) {
      // Medium plans: Base + Speed + Race Prep + Taper
      const baseWeeks = Math.round(duration * 0.33);
      const speedWeeks = Math.round(duration * 0.33);
      const racePrepWeeks = Math.round(duration * 0.20);
      const taperWeeks = Math.max(1, duration - baseWeeks - speedWeeks - racePrepWeeks);

      phases = [
        {
          name: 'Base',
          start_week: 1,
          end_week: baseWeeks,
          weeks_in_phase: baseWeeks,
          focus: 'Aerobic foundation',
          quality_density: 'low',
          volume_multiplier: 0.7
        },
        {
          name: 'Speed',
          start_week: baseWeeks + 1,
          end_week: baseWeeks + speedWeeks,
          weeks_in_phase: speedWeeks,
          focus: 'VO2max and speed development',
          quality_density: 'high',
          volume_multiplier: 0.95
        },
        {
          name: 'Race Prep',
          start_week: baseWeeks + speedWeeks + 1,
          end_week: baseWeeks + speedWeeks + racePrepWeeks,
          weeks_in_phase: racePrepWeeks,
          focus: 'Race-specific work',
          quality_density: 'medium',
          volume_multiplier: 1.0
        },
        {
          name: 'Taper',
          start_week: baseWeeks + speedWeeks + racePrepWeeks + 1,
          end_week: duration,
          weeks_in_phase: taperWeeks,
          focus: 'Recovery and sharpening',
          quality_density: 'low',
          volume_multiplier: 0.6
        }
      ];
    } else {
      // Long plans (12+ weeks): Base + Speed + Race Prep + Taper
      const baseWeeks = Math.round(duration * 0.30);
      const speedWeeks = Math.round(duration * 0.35);
      const racePrepWeeks = Math.round(duration * 0.25);
      const taperWeeks = Math.max(2, duration - baseWeeks - speedWeeks - racePrepWeeks);

      phases = [
        {
          name: 'Base',
          start_week: 1,
          end_week: baseWeeks,
          weeks_in_phase: baseWeeks,
          focus: 'Aerobic foundation building',
          quality_density: 'low',
          volume_multiplier: 0.75
        },
        {
          name: 'Speed',
          start_week: baseWeeks + 1,
          end_week: baseWeeks + speedWeeks,
          weeks_in_phase: speedWeeks,
          focus: 'Speed and VO2max development',
          quality_density: 'high',
          volume_multiplier: 0.95
        },
        {
          name: 'Race Prep',
          start_week: baseWeeks + speedWeeks + 1,
          end_week: baseWeeks + speedWeeks + racePrepWeeks,
          weeks_in_phase: racePrepWeeks,
          focus: 'Race-specific work',
          quality_density: 'medium',
          volume_multiplier: 1.0
        },
        {
          name: 'Taper',
          start_week: baseWeeks + speedWeeks + racePrepWeeks + 1,
          end_week: duration,
          weeks_in_phase: taperWeeks,
          focus: 'Recovery and race readiness',
          quality_density: 'low',
          volume_multiplier: 0.6
        }
      ];
    }

    // Insert recovery weeks (every 4th week within phases)
    const recovery_weeks: number[] = [];
    for (let week = 4; week <= duration; week += 4) {
      // Don't make taper weeks recovery weeks
      const taperPhase = phases.find(p => p.name === 'Taper');
      if (taperPhase && week >= taperPhase.start_week) {
        continue;
      }
      recovery_weeks.push(week);
    }

    return { phases, recovery_weeks };
  }

  /**
   * Get the current phase for a given week number
   */
  protected getCurrentPhase(weekNumber: number, phaseStructure: PhaseStructure): Phase {
    for (const phase of phaseStructure.phases) {
      if (weekNumber >= phase.start_week && weekNumber <= phase.end_week) {
        return phase;
      }
    }
    // Default to last phase if not found
    return phaseStructure.phases[phaseStructure.phases.length - 1];
  }

  /**
   * Check if a week is a recovery week
   */
  protected isRecoveryWeek(weekNumber: number, phaseStructure: PhaseStructure): boolean {
    return phaseStructure.recovery_weeks.includes(weekNumber);
  }

  // ============================================================================
  // WORKOUT CREATION HELPERS
  // ============================================================================

  /**
   * Create session object matching schema requirements
   */
  protected createSession(
    day: string,
    name: string,
    description: string,
    duration: number,
    steps_preset: string[],
    tags: string[]
  ): Session {
    return {
      day,
      type: 'run',
      name,
      description,
      duration,
      steps_preset,
      tags
    };
  }

  // ============================================================================
  // DISTANCE-BASED WORKOUT CREATORS
  // ============================================================================

  /**
   * Create an easy run session - DISTANCE BASED
   */
  protected createEasyRunMiles(miles: number, day: string = 'Monday'): Session {
    const duration = this.milesToMinutes(miles);
    return this.createSession(
      day,
      'Easy Run',
      `${miles} miles at easy, conversational pace`,
      duration,
      [TOKEN_PATTERNS.easy_run_miles(miles)],
      ['easy_run']
    );
  }

  /**
   * Create an easy run session (time-based - backward compat)
   */
  protected createEasyRun(durationMinutes: number, day: string = 'Monday'): Session {
    return this.createSession(
      day,
      'Easy Run',
      `Easy aerobic run at conversational pace`,
      durationMinutes,
      [TOKEN_PATTERNS.easy_run(durationMinutes)],
      ['easy_run']
    );
  }

  /**
   * Create a long run session - DISTANCE BASED
   */
  protected createLongRunMiles(miles: number, day: string = 'Sunday', mpMiles: number = 0): Session {
    const duration = this.milesToMinutes(miles);
    
    const tokens = mpMiles > 0
      ? [TOKEN_PATTERNS.long_run_with_mp_miles(miles, mpMiles)]
      : [TOKEN_PATTERNS.long_run_miles(miles)];

    const description = mpMiles > 0
      ? `${miles} miles - Long run with final ${mpMiles} miles at marathon pace`
      : `${miles} miles at easy, conversational pace`;

    return this.createSession(
      day,
      'Long Run',
      description,
      duration,
      tokens,
      ['long_run']
    );
  }

  /**
   * Create a long run session (time-based - backward compat)
   */
  protected createLongRun(durationMinutes: number, day: string = 'Sunday', withMPFinish: boolean = false, mpMinutes: number = 0): Session {
    const tokens = withMPFinish && mpMinutes > 0
      ? [TOKEN_PATTERNS.long_run_with_mp(durationMinutes, mpMinutes)]
      : [TOKEN_PATTERNS.long_run(durationMinutes)];

    const description = withMPFinish && mpMinutes > 0
      ? `Long run with final ${mpMinutes} minutes at marathon pace`
      : `Long run at easy, conversational pace`;

    return this.createSession(
      day,
      'Long Run',
      description,
      durationMinutes,
      tokens,
      ['long_run']
    );
  }

  /**
   * Create marathon pace run - DISTANCE BASED
   */
  protected createMarathonPaceRun(miles: number, day: string = 'Tuesday'): Session {
    const mpPace = this.getMarathonPaceMinPerMile();
    const workoutDuration = this.calculateDuration(miles, mpPace);
    const totalDuration = workoutDuration + 20; // Add warmup/cooldown

    return this.createSession(
      day,
      'Goal Pace Practice',
      `${miles} miles at goal marathon pace`,
      totalDuration,
      [
        TOKEN_PATTERNS.warmup_1mi,
        TOKEN_PATTERNS.mp_run_miles(miles),
        TOKEN_PATTERNS.cooldown_1mi
      ],
      ['moderate_run', 'marathon_pace']
    );
  }

  /**
   * Create a strides session (easy run with strides) - DISTANCE BASED
   */
  protected createStridesSessionMiles(baseMiles: number = 3, day: string = 'Tuesday'): Session {
    const duration = this.milesToMinutes(baseMiles) + 5; // +5 for strides
    return this.createSession(
      day,
      'Easy Run + Strides',
      `${baseMiles} miles easy with 6x20s strides at the end`,
      duration,
      [TOKEN_PATTERNS.easy_run_miles(baseMiles), TOKEN_PATTERNS.strides_6x20s],
      ['easy_run', 'strides']
    );
  }

  /**
   * Create a strides session (time-based - backward compat)
   */
  protected createStridesSession(baseDurationMinutes: number = 35, day: string = 'Tuesday'): Session {
    return this.createSession(
      day,
      'Easy Run + Strides',
      'Easy run with 6x20s strides at the end',
      baseDurationMinutes + 5,
      [TOKEN_PATTERNS.easy_run(baseDurationMinutes), TOKEN_PATTERNS.strides_6x20s],
      ['easy_run', 'strides']
    );
  }

  /**
   * Calculate target volume for specific week based on phase and recovery
   */
  protected calculateWeekVolume(
    weekNumber: number,
    phase: Phase,
    phaseStructure: PhaseStructure
  ): number {
    const startVolume = this.calculateStartingVolume();
    const peakVolume = this.calculatePeakVolume();

    // Linear progression within phase
    const progressInPhase = (weekNumber - phase.start_week) / Math.max(1, phase.weeks_in_phase - 1);
    const targetVolume = startVolume + (peakVolume - startVolume) * progressInPhase * phase.volume_multiplier;

    // Apply recovery week reduction
    if (this.isRecoveryWeek(weekNumber, phaseStructure)) {
      return Math.round(targetVolume * 0.7); // 30% reduction
    }

    return Math.round(targetVolume);
  }

  /**
   * Parse days per week string to number range
   */
  protected parseDaysPerWeek(): { min: number; max: number } {
    const parts = this.params.days_per_week.split('-').map(n => parseInt(n, 10));
    return {
      min: parts[0],
      max: parts[1] || parts[0]
    };
  }

  /**
   * Get the target number of running days based on days_per_week
   * Returns the MAX value (use getRunningDaysForWeek for week-specific logic)
   * Caps at 6 days to ensure at least 1 rest day per week
   */
  protected getRunningDays(): number {
    const { max } = this.parseDaysPerWeek();
    // Cap at 6 days max - always need at least 1 rest day
    return Math.min(6, max);
  }

  /**
   * Get running days for a specific week
   * Recovery weeks use fewer days, build weeks use more
   */
  protected getRunningDaysForWeek(weekNumber: number, phaseStructure: PhaseStructure): number {
    const { min, max } = this.parseDaysPerWeek();
    const isRecovery = this.isRecoveryWeek(weekNumber, phaseStructure);
    const phase = this.getCurrentPhase(weekNumber, phaseStructure);
    
    // Recovery weeks and taper: use minimum days
    if (isRecovery || phase.name === 'Taper') {
      return Math.min(6, min);
    }
    
    // Build weeks: use maximum days
    return Math.min(6, max);
  }

  /**
   * Assign days to sessions based on workout type
   * Prioritizes: Long run → Quality → Easy
   * 
   * Rest day strategy:
   * - Saturday is ALWAYS a rest day (prep for Sunday long run)
   * - Friday becomes rest if running 5 or fewer days
   * - Quality days (hard workouts) on Tuesday and Thursday
   * - Easy runs fill Monday, Wednesday, and optionally Friday
   */
  protected assignDaysToSessions(sessions: Session[], _numDays: number): Session[] {
    // Days available for running (Saturday always OFF for long run prep)
    const easyDayOrder = ['Monday', 'Wednesday', 'Friday'];
    const qualityDays = ['Tuesday', 'Thursday'];
    
    // Separate by type
    const longRuns = sessions.filter(s => s.tags.includes('long_run'));
    const hardSessions = sessions.filter(s => 
      s.tags.some(t => ['hard_run', 'intervals', 'tempo', 'threshold'].includes(t))
    );
    const easySessions = sessions.filter(s => 
      !s.tags.includes('long_run') && 
      !s.tags.some(t => ['hard_run', 'intervals', 'tempo', 'threshold'].includes(t))
    );

    const assignedSessions: Session[] = [];
    const usedDays = new Set<string>();
    
    // Saturday is always a rest day (don't add it to usedDays, just never use it)
    const restDays = new Set(['Saturday']);

    // First pass: respect sessions that already have a day assigned (e.g., recovery week sessions)
    for (const session of sessions) {
      if (session.day && !restDays.has(session.day)) {
        usedDays.add(session.day);
        assignedSessions.push(session);
      }
    }

    // Long run on Sunday (only if not already assigned)
    for (const longRun of longRuns) {
      if (assignedSessions.includes(longRun)) continue; // Already assigned
      const preferredDay = 'Sunday';
      if (!usedDays.has(preferredDay) && !restDays.has(preferredDay)) {
        longRun.day = preferredDay;
        usedDays.add(preferredDay);
        assignedSessions.push(longRun);
      }
    }

    // Hard sessions on Tuesday and Thursday (2Q system) - only if not already assigned
    for (const hardSession of hardSessions) {
      if (assignedSessions.includes(hardSession)) continue; // Already assigned
      for (const day of qualityDays) {
        if (!usedDays.has(day) && !restDays.has(day)) {
          hardSession.day = day;
          usedDays.add(day);
          assignedSessions.push(hardSession);
          break;
        }
      }
    }

    // Easy sessions on Monday, Wednesday, Friday (in that order) - only if not already assigned
    for (const easySession of easySessions) {
      if (assignedSessions.includes(easySession)) continue; // Already assigned
      for (const day of easyDayOrder) {
        if (!usedDays.has(day) && !restDays.has(day)) {
          easySession.day = day;
          usedDays.add(day);
          assignedSessions.push(easySession);
          break;
        }
      }
    }

    return assignedSessions;
  }

  /**
   * Distribute weekly volume across sessions
   */
  protected distributeVolume(
    weeklyVolume: number,
    numDays: number,
    includeLongRun: boolean
  ): number[] {
    const distribution: number[] = [];

    if (includeLongRun) {
      // Long run is 25-30% of weekly volume
      const longRunMiles = Math.min(
        weeklyVolume * 0.28,
        this.getLongRunCap()
      );
      distribution.push(longRunMiles);

      // Distribute remaining across other days
      const remainingVolume = weeklyVolume - longRunMiles;
      const remainingDays = numDays - 1;
      for (let i = 0; i < remainingDays; i++) {
        distribution.push(remainingVolume / remainingDays);
      }
    } else {
      // Evenly distribute
      for (let i = 0; i < numDays; i++) {
        distribution.push(weeklyVolume / numDays);
      }
    }

    return distribution.map(v => Math.round(v));
  }

  // ============================================================================
  // PACE ESTIMATION HELPERS
  // ============================================================================

  /**
   * Get easy pace estimate (min per mile) based on fitness
   */
  protected getEasyPaceMinPerMile(): number {
    const paces: Record<string, number> = {
      'beginner': 11.0,    // 11:00/mile
      'intermediate': 9.5, // 9:30/mile
      'advanced': 8.0      // 8:00/mile
    };
    return paces[this.params.fitness] || 9.5;
  }

  /**
   * Get marathon pace estimate (min per mile) based on fitness
   */
  protected getMarathonPaceMinPerMile(): number {
    const paces: Record<string, number> = {
      'beginner': 10.5,    // 10:30/mile (~4:35 finish)
      'intermediate': 9.0, // 9:00/mile (~3:56 finish)
      'advanced': 7.5      // 7:30/mile (~3:17 finish)
    };
    return paces[this.params.fitness] || 9.0;
  }

  /**
   * Get threshold pace estimate (min per mile) based on fitness
   */
  protected getThresholdPaceMinPerMile(): number {
    const paces: Record<string, number> = {
      'beginner': 9.5,     // 9:30/mile
      'intermediate': 8.0, // 8:00/mile
      'advanced': 6.5      // 6:30/mile
    };
    return paces[this.params.fitness] || 8.0;
  }

  /**
   * Calculate duration in minutes from distance and pace
   */
  protected calculateDuration(miles: number, paceMinPerMile: number): number {
    return Math.round(miles * paceMinPerMile);
  }

  /**
   * Convert miles to approximate minutes at easy pace
   */
  protected milesToMinutes(miles: number): number {
    return this.calculateDuration(miles, this.getEasyPaceMinPerMile());
  }

  /**
   * Round duration to nearest 5 minutes
   */
  protected roundToFiveMinutes(minutes: number): number {
    return Math.round(minutes / 5) * 5;
  }

  // ============================================================================
  // PLAN METADATA GENERATION
  // ============================================================================

  /**
   * Generate plan name based on parameters
   */
  protected generatePlanName(): string {
    const distanceNames: Record<string, string> = {
      '5k': '5K',
      '10k': '10K',
      'half': 'Half Marathon',
      'marathon': 'Marathon',
      'maintenance': 'Base Fitness'
    };
    
    const goalNames: Record<string, string> = {
      'complete': 'Finisher',
      'speed': 'Fast'
    };

    const distance = distanceNames[this.params.distance] || this.params.distance;
    const goal = this.params.goal ? goalNames[this.params.goal] : '';
    
    return `${distance} ${goal} Plan - ${this.params.duration_weeks} Weeks`.trim().replace(/\s+/g, ' ');
  }

  /**
   * Generate plan description
   */
  protected generatePlanDescription(): string {
    const phaseStructure = this.determinePhaseStructure();
    const phaseNames = phaseStructure.phases.map(p => p.name).join(' → ');
    
    return `A ${this.params.duration_weeks}-week progressive training plan designed for ${this.params.fitness}-level runners. ` +
      `Builds through ${phaseNames} phases with ${this.getRunningDays()} running days per week.`;
  }

  /**
   * Generate weekly summary for a given week
   */
  protected generateWeeklySummary(
    weekNumber: number,
    sessions: Session[],
    phase: Phase,
    isRecovery: boolean
  ): WeeklySummary {
    const hardSessions = sessions.filter(s => 
      s.tags.some(t => ['hard_run', 'intervals', 'tempo', 'threshold'].includes(t))
    );
    
    const totalDuration = sessions.reduce((sum, s) => sum + s.duration, 0);
    const hours = Math.round(totalDuration / 60 * 10) / 10;

    // Calculate total miles from run session tokens
    const totalMiles = this.calculateTotalMilesFromSessions(sessions);

    const keyWorkouts = sessions
      .filter(s => s.tags.includes('long_run') || s.tags.some(t => ['intervals', 'tempo'].includes(t)))
      .map(s => s.name);

    return {
      focus: isRecovery ? 'Recovery Week' : phase.focus,
      key_workouts: keyWorkouts,
      estimated_hours: hours,
      hard_sessions: hardSessions.length,
      total_miles: totalMiles,
      notes: isRecovery ? 'Reduced volume for recovery and adaptation' : ''
    };
  }

  /**
   * Calculate total running miles from session tokens
   * Parses tokens like run_easy_5mi, longrun_10mi_easypace, etc.
   */
  protected calculateTotalMilesFromSessions(sessions: Session[]): number {
    let totalMiles = 0;
    
    for (const session of sessions) {
      if (session.type !== 'run') continue;
      
      const tokens = session.steps_preset || [];
      for (const token of tokens) {
        // Match patterns like: run_easy_5mi, longrun_10mi_easypace, run_mp_4mi, tempo_3mi_threshold
        // Also: longrun_12mi_easypace_last2mi_MP, cruise_3x1mi_threshold_r60s
        const miMatch = token.match(/(\d+(?:\.\d+)?)\s*mi/);
        if (miMatch) {
          totalMiles += parseFloat(miMatch[1]);
        }
        
        // For cruise intervals like cruise_3x1.5mi, calculate total
        const cruiseMatch = token.match(/cruise_(\d+)x([\d.]+)mi/);
        if (cruiseMatch) {
          totalMiles += parseInt(cruiseMatch[1]) * parseFloat(cruiseMatch[2]);
        }
        
        // For interval tokens, estimate based on distance (800m = 0.5mi, 1000m = 0.62mi)
        const intervalMatch = token.match(/interval_(\d+)x(\d+)m/);
        if (intervalMatch) {
          const reps = parseInt(intervalMatch[1]);
          const meters = parseInt(intervalMatch[2]);
          totalMiles += reps * (meters / 1609.34);
        }
      }
    }
    
    return Math.round(totalMiles * 10) / 10; // Round to 1 decimal
  }
}
