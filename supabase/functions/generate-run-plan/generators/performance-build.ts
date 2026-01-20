// Performance Build Generator - Jack Daniels Inspired
// 
// Philosophy:
// - VDOT-based pacing: E (Easy), M (Marathon), T (Threshold), I (Interval), R (Repetition)
// - 2Q System: Two Quality workouts per week (Q1 Tuesday, Q2 Thursday)
// - 4-Phase Structure: Foundation → Early Quality → Peak → Taper
// - Quality limits: No single workout exceeds 10K of hard running
// - All paces calculated from user's 5K baseline
// - TIME-BASED long runs and easy runs (per Jack Daniels' method):
//   * Long runs capped at 2.5 hours (easy) or 3 hours (with M-pace segments)
//   * Easy runs use "time on feet" approach (30-60 minutes)
//   * Prevents excessive fatigue for slower runners while maintaining training stimulus
//
// Based on principles from Jack Daniels' Running Formula.
// This is an adaptation and not officially endorsed by Jack Daniels or Human Kinetics.

import { BaseGenerator } from './base-generator.ts';
import { TrainingPlan, Session, Phase, PhaseStructure, TOKEN_PATTERNS, getMarathonDurationRequirements } from '../types.ts';

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

/**
 * Week type classification for JD-aligned plan structure
 */
type WeekType = 'A' | 'B' | 'RECOVERY' | 'RACE_PREP';

export class PerformanceBuildGenerator extends BaseGenerator {
  // Cache for dynamically calculated long run progression
  private longRunProgressionCache?: number[];
  // Track long run distances as we generate weeks (for state-aware calculation)
  private longRunHistory: number[] = [];
  // Track interval types for variety enforcement
  private intervalTypeHistory: Array<'400' | '800' | '1000' | '1200' | 'mile'> = [];

  generatePlan(): TrainingPlan {
    const phaseStructure = this.determinePhaseStructure();
    const sessions_by_week: Record<string, Session[]> = {};
    const weekly_summaries: Record<string, any> = {};
    
    // Initialize tracking arrays for state-aware calculation
    this.longRunHistory = [];
    this.intervalTypeHistory = [];

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
    // If we have a race name, use it (e.g., "Boston Marathon 2025 Performance Plan")
    if (this.params.race_name && this.params.race_date) {
      const year = new Date(this.params.race_date + 'T00:00:00').getFullYear();
      return `${this.params.race_name} ${year} Performance Plan`;
    }
    
    // Fallback to distance-based naming
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
    return `A ${this.params.duration_weeks}-week performance-focused plan with personalized pace zones. ` +
      `Features two quality workouts per week (intervals and tempo) with paces calculated from your 5K time. ` +
      `Based on proven training principles.`;
  }

  private generateWeekSessions(
    weekNumber: number,
    phase: Phase,
    phaseStructure: PhaseStructure,
    isRecovery: boolean
  ): Session[] {
    const sessions: Session[] = [];
    // Use week-specific day count (fewer days on recovery weeks)
    const runningDays = this.getRunningDaysForWeek(weekNumber, phaseStructure);

    // Get targets
    const weeklyMiles = this.calculateWeeklyMileage(weekNumber, phase, isRecovery, phaseStructure);
    
    // CORE WEEK CLASSIFICATION (Step 1)
    const weekType = this.getWeekType(weekNumber, phase, phaseStructure, isRecovery);
    
    // Check race proximity for each day - this enables smart tapering
    const raceProximity = this.checkWeekRaceProximity(weekNumber);
    
    // If any day this week is within 7 days of race, use race-aware session generation
    if (raceProximity.hasRaceWeekSessions) {
      return this.generateRaceWeekSessions(weekNumber, raceProximity, runningDays);
    }
    
    // LONG RUN RESOLVER (Step 2 - Highest Priority)
    const longRunSession = this.resolveLongRun(weekNumber, weekType, phase, phaseStructure, isRecovery);
    if (longRunSession) {
      sessions.push(longRunSession);
    }
    
    // Track long run distance for history (for state-aware calculation)
    const longRunMiles = this.getLongRunMilesForWeek(weekNumber, isRecovery, phaseStructure);
    this.longRunHistory[weekNumber - 1] = longRunMiles;

    // Use target long run miles for usedMiles calculation (for weekly planning)
    // Note: Actual session may be shorter due to Jack Daniels time caps (2.5-3 hours)
    let usedMiles = sessions.length > 0 ? longRunMiles : 0;

    // QUALITY DAY RESOLVER (Step 3)
    if (weekType === 'RECOVERY') {
      // Recovery week: easy + strides only
      sessions.push(this.createEasyWithStrides(4, 'Tuesday'));
      usedMiles += 4;
      sessions.push(this.createEasyRunTime(3, 'Thursday'));
      usedMiles += 3;
    } else {
      // Week A, Week B, or Race Prep
      const quality = this.resolveQualityDays(sessions, weekNumber, weekType, phase, runningDays);
      usedMiles += quality;
    }

    // M-PACE INJECTOR (Step 5) - runs after quality day resolver
    this.injectMPaceIfEligible(sessions, weekNumber, weekType, phase);

    // Fill with easy runs
    this.fillWithEasyRuns(sessions, runningDays, weeklyMiles - usedMiles);

    // STRENGTH ATTACHMENT (Step 6) - runs last, based on resolved sessions
    this.attachStrengthSessions(sessions, weekType, weekNumber);

    return this.assignDaysToSessions(sessions, runningDays);
  }

  /**
   * Check race proximity for all days in a week
   * Returns info about whether any sessions need race-aware adjustments
   */
  private checkWeekRaceProximity(weekNumber: number): {
    hasRaceWeekSessions: boolean;
    dayProximity: Record<string, ReturnType<typeof this.getRaceProximitySession>>;
  } {
    const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
    const dayProximity: Record<string, ReturnType<typeof this.getRaceProximitySession>> = {};
    let hasRaceWeekSessions = false;

    for (const day of days) {
      const daysUntil = this.getDaysUntilRace(weekNumber, day, this.params.start_date, this.params.race_date);
      const proximity = this.getRaceProximitySession(daysUntil);
      dayProximity[day] = proximity;
      
      // If any day is within easy_medium range (7 days), this is a race week
      if (proximity === 'race' || proximity === 'shakeout' || proximity === 'easy_short' || proximity === 'easy_medium') {
        hasRaceWeekSessions = true;
      }
    }

    return { hasRaceWeekSessions, dayProximity };
  }

  /**
   * Generate sessions for a race week (within 7 days of race)
   * Uses race-day-aware logic to taper appropriately
   */
  private generateRaceWeekSessions(
    weekNumber: number,
    raceProximity: { dayProximity: Record<string, ReturnType<typeof this.getRaceProximitySession>> },
    runningDays: number
  ): Session[] {
    const sessions: Session[] = [];
    const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

      // PRIORITY: Always create race day session on final Sunday for marathon plans
      // This ensures race day is never missed, even if proximity calculation is slightly off
      const isFinalWeek = weekNumber === this.params.duration_weeks;
      const isMarathon = this.params.distance === 'marathon';
      if (isFinalWeek && isMarathon) {
        sessions.push(this.createRaceDaySession());
      }

    for (const day of days) {
      // Skip Sunday if we already added race day session
      if (day === 'Sunday' && isFinalWeek && isMarathon) {
        continue;
      }

      const proximity = raceProximity.dayProximity[day];

      switch (proximity) {
        case 'race':
          // Race day - THE MARATHON
          // Only add if this is the final week and Sunday (fallback if above check didn't catch it)
          if (isFinalWeek && day === 'Sunday' && isMarathon) {
            sessions.push(this.createRaceDaySession());
          }
          break;
          
        case 'shakeout':
          // 1-2 days before race: very short shakeout
          sessions.push(this.createShakeoutRun(day));
          break;
          
        case 'easy_short':
          // 3-4 days before race: short easy run
          sessions.push(this.createSession(
            day,
            'Easy Run',
            '4 miles very easy. Stay fresh for race day.',
            this.milesToMinutes(4),
            [TOKEN_PATTERNS.easy_run_miles(4)],
            ['easy_run', 'taper']
          ));
          break;
          
        case 'easy_medium':
          // 5-7 days before race: normal easy or light quality
          if (day === 'Tuesday') {
            // Light sharpening workout
            sessions.push(this.createTaperInterval());
          } else if (day === 'Sunday') {
            // Reduced long run (8-10 miles max)
            sessions.push(this.createVDOTLongRun(8, 0));
          } else if (sessions.length < runningDays) {
            sessions.push(this.createSession(
              day,
              'Easy Run',
              '5 miles easy. Maintaining fitness while resting.',
              this.milesToMinutes(5),
              [TOKEN_PATTERNS.easy_run_miles(5)],
              ['easy_run', 'taper']
            ));
          }
          break;
          
        case 'reduced_quality':
          // 8-14 days before race - reduced but still training
          if (day === 'Tuesday') {
            // Quality workout but lighter
            sessions.push(this.createTaperInterval());
          } else if (day === 'Thursday') {
            // Short tempo or easy
            sessions.push(this.createSession(
              day,
              'Easy Run',
              '4 miles at E pace. Recovery and aerobic maintenance.',
              this.milesToMinutes(4),
              [TOKEN_PATTERNS.easy_run_miles(4)],
              ['easy_run']
            ));
          } else if (day === 'Sunday') {
            // Long run uses dynamic progression - already handles taper
            sessions.push(this.createVDOTLongRun(this.getLongRunMiles(weekNumber, false), 0));
          } else if (sessions.length < runningDays && day !== 'Saturday') {
            sessions.push(this.createSession(
              day,
              'Easy Run',
              '5 miles at E pace. Recovery and aerobic maintenance.',
              this.milesToMinutes(5),
              [TOKEN_PATTERNS.easy_run_miles(5)],
              ['easy_run']
            ));
          }
          break;
          
        case 'normal':
          // More than 14 days out - should not be in race week, skip
          break;
      }
    }

    // Ensure we have Saturday as rest
    const hasSaturday = sessions.some(s => s.day === 'Saturday');
    if (!hasSaturday) {
      // Saturday is rest (no session added)
    }

    return sessions;
  }

  // ============================================================================
  // QUALITY DAY RESOLVER (Step 3)
  // ============================================================================

  /**
   * Resolve quality days based on week type (JD-aligned)
   * Week A: Tue = light I/strides, Thu = primary T
   * Week B: Tue = primary I, Thu = easy/steady
   * Race Prep: Special case (M-pace work)
   * Returns total quality miles added
   */
  private resolveQualityDays(
    sessions: Session[],
    weekNumber: number,
    weekType: WeekType,
    phase: Phase,
    runningDays: number
  ): number {
    let mileageUsed = 0;
    const weekInPhase = weekNumber - phase.start_week + 1;

    // Race Prep weeks use special logic
    if (weekType === 'RACE_PREP') {
      return this.resolveRacePrepQuality(sessions, weekNumber, phase, runningDays, weekInPhase);
    }

    // Week A: Threshold Emphasis
    if (weekType === 'A') {
      // Tuesday: Light I / Strides (not a full workout)
      const tueSession = this.createLightIOrStrides(weekNumber, weekInPhase);
      sessions.push(tueSession);
      mileageUsed += 4; // Approximate

      // Thursday: Primary T workout
      if (runningDays >= 5) {
        const thuSession = this.createPrimaryTWorkout(weekNumber, weekInPhase);
        sessions.push(thuSession);
        mileageUsed += 6; // Approximate
      }
    }

    // Week B: Interval Emphasis
    if (weekType === 'B') {
      // Tuesday: Primary I workout
      const tueSession = this.createPrimaryIWorkout(weekNumber, weekInPhase);
      sessions.push(tueSession);
      mileageUsed += 6; // Approximate

      // Thursday: Easy / Steady (no quality)
      if (runningDays >= 5) {
        sessions.push(this.createEasyRunTime(4, 'Thursday'));
        mileageUsed += 4;
      }
    }

    return mileageUsed;
  }

  /**
   * Resolve Race Prep quality days (special case)
   */
  private resolveRacePrepQuality(
    sessions: Session[],
    weekNumber: number,
    phase: Phase,
    runningDays: number,
    weekInPhase: number
  ): number {
    let mileageUsed = 0;

    if (this.params.distance === 'marathon' || this.params.distance === 'half') {
      // Tuesday: M-pace run
      sessions.push(this.createMPaceSession(weekInPhase));
      mileageUsed += 6;

      // Thursday: Cruise intervals or easy
      if (runningDays >= 5) {
        sessions.push(this.createCruiseIntervals(weekInPhase));
        mileageUsed += 7;
      }
    } else {
      // Shorter distances: continue I + T pattern
      sessions.push(this.createIntervalSession(weekInPhase));
      mileageUsed += 6;
      if (runningDays >= 5) {
        sessions.push(this.createTempoRun(weekInPhase));
        mileageUsed += 6;
      }
    }

    return mileageUsed;
  }

  /**
   * Create light I / strides session (Week A Tuesday)
   * Allowed: 4-6 × 200m @ R, 6-10 × 200m @ R, easy + strides
   * Disallowed: Full I-pace workouts, > 2 miles quality volume
   */
  private createLightIOrStrides(weekNumber: number, weekInPhase: number): Session {
    // Weeks 1-3: Can include R work (6-10 × 200m)
    if (weekNumber <= 3) {
      const reps = weekNumber === 1 ? 6 : weekNumber === 2 ? 8 : 10;
      return this.createSession(
        'Tuesday',
        'R Pace Strides',
        `Easy 4 miles + ${reps} × 200m @ R pace (fast but relaxed, full recovery). ` +
        `Maintains leg turnover and mechanics.`,
        this.milesToMinutes(4) + reps * 2,
        [TOKEN_PATTERNS.easy_run(30), TOKEN_PATTERNS.strides_4x100m], // Approximate token
        ['easy_run', 'strides', 'recovery']
      );
    }

    // Weeks 5+: Easy + strides only
    return this.createEasyWithStrides(4, 'Tuesday');
  }

  /**
   * Create primary T workout (Week A Thursday)
   * Allowed: Cruise intervals, continuous tempo, tempo segments
   */
  private createPrimaryTWorkout(weekNumber: number, weekInPhase: number): Session {
    // Progressive cruise intervals: 3×1mi → 4×1mi → 3×1.5mi
    const reps = weekInPhase <= 2 ? 3 : 4;
    const milesEach = weekInPhase >= 3 ? 1.5 : 1;
    const totalQuality = reps * milesEach;

    return this.createSession(
      'Thursday',
      'Cruise Intervals',
      `${reps}×${milesEach}mi at T pace with 60-90s jog recovery. ` +
      `Total: ${totalQuality} miles @ T (comfortably hard, ~10K effort). ` +
      `Cruise intervals build lactate threshold.`,
      50 + reps * 2,
      [
        TOKEN_PATTERNS.warmup_1mi,
        TOKEN_PATTERNS.cruise_intervals(reps, milesEach),
        TOKEN_PATTERNS.cooldown_1mi
      ],
      ['hard_run', 'threshold']
    );
  }

  // ============================================================================
  // INTERVAL VARIETY ENGINE (Step 4)
  // ============================================================================

  /**
   * Create primary I workout (Week B Tuesday) with variety enforcement
   * Tracks last 2 interval types to enforce variety
   * Progression: 400s → 800s → 1000s → miles → 1200s
   */
  private createPrimaryIWorkout(weekNumber: number, weekInPhase: number): Session {
    // Determine interval type based on week and variety rules
    const intervalType = this.selectIntervalType(weekNumber);
    
    // Track this interval type for variety enforcement
    this.intervalTypeHistory.push(intervalType);

    // Create session based on type
    switch (intervalType) {
      case '400':
        return this.createInterval400s(weekNumber);
      case '800':
        return this.createInterval800s(weekNumber);
      case '1000':
        return this.createInterval1000s(weekNumber);
      case '1200':
        return this.createInterval1200s(weekNumber);
      case 'mile':
        return this.createIntervalMiles(weekNumber);
    }
  }

  /**
   * Select interval type with variety enforcement
   * Never repeat same type 3+ weeks in a row
   * Progression: 400s → 800s → 1000s → miles → 1200s
   */
  private selectIntervalType(weekNumber: number): '400' | '800' | '1000' | '1200' | 'mile' {
    const lastTwo = this.intervalTypeHistory.slice(-2);
    
    // Early weeks: Start with 400s
    if (weekNumber === 1 || weekNumber === 2) {
      return '400';
    }

    // Week 3: Move to 800s
    if (weekNumber === 3) {
      return '800';
    }

    // Week 5 (after recovery): Back to 800s
    if (weekNumber === 5) {
      return '800';
    }

    // Week 6: Move to 1000s
    if (weekNumber === 6) {
      return '1000';
    }

    // Week 7: Move to miles or 1200s
    if (weekNumber === 7) {
      // Avoid repeating if last was 1000
      if (lastTwo[lastTwo.length - 1] === '1000') {
        return 'mile';
      }
      return '1000';
    }

    // Default progression: cycle through types, avoid 3+ repeats
    const progression: Array<'400' | '800' | '1000' | '1200' | 'mile'> = ['400', '800', '1000', 'mile', '1200'];
    const lastType = lastTwo[lastTwo.length - 1];
    const lastIndex = progression.indexOf(lastType);
    
    // If same type 2+ times, force change
    if (lastTwo.length >= 2 && lastTwo[0] === lastTwo[1]) {
      return progression[(lastIndex + 1) % progression.length];
    }

    // Otherwise, progress naturally
    return progression[Math.min(lastIndex + 1, progression.length - 1)];
  }

  /**
   * Create 400m interval session
   */
  private createInterval400s(weekNumber: number): Session {
    const reps = weekNumber <= 2 ? 6 : 8;
    const restSec = 90;
    const qualityMiles = reps * 0.25;

    return this.createSession(
      'Tuesday',
      'I Pace Intervals',
      `${reps}×400m at I pace (5K effort). ` +
      `Jog ${restSec}s recovery between reps. ` +
      `Total quality: ~${qualityMiles.toFixed(1)} miles. ` +
      `Shorter intervals for economy and mechanics.`,
      40,
      [
        TOKEN_PATTERNS.warmup_1mi,
        TOKEN_PATTERNS.intervals_800(Math.ceil(reps / 2), restSec), // Approximate token
        TOKEN_PATTERNS.cooldown_1mi
      ],
      ['hard_run', 'intervals', 'vo2max']
    );
  }

  /**
   * Create 800m interval session
   */
  private createInterval800s(weekNumber: number): Session {
    const reps = weekNumber <= 3 ? 5 : 6;
    const restSec = 120;
    const qualityMiles = reps * 0.5;

    return this.createSession(
      'Tuesday',
      'I Pace Intervals',
      `${reps}×800m at I pace (5K effort). ` +
      `Jog ${restSec}s recovery between reps. ` +
      `Total quality: ~${qualityMiles.toFixed(1)} miles. ` +
      `These develop VO2max and running economy.`,
      50,
      [
        TOKEN_PATTERNS.warmup_1mi,
        TOKEN_PATTERNS.intervals_800(reps, restSec),
        TOKEN_PATTERNS.cooldown_1mi
      ],
      ['hard_run', 'intervals', 'vo2max']
    );
  }

  /**
   * Create 1000m interval session
   */
  private createInterval1000s(weekNumber: number): Session {
    const reps = 4;
    const restSec = 180;
    const qualityMiles = reps * 0.62;

    return this.createSession(
      'Tuesday',
      'I Pace Intervals',
      `${reps}×1000m at I pace (5K effort). ` +
      `Jog ${restSec}s recovery between reps. ` +
      `Total quality: ~${qualityMiles.toFixed(1)} miles. ` +
      `Longer intervals for sustained VO2max development.`,
      55,
      [
        TOKEN_PATTERNS.warmup_1mi,
        TOKEN_PATTERNS.intervals_1000(reps, restSec),
        TOKEN_PATTERNS.cooldown_1mi
      ],
      ['hard_run', 'intervals', 'vo2max']
    );
  }

  /**
   * Create 1200m interval session
   */
  private createInterval1200s(weekNumber: number): Session {
    const reps = 4;
    const restSec = 180;
    const qualityMiles = reps * 0.75;

    return this.createSession(
      'Tuesday',
      'I Pace Intervals',
      `${reps}×1200m at I pace (5K effort). ` +
      `Jog ${restSec}s recovery between reps. ` +
      `Total quality: ~${qualityMiles.toFixed(1)} miles. ` +
      `Extended intervals for marathon-specific VO2max work.`,
      60,
      [
        TOKEN_PATTERNS.warmup_1mi,
        TOKEN_PATTERNS.intervals_1200(reps, restSec),
        TOKEN_PATTERNS.cooldown_1mi
      ],
      ['hard_run', 'intervals', 'vo2max']
    );
  }

  /**
   * Create 1 mile interval session
   */
  private createIntervalMiles(weekNumber: number): Session {
    const reps = 3;
    const restMin = 4;
    const qualityMiles = reps;

    return this.createSession(
      'Tuesday',
      'I Pace Intervals',
      `${reps}×1 mile at I pace (5K effort). ` +
      `Jog ${restMin} min recovery between reps. ` +
      `Total quality: ${qualityMiles} miles. ` +
      `Mile repeats for sustained VO2max and mental toughness.`,
      60,
      [
        TOKEN_PATTERNS.warmup_1mi,
        TOKEN_PATTERNS.intervals_1mi(reps, restMin),
        TOKEN_PATTERNS.cooldown_1mi
      ],
      ['hard_run', 'intervals', 'vo2max']
    );
  }

  // ============================================================================
  // M-PACE INJECTOR (Step 5)
  // ============================================================================

  /**
   * Inject M-pace work if eligible (Weeks 5-6, Week B only)
   * Rules:
   * - Skip if weekType === RECOVERY, weekNumber < 5, or weekType === RACE_PREP
   * - Week 7: no extra M (already in long run)
   * - Week 5-6 only: add M midweek only on Week B Thursday
   * - Week A weeks: no midweek M (Thu is T)
   * - Enforce 40 min total @ M cap per week
   */
  private injectMPaceIfEligible(
    sessions: Session[],
    weekNumber: number,
    weekType: WeekType,
    phase: Phase
  ): void {
    // Skip if not eligible
    if (weekType === 'RECOVERY' || weekNumber < 5 || weekType === 'RACE_PREP') {
      return;
    }

    // Week 7: no extra M (already in long run)
    if (weekNumber === 7) {
      return;
    }

    // Only Week B weeks (Weeks 5-6)
    if (weekType !== 'B' || weekNumber > 6) {
      return;
    }

    // Find Thursday session (should be easy/steady in Week B)
    const thursdaySession = sessions.find(s => s.day === 'Thursday');
    if (!thursdaySession) {
      return; // No Thursday session to modify
    }

    // Check if Thursday is already a quality workout (shouldn't be in Week B)
    if (thursdaySession.tags?.some(tag => tag === 'hard_run' || tag === 'threshold' || tag === 'tempo')) {
      return; // Don't stack M on quality day
    }

    // Calculate M-pace segment
    const mpPace = this.getMarathonPaceForTimeCalc();
    let mpTime: number;
    let mpMiles: number;

    if (weekNumber === 5) {
      mpTime = 12; // 10-15 min, use 12 min
      mpMiles = Math.round((mpTime / mpPace) * 10) / 10; // ~2-3 miles
    } else if (weekNumber === 6) {
      mpTime = 18; // 15-20 min, use 18 min
      mpMiles = Math.round((mpTime / mpPace) * 10) / 10; // ~3-4 miles
    } else {
      return; // Shouldn't reach here, but safety check
    }

    // Check total M time for week (long run may already have M)
    const existingMPTime = this.calculateExistingMPTime(sessions);
    if (existingMPTime + mpTime > 40) {
      // Cap at 40 min total
      mpTime = Math.max(0, 40 - existingMPTime);
      if (mpTime < 10) {
        return; // Too little M to add
      }
      mpMiles = Math.round((mpTime / mpPace) * 10) / 10;
    }

    // Replace Thursday easy run with easy + M-pace session
    const easyTime = 25; // ~25 min easy
    const easyMiles = this.minutesToApproximateMiles(easyTime);
    const totalTime = easyTime + mpTime;
    const totalMiles = easyMiles + mpMiles;

    const newSession = this.createSession(
      'Thursday',
      'Easy Run + M Pace',
      `${totalTime} minutes (${totalMiles.toFixed(1)} miles): ` +
      `${easyTime} min @ E pace, then ${mpTime} min @ M pace (marathon goal pace). ` +
      `Early M-pace exposure for rhythm and economy.`,
      totalTime,
      [
        TOKEN_PATTERNS.easy_run(easyTime),
        TOKEN_PATTERNS.mp_run_miles(mpMiles)
      ],
      ['easy_run', 'marathon_pace']
    );

    // Replace Thursday session
    const thursdayIndex = sessions.findIndex(s => s.day === 'Thursday');
    if (thursdayIndex >= 0) {
      sessions[thursdayIndex] = newSession;
    }
  }

  /**
   * Calculate existing M-pace time in sessions (for cap enforcement)
   */
  private calculateExistingMPTime(sessions: Session[]): number {
    let totalMPTime = 0;

    for (const session of sessions) {
      // Check if session has marathon_pace tag
      if (session.tags?.includes('marathon_pace')) {
        // Try to extract M-pace time from description
        const description = session.description || '';
        const mpMatch = description.match(/(\d+)\s*min.*@\s*M\s*pace/);
        if (mpMatch) {
          totalMPTime += parseInt(mpMatch[1], 10);
        } else {
          // Fallback: estimate from miles if we have M-pace tag
          // This is conservative
          totalMPTime += 10; // Estimate 10 min if we can't parse
        }
      }
    }

    return totalMPTime;
  }

  // ============================================================================
  // RACE DAY RESOLVER (Special Case - Distance-First, M-Pace)
  // ============================================================================

  /**
   * Create race day session (JD-compliant: distance-first, M-pace, time-derived)
   * Rules:
   * - Distance: 26.2 miles (fixed)
   * - Pace: M pace (single value, no range)
   * - Duration: computed from distance ÷ M pace
   * - No E pace, no pace ranges, no easy segments
   */
  private createRaceDaySession(): Session {
    const raceName = this.params.race_name || 'MARATHON';
    const raceYear = this.params.race_date ? new Date(this.params.race_date + 'T00:00:00').getFullYear() : new Date().getFullYear();
    
    // Get M pace (marathon goal pace) - this is the ONLY pace for race day
    const mpPace = this.getMarathonPaceForTimeCalc(); // minutes per mile
    
    // Calculate duration from distance ÷ pace (distance-first logic)
    const raceDistance = 26.2; // miles (fixed)
    const raceDuration = Math.round(raceDistance * mpPace); // minutes
    
    // Format pace for description (convert minutes to mm:ss)
    const paceMinutes = Math.floor(mpPace);
    const paceSeconds = Math.round((mpPace - paceMinutes) * 60);
    const paceFormatted = `${paceMinutes}:${String(paceSeconds).padStart(2, '0')}/mi`;
    
    const description = `${raceName} ${raceYear}. ` +
      `26.2 miles at M pace (${paceFormatted}). ` +
      `Trust your training. Go crush it.`;
    
    // Use M-pace token (distance-based, M pace)
    // Token: run_mp_26.2mi (marathon pace run, 26.2 miles)
    return this.createSession(
      'Sunday',
      `${raceName} RACE DAY`,
      description,
      raceDuration,
      [TOKEN_PATTERNS.mp_run_miles(26.2)],
      ['race_day', 'marathon', 'marathon_pace']
    );
  }

  // ============================================================================
  // STRENGTH ATTACHMENT (Step 6)
  // ============================================================================

  /**
   * Attach strength sessions based on resolved run stress
   * Rules:
   * - Week B Tuesday (primary I): attach lower neural (required)
   * - Week A Tuesday: optional lower neural (light run stress)
   * - Week A Thursday: never lower neural (T day)
   * - Recovery: no lower neural
   * - Upper body: optional on Mon/Fri
   */
  private attachStrengthSessions(
    sessions: Session[],
    weekType: WeekType,
    weekNumber: number
  ): void {
    // Find Tuesday and Thursday sessions
    const tuesdaySession = sessions.find(s => s.day === 'Tuesday');
    const thursdaySession = sessions.find(s => s.day === 'Thursday');

    // Week B Tuesday: primary I day → attach lower neural (required)
    if (weekType === 'B' && tuesdaySession) {
      const isPrimaryI = tuesdaySession.tags?.includes('intervals') && 
                         tuesdaySession.tags?.includes('vo2max');
      if (isPrimaryI) {
        // Mark for lower neural strength attachment
        // This would be handled by strength overlay system
        // For now, we just ensure the session is tagged correctly
        if (!tuesdaySession.tags) {
          tuesdaySession.tags = [];
        }
        if (!tuesdaySession.tags.includes('strength_lower_neural')) {
          tuesdaySession.tags.push('strength_lower_neural');
        }
      }
    }

    // Week A Tuesday: optional lower neural (light run stress)
    if (weekType === 'A' && tuesdaySession) {
      const isLightI = tuesdaySession.tags?.includes('strides') || 
                       tuesdaySession.tags?.includes('recovery');
      if (isLightI) {
        // Optional - would be handled by strength overlay
        // Don't force it, but allow it
      }
    }

    // Week A Thursday: never lower neural (T day)
    if (weekType === 'A' && thursdaySession) {
      const isPrimaryT = thursdaySession.tags?.includes('threshold') || 
                         thursdaySession.tags?.includes('tempo');
      if (isPrimaryT) {
        // Explicitly exclude lower neural
        if (thursdaySession.tags?.includes('strength_lower_neural')) {
          thursdaySession.tags = thursdaySession.tags.filter(t => t !== 'strength_lower_neural');
        }
      }
    }

    // Recovery: no lower neural
    if (weekType === 'RECOVERY') {
      // Remove any strength tags from recovery week sessions
      sessions.forEach(s => {
        if (s.tags) {
          s.tags = s.tags.filter(t => !t.startsWith('strength_'));
        }
      });
    }

    // Upper body: optional on Mon/Fri (handled by strength overlay system)
    // We don't need to do anything here - the overlay system will handle it
  }

  /**
   * Check if this is a short/aggressive plan (≤12 weeks)
   */
  private isShortPlan(): boolean {
    return this.params.duration_weeks <= 12;
  }

  /**
   * Calculate starting long run based on current weekly mileage
   * Scales down if user's baseline suggests they're not ready for the default start
   * 
   * Guidelines:
   * - 15-19 mpw: max 8-mile start
   * - 20-24 mpw: max 10-mile start
   * - 25-29 mpw: max 12-mile start
   * - 30+ mpw: can handle 12-mile start
   */
  private calculateStartingLongRun(defaultStart: number): number {
    const currentMiles = this.params.current_weekly_miles;
    
    // If no current mileage provided, use default from duration requirements
    if (!currentMiles) {
      return defaultStart;
    }
    
    // Scale starting long run based on current weekly mileage
    let maxStart: number;
    if (currentMiles < 20) {
      maxStart = 8;
    } else if (currentMiles < 25) {
      maxStart = 10;
    } else if (currentMiles < 30) {
      maxStart = 12;
    } else {
      maxStart = 12; // Cap at 12 even for high mileage runners
    }
    
    // Use the lower of default and calculated max
    return Math.min(defaultStart, maxStart);
  }

  /**
   * Get Week 1 modification note for short plans
   */
  private getWeek1ModificationNote(weekInPhase: number): string {
    if (weekInPhase === 1 && this.isShortPlan()) {
      return ` [Compressed plan note: This assumes recent interval training. ` +
        `If you haven't done structured speed work in 2+ months, reduce Week 1 by 25% ` +
        `(e.g., 3×800m instead of 4×800m, 2×1mi instead of 3×1mi).]`;
    }
    return '';
  }

  /**
   * Base phase intervals - introductory volume
   * Week 1: 4×800m, Week 2: 5×800m, Week 3: 6×800m
   */
  private createBaseIntervalSession(weekInPhase: number): Session {
    const reps = Math.min(6, 3 + weekInPhase); // 4, 5, 6
    const restSec = 120;
    const qualityMiles = reps * 0.5;
    const modNote = this.getWeek1ModificationNote(weekInPhase);

    return this.createSession(
      'Tuesday',
      'I Pace Intervals',
      `${reps}×800m at I pace (5K effort). ` +
      `Jog ${restSec}s recovery between reps. ` +
      `Total quality: ~${qualityMiles.toFixed(1)} miles.${modNote}`,
      45,
      [
        TOKEN_PATTERNS.warmup_1mi,
        TOKEN_PATTERNS.intervals_800(reps, restSec),
        TOKEN_PATTERNS.cooldown_1mi
      ],
      ['hard_run', 'intervals', 'vo2max']
    );
  }

  /**
   * Base phase cruise intervals - introductory T pace
   * Week 1: 3×1mi, Week 2: 3×1mi, Week 3: 3×1.5mi
   */
  private createBaseCruiseSession(weekInPhase: number): Session {
    const reps = 3;
    const milesEach = weekInPhase >= 3 ? 1.5 : 1;
    const totalQuality = reps * milesEach;
    const modNote = this.getWeek1ModificationNote(weekInPhase);

    return this.createSession(
      'Thursday',
      'Cruise Intervals',
      `${reps}×${milesEach}mi at T pace with 60s jog recovery. ` +
      `Total: ${totalQuality} miles @ T (comfortably hard, ~10K effort). ` +
      `These build lactate threshold.${modNote}`,
      45,
      [
        TOKEN_PATTERNS.warmup_1mi,
        TOKEN_PATTERNS.cruise_intervals(reps, milesEach),
        TOKEN_PATTERNS.cooldown_1mi
      ],
      ['hard_run', 'threshold']
    );
  }

  // ============================================================================
  // MILEAGE CALCULATIONS
  // ============================================================================

  /**
   * Get days-per-week multiplier for weekly mileage
   * Fewer running days = lower weekly mileage target
   */
  private getDaysPerWeekMultiplier(): number {
    const daysPerWeek = this.params.days_per_week;
    
    switch (daysPerWeek) {
      case '3-4':
        return 0.65;  // 35% reduction
      case '4-5':
        return 0.80;  // 20% reduction
      case '5-6':
        return 0.95;  // 5% reduction (base target)
      case '6-7':
        return 1.0;   // Full mileage
      default:
        return 0.85;
    }
  }

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
    
    // Apply days-per-week multiplier
    const daysMultiplier = this.getDaysPerWeekMultiplier();
    const adjustedStart = start * daysMultiplier;
    const adjustedPeak = peak * daysMultiplier;
    
    const taperPhase = phaseStructure.phases.find(p => p.name === 'Taper');
    const taperStart = taperPhase?.start_week || totalWeeks;
    
    let targetMiles: number;
    if (weekNumber < taperStart) {
      const progress = (weekNumber - 1) / Math.max(1, taperStart - 2);
      targetMiles = adjustedStart + (adjustedPeak - adjustedStart) * Math.min(1, progress);
    } else {
      const weekInTaper = weekNumber - taperStart + 1;
      targetMiles = adjustedPeak * (weekInTaper === 1 ? 0.6 : 0.4);
    }
    
    if (isRecovery) {
      targetMiles = targetMiles * 0.7;
    }
    
    return Math.round(targetMiles);
  }

  /**
   * Get long run miles for a given week using dynamic progression
   * Calculates progression once and caches it for the plan duration
   * DEPRECATED: Use calculateStateAwareLongRun instead for state-aware logic
   */
  private getLongRunMiles(weekNumber: number, _isRecovery: boolean): number {
    // For non-marathon distances, use the static progression
    if (this.params.distance !== 'marathon') {
      const progression = LONG_RUN_PROGRESSION[this.params.distance]?.[this.params.fitness];
      if (!progression) return 10;
      const index = Math.min(weekNumber - 1, progression.length - 1);
      return progression[index] || 10;
    }

    // Calculate progression once and cache it
    if (!this.longRunProgressionCache) {
      this.longRunProgressionCache = this.calculateLongRunProgression();
    }
    
    const index = weekNumber - 1;
    return this.longRunProgressionCache[index] || 14;
  }

  /**
   * Calculate state-aware long run distance using 4-state machine
   * Handles: Week 1, Recovery Week, Post-Recovery Resume, Standard Build
   */
  private calculateStateAwareLongRun(
    weekNumber: number,
    isRecovery: boolean,
    phaseStructure: PhaseStructure
  ): number {
    const weekIdx = weekNumber - 1; // 0-based index
    const totalWeeks = this.params.duration_weeks;
    
    // Safety: Week 1 or invalid index
    if (weekIdx < 0) {
      return this.getBaseLongRunDistance();
    }
    
    // Get base distance and mileage increase
    const baseDistance = this.getBaseLongRunDistance();
    const mileageIncrease = this.getMileageIncrease();
    
    // STATE 1: Week 1
    if (weekIdx === 0) {
      return baseDistance;
    }
    
    // Safety: Ensure previous week exists and has a valid distance
    if (weekIdx - 1 < 0 || this.longRunHistory[weekIdx - 1] === undefined || this.longRunHistory[weekIdx - 1] === null) {
      return baseDistance;
    }
    
    const prevWeekDist = this.longRunHistory[weekIdx - 1];
    
    // Safety: Ensure previous week distance is a valid number
    if (!Number.isFinite(prevWeekDist) || prevWeekDist <= 0) {
      return baseDistance;
    }
    
    // STATE 2: Recovery Week (75% of previous week)
    if (isRecovery) {
      const recoveryDist = Math.floor(prevWeekDist * 0.75);
      // Ensure minimum of 8 miles for safety
      return Math.max(8, recoveryDist);
    }
    
    // STATE 3: Post-Recovery Resume (look back 2 weeks, skip recovery week)
    // Check if the PREVIOUS week was a recovery week by examining history directly
    // This is more robust than relying on phase structure or modulo checks
    if (weekIdx >= 2) {
      const prevDist = this.longRunHistory[weekIdx - 1];
      const twoWeeksAgoDist = this.longRunHistory[weekIdx - 2];
      
      // Safety: Ensure both values exist and are valid
      if (prevDist !== undefined && twoWeeksAgoDist !== undefined && 
          Number.isFinite(prevDist) && Number.isFinite(twoWeeksAgoDist) &&
          prevDist > 0 && twoWeeksAgoDist > 0) {
        
        // If previous week was significantly smaller (< 80% of two weeks ago), it was a recovery drop
        // This catches recovery weeks even if phase structure is out of sync
        const isRecoveryWeekPrev = prevDist < twoWeeksAgoDist * 0.8;
        
        if (isRecoveryWeekPrev) {
          // Resume from the "High" week (Week n-2) + standard increase
          // Example: Week 3 (14) -> Week 4 (10) -> Week 5 (14 + 1 = 15)
          return twoWeeksAgoDist + mileageIncrease;
        }
      }
    }
    
    // STATE 4: Standard Build (previous week + increase)
    const standardDist = prevWeekDist + mileageIncrease;
    
    // Cap at peak distance (but allow taper to reduce it)
    const peakMiles = this.getMaxLongRunMiles();
    const taperStart = phaseStructure.phases.find(p => p.name === 'Taper')?.start_week || totalWeeks;
    
    // If we're in taper, allow reduction
    if (weekNumber >= taperStart) {
      return standardDist; // Taper logic will handle reduction
    }
    
    // During build, cap at peak
    return Math.min(standardDist, peakMiles);
  }

  /**
   * Get base long run distance for the plan
   */
  private getBaseLongRunDistance(): number {
    const durationReqs = getMarathonDurationRequirements(this.params.duration_weeks);
    return this.calculateStartingLongRun(durationReqs.startingLongRun);
  }

  /**
   * Get standard mileage increase per week (1-2 miles)
   */
  private getMileageIncrease(): number {
    // Shorter plans: +1 mile/week, longer plans: +1-2 miles/week
    if (this.params.duration_weeks <= 12) {
      return 1;
    }
    return 2;
  }

  /**
   * Get number of taper weeks
   */
  private getTaperWeeks(): number {
    const durationReqs = getMarathonDurationRequirements(this.params.duration_weeks);
    return durationReqs.taperWeeks;
  }

  // ============================================================================
  // CORE WEEK CLASSIFICATION (Jack Daniels Method)
  // ============================================================================

  /**
   * Determine if this is a recovery week
   * Recovery weeks occur every 4th week (weeks 4, 8, 12, etc.)
   */
  private isRecoveryWeekJD(weekNumber: number): boolean {
    return weekNumber % 4 === 0;
  }

  /**
   * Determine if this is a race prep week
   * Race prep typically starts around week 9+ for marathon plans
   */
  private isRacePrepWeek(weekNumber: number, phase: Phase): boolean {
    return phase.name === 'Race Prep' || phase.name === 'Taper';
  }

  /**
   * Calculate emphasis counter for Week A/B determination
   * Counter increments only on non-recovery weeks
   * Decouples from recovery week placement for rescheduling safety
   * Week 1 = counter 0 (Week A), Week 2 = counter 1 (Week B), etc.
   */
  private calculateEmphasisCounter(weekNumber: number, phaseStructure: PhaseStructure): number {
    let counter = 0;
    for (let w = 1; w < weekNumber; w++) {
      // Skip recovery weeks (every 4th week)
      if (w % 4 === 0) continue;
      
      // Skip taper weeks (check phase structure)
      const weekPhase = this.getCurrentPhase(w, phaseStructure);
      if (weekPhase.name === 'Taper') continue;
      
      counter++;
    }
    return counter; // Week 1 returns 0 (Week A)
  }

  /**
   * Determine week type: A (T emphasis), B (I emphasis), RECOVERY, or RACE_PREP
   * This is the primary classification used by all other logic
   */
  private getWeekType(weekNumber: number, phase: Phase, phaseStructure: PhaseStructure, isRecovery: boolean): WeekType {
    // Recovery weeks are always RECOVERY type
    if (isRecovery || this.isRecoveryWeekJD(weekNumber)) {
      return 'RECOVERY';
    }

    // Race prep weeks are special case (not A/B pattern)
    if (this.isRacePrepWeek(weekNumber, phase)) {
      return 'RACE_PREP';
    }

    // Calculate emphasis counter for A/B determination
    const emphasisCounter = this.calculateEmphasisCounter(weekNumber, phaseStructure);
    
    // Week A (T emphasis) = even counter (0, 2, 4, ...)
    // Week B (I emphasis) = odd counter (1, 3, 5, ...)
    return emphasisCounter % 2 === 0 ? 'A' : 'B';
  }

  // ============================================================================
  // LONG RUN RESOLVER (Step 2 - Highest Priority)
  // ============================================================================

  /**
   * Get long run target miles for a week (for mileage calculation)
   */
  private getLongRunMilesForWeek(weekNumber: number, isRecovery: boolean, phaseStructure: PhaseStructure): number {
    if (this.params.distance === 'marathon') {
      return this.calculateStateAwareLongRun(weekNumber, isRecovery, phaseStructure);
    } else {
      return this.getLongRunMiles(weekNumber, isRecovery);
    }
  }

  /**
   * Resolve long run session based on week type and JD rules
   * Priority order:
   * 1. Recovery week → reduced easy long run
   * 2. Week 7 → segmented quality long run (Week B only)
   * 3. Week 9 → continuous M finish long run (Race Prep)
   * 4. Week A/B default → easy long run (with optional M finish Weeks 5+)
   * 5. Enforce time caps (2.5h / 3h)
   */
  private resolveLongRun(
    weekNumber: number,
    weekType: WeekType,
    phase: Phase,
    phaseStructure: PhaseStructure,
    isRecovery: boolean
  ): Session | null {
    // Check race proximity
    const sundayProximity = this.getRaceProximitySession(
      this.getDaysUntilRace(weekNumber, 'Sunday', this.params.start_date, this.params.race_date)
    );
    
    if (sundayProximity !== 'normal' && sundayProximity !== 'reduced_quality') {
      return null; // Too close to race
    }

    // PRIORITY 1: Race day (final week, Sunday, marathon distance)
    if (weekNumber === this.params.duration_weeks && this.params.distance === 'marathon') {
      return this.createRaceDaySession();
    }

    // Get target long run miles
    const longRunMiles = this.getLongRunMilesForWeek(weekNumber, isRecovery, phaseStructure);

    // PRIORITY 2: Recovery week → reduced easy long run
    if (weekType === 'RECOVERY') {
      // Recovery weeks: 75% of previous week, capped at 2 hours
      const recoveryMiles = Math.max(8, Math.floor(longRunMiles * 0.75));
      return this.createVDOTLongRun(recoveryMiles, 0);
    }

    // PRIORITY 3: Week 7 → segmented quality long run (Week B only)
    if (weekNumber === 7 && weekType === 'B' && this.params.distance === 'marathon') {
      return this.createQualityLongRunSegmented(longRunMiles);
    }

    // PRIORITY 4: Week 9 → continuous M finish long run (Race Prep)
    if (weekNumber === 9 && weekType === 'RACE_PREP' && this.params.distance === 'marathon') {
      const mpMiles = this.getMPSegmentMiles(weekNumber, phase);
      return this.createVDOTLongRun(longRunMiles, mpMiles);
    }

    // PRIORITY 5: Week A/B default → easy long run (with optional M finish Weeks 5+)
    if (weekType === 'A' || weekType === 'B') {
      // Weeks 5+: Allow small M-pace finish
      let mpMiles = 0;
      if (weekNumber >= 5 && !isRecovery && 
          (this.params.distance === 'marathon' || this.params.distance === 'half')) {
        // Small M-pace finish: last 10-20 min @ M
        const mpPace = this.getMarathonPaceForTimeCalc();
        const mpTime = Math.min(20, 10 + (weekNumber - 5) * 2); // 10 min Week 5, 20 min Week 6+
        mpMiles = Math.round((mpTime / mpPace) * 10) / 10;
      }
      return this.createVDOTLongRun(longRunMiles, mpMiles);
    }

    // Fallback: easy long run
    return this.createVDOTLongRun(longRunMiles, 0);
  }

  /**
   * Create segmented quality long run (Week 7 only)
   * Format: E + 2 × (20 min @ M) with easy between
   * Time-capped at 3 hours
   */
  private createQualityLongRunSegmented(targetMiles: number): Session {
    const easyPace = this.getEasyPaceForTimeCalc();
    const mpPace = this.getMarathonPaceForTimeCalc();
    const timeCap = 180; // 3 hours

    // Structure: 20 min E + 20 min @ M + 10 min E + 20 min @ M + 10 min E
    const mpTime = 20; // 20 minutes @ M pace
    const easyBetween = 10; // 10 minutes easy between segments
    const easyStart = 20; // 20 minutes easy to start
    const easyEnd = 10; // 10 minutes easy to finish

    const totalTime = easyStart + mpTime + easyBetween + mpTime + easyEnd;
    const cappedTime = Math.min(totalTime, timeCap);

    // If capped, scale proportionally
    let finalEasyStart: number;
    let finalMPTime: number;
    let finalEasyBetween: number;
    let finalEasyEnd: number;

    if (cappedTime < totalTime) {
      const scale = cappedTime / totalTime;
      finalEasyStart = Math.round(easyStart * scale / 5) * 5;
      finalMPTime = Math.round(mpTime * scale / 5) * 5;
      finalEasyBetween = Math.round(easyBetween * scale / 5) * 5;
      finalEasyEnd = Math.round(easyEnd * scale / 5) * 5;
    } else {
      finalEasyStart = easyStart;
      finalMPTime = mpTime;
      finalEasyBetween = easyBetween;
      finalEasyEnd = easyEnd;
    }

    const easyMiles1 = this.minutesToApproximateMiles(finalEasyStart, easyPace);
    const mpMiles1 = this.minutesToApproximateMiles(finalMPTime, mpPace);
    const easyMiles2 = this.minutesToApproximateMiles(finalEasyBetween, easyPace);
    const mpMiles2 = this.minutesToApproximateMiles(finalMPTime, mpPace);
    const easyMiles3 = this.minutesToApproximateMiles(finalEasyEnd, easyPace);
    const totalMiles = easyMiles1 + mpMiles1 + easyMiles2 + mpMiles2 + easyMiles3;

    const description = `${cappedTime} minutes (${totalMiles.toFixed(1)} miles): ` +
      `${finalEasyStart} min E + ${finalMPTime} min @ M + ${finalEasyBetween} min E + ${finalMPTime} min @ M + ${finalEasyEnd} min E. ` +
      `Quality long run with structured M-pace segments. Practice returning to M pace under fatigue.`;

    return this.createSession(
      'Sunday',
      'Quality Long Run',
      description,
      cappedTime,
      [TOKEN_PATTERNS.long_run_with_mp(finalEasyStart + finalEasyBetween + finalEasyEnd, finalMPTime * 2)],
      ['long_run', 'quality', 'marathon_pace']
    );
  }

  // ============================================================================
  // TIME-BASED HELPERS (Jack Daniels Method)
  // ============================================================================

  /**
   * Get easy pace in minutes per mile (for time-based calculations)
   * Uses effort_paces if available, otherwise falls back to base class estimate
   */
  private getEasyPaceForTimeCalc(): number {
    // If we have effort_paces (from VDOT calculation), use the base pace
    if (this.params.effort_paces?.base) {
      return this.params.effort_paces.base / 60; // Convert seconds to minutes
    }
    // Fall back to base class fitness-based estimate
    return super.getEasyPaceMinPerMile();
  }

  /**
   * Get marathon pace in minutes per mile (for M-pace segment calculations)
   */
  private getMarathonPaceForTimeCalc(): number {
    // If we have effort_paces, use the race pace (which is M pace)
    if (this.params.effort_paces?.race) {
      return this.params.effort_paces.race / 60; // Convert seconds to minutes
    }
    // Fall back to base class fitness-based estimate
    return super.getMarathonPaceMinPerMile();
  }

  /**
   * Get time cap for long runs based on Jack Daniels' method
   * - 2.5 hours (150 min) for easy long runs
   * - 3 hours (180 min) for long runs with M-pace segments
   */
  private getLongRunTimeCap(hasMPaceSegments: boolean): number {
    return hasMPaceSegments ? 180 : 150; // 3 hours with M-pace, 2.5 hours easy
  }

  /**
   * Convert time (minutes) to approximate miles at easy pace
   * Used for descriptions and tracking
   */
  private minutesToApproximateMiles(minutes: number, paceMinPerMile?: number): number {
    const pace = paceMinPerMile || this.getEasyPaceForTimeCalc();
    return Math.round((minutes / pace) * 10) / 10; // Round to 1 decimal
  }

  /**
   * Calculate long run time based on target progression
   * Applies Jack Daniels time caps (2.5hr easy, 3hr with M-pace)
   */
  private calculateLongRunTime(targetMiles: number, hasMPaceSegments: boolean, mpMiles: number = 0): number {
    const easyPace = this.getEasyPaceForTimeCalc();
    const mpPace = this.getMarathonPaceForTimeCalc();
    const timeCap = this.getLongRunTimeCap(hasMPaceSegments);
    
    // Calculate time if we were to run target miles
    // For runs with M-pace segments, calculate time based on actual M-pace miles
    let estimatedTime: number;
    if (hasMPaceSegments && mpMiles > 0) {
      const easyMiles = targetMiles - mpMiles;
      estimatedTime = (easyMiles * easyPace) + (mpMiles * mpPace);
    } else {
      estimatedTime = targetMiles * easyPace;
    }
    
    // Apply time cap (Jack Daniels rule)
    return Math.min(Math.round(estimatedTime), timeCap);
  }

  /**
   * Calculate dynamic long run progression based on plan duration
   * Duration-aware: shorter plans have earlier peaks and capped distances
   * 
   * Key principles:
   * - Never repeat same distance two weeks in a row (except intentional recovery)
   * - Max +2 miles per week increase
   * - Peak timing and distance based on plan duration
   * - Proper taper (2-3 weeks depending on duration)
   * - Starting volume scales with current weekly mileage
   * - Week before peak must be at peakMiles - 2 to avoid big jumps
   */
  private calculateLongRunProgression(): number[] {
    const planWeeks = this.params.duration_weeks;
    const durationReqs = getMarathonDurationRequirements(planWeeks);
    
    const peakMiles = durationReqs.peakLongRun;
    const taperWeeks = durationReqs.taperWeeks;
    
    // Scale starting volume based on current weekly mileage
    const startMiles = this.calculateStartingLongRun(durationReqs.startingLongRun);
    
    // Calculate peak week position
    const peakWeek = this.calculatePeakWeek(planWeeks, taperWeeks);
    
    // Build the progression using a two-pass approach:
    // 1. First pass: establish the framework (peak, taper, recovery weeks)
    // 2. Second pass: fill in build weeks ensuring smooth progression
    
    const progression: number[] = new Array(planWeeks).fill(0);
    const weekTypes: string[] = new Array(planWeeks).fill('build');
    
    // Pass 1: Mark special weeks
    for (let week = 1; week <= planWeeks; week++) {
      const weeksFromRace = planWeeks - week + 1;
      const idx = week - 1;
      
      // Taper weeks
      if (weeksFromRace <= taperWeeks) {
        progression[idx] = this.getTaperMiles(weeksFromRace, taperWeeks, peakMiles);
        weekTypes[idx] = weeksFromRace === 1 ? 'race' : 'taper';
      }
      // Peak week
      else if (week === peakWeek) {
        progression[idx] = peakMiles;
        weekTypes[idx] = 'peak';
      }
      // Week before peak - must be peakMiles - 2 for smooth transition
      else if (week === peakWeek - 1) {
        progression[idx] = peakMiles - 2;
        weekTypes[idx] = 'pre-peak';
      }
      // Post-peak weeks (between peak and taper) - declining volume
      else if (week > peakWeek && weeksFromRace > taperWeeks) {
        // Calculate declining mileage from peak toward taper
        const weeksAfterPeak = week - peakWeek;
        // Determine first taper week's mileage to ensure smooth transition
        const firstTaperMiles = this.getTaperMiles(taperWeeks, taperWeeks, peakMiles);
        // Post-peak should bridge from peak to taper smoothly
        // Start at peakMiles - 4, end just above first taper week
        const postPeakStart = peakMiles - 4;
        const postPeakEnd = firstTaperMiles + 2; // End 2 miles above taper start
        const postPeakWeeks = planWeeks - peakWeek - taperWeeks;
        
        if (postPeakWeeks <= 1) {
          progression[idx] = postPeakStart;
      } else {
          // Linear decline from postPeakStart to postPeakEnd
          const step = (postPeakStart - postPeakEnd) / (postPeakWeeks - 1);
          progression[idx] = Math.round(postPeakStart - step * (weeksAfterPeak - 1));
        }
        weekTypes[idx] = 'post-peak';
      }
      // Recovery weeks (every 4th week, but not too close to peak) - will be calculated in Pass 2
      else if (week % 4 === 0 && week < peakWeek - 2) {
        weekTypes[idx] = 'recovery';
        // Don't set progression yet - will calculate as 75% of previous week in Pass 2
      }
    }
    
    // Pass 2: Fill in build weeks with smooth progression, then calculate recovery weeks
    // Work forward, ensuring each build week increases by 1-2 miles
    // Build weeks cap at peakMiles - 3, only pre-peak gets peakMiles - 2
    let lastBuildMiles = startMiles - 1; // So first week starts at startMiles
    const buildCap = peakMiles - 3; // e.g., 17 for 20mi peak
    
    for (let week = 1; week <= planWeeks; week++) {
      const idx = week - 1;
      
      // CRITICAL: Handle recovery weeks FIRST - 75% of previous week (hard-coded step-back)
      // This MUST override any linear progression logic
      // Also check if week % 4 === 0 as a fallback (in case weekTypes wasn't set correctly)
      if (weekTypes[idx] === 'recovery' || (week % 4 === 0 && week < peakWeek - 2 && weekTypes[idx] !== 'peak' && weekTypes[idx] !== 'taper' && weekTypes[idx] !== 'pre-peak' && weekTypes[idx] !== 'post-peak')) {
        const previousWeekMiles = idx > 0 ? progression[idx - 1] : startMiles;
        // Hard-code step-back: recovery weeks are always 75% of previous week
        // Ensure minimum of 8 miles for safety
        const recoveryMiles = Math.max(8, Math.round(previousWeekMiles * 0.75));
        progression[idx] = recoveryMiles;
        weekTypes[idx] = 'recovery'; // Ensure it's marked
        // Don't update lastBuildMiles - we'll resume from pre-recovery level
        continue;
      }
      
      // Skip already-filled weeks (peak, taper, pre-peak, post-peak)
      if (progression[idx] > 0) {
        lastBuildMiles = progression[idx];
        continue;
      }
      
      // Calculate target for this build week
      const milesNeeded = buildCap - lastBuildMiles; // Need to reach buildCap (not pre-peak value)
      
      // How many build weeks remain? (excluding recovery weeks and pre-peak)
      let buildWeeksRemaining = 0;
      for (let w = week; w < peakWeek - 1; w++) {
        if (weekTypes[w - 1] !== 'recovery' && weekTypes[w - 1] !== 'pre-peak') {
          buildWeeksRemaining++;
        }
      }
      
      let targetMiles: number;
      if (buildWeeksRemaining <= 0) {
        targetMiles = buildCap;
      } else {
        // Calculate ideal increment
        const idealIncrement = milesNeeded / buildWeeksRemaining;
        // Constrain to 1-2 mile increase
        const increment = Math.max(1, Math.min(2, Math.ceil(idealIncrement)));
        targetMiles = lastBuildMiles + increment;
      }
      
      // Ensure we don't exceed build cap (save peakMiles-2 for pre-peak only)
      targetMiles = Math.min(targetMiles, buildCap);
      
      // Ensure we don't repeat same distance
      if (targetMiles === lastBuildMiles) {
        targetMiles = Math.min(buildCap, lastBuildMiles + 1);
      }
      
      progression[idx] = targetMiles;
      lastBuildMiles = targetMiles;
    }
    
    return progression;
  }

  /**
   * Calculate peak week position based on plan duration
   * Shorter plans peak earlier to allow proper taper
   * Goal: Peak should be 4-6 weeks before race for optimal recovery
   */
  private calculatePeakWeek(planWeeks: number, _taperWeeks: number): number {
    if (planWeeks <= 10) {
      return 6;  // Week 6 for 10-week plans (4 weeks out)
    } else if (planWeeks <= 11) {
      return 6;  // Week 6 for 11-week plans (5 weeks out)
    } else if (planWeeks <= 12) {
      return 8;  // Week 8 for 12-week plans (4 weeks out)
    } else if (planWeeks <= 13) {
      return 9;  // Week 9 for 13-week plans (4 weeks out)
    } else if (planWeeks <= 14) {
      return 10; // Week 10 for 14-week plans (4 weeks out)
    } else if (planWeeks <= 15) {
      return 11; // Week 11 for 15-week plans (4 weeks out)
    } else {
      return 12; // Week 12 for 16-week plans (4 weeks out)
    }
  }

  /**
   * Get taper week long run miles
   * Progressive reduction toward race week
   */
  private getTaperMiles(weeksFromRace: number, totalTaperWeeks: number, peakMiles: number): number {
    // Race week
    if (weeksFromRace === 1) {
      return 8;  // Minimal long run, may be skipped by race proximity logic
    }
    
    // Progressive taper based on weeks from race
    if (totalTaperWeeks >= 3) {
      // 3-week taper: 14 → 10 → 8
      if (weeksFromRace === 2) return 10;
      if (weeksFromRace === 3) return 14;
    } else {
      // 2-week taper: 10 → 8
      if (weeksFromRace === 2) return 10;
    }
    
    // Fallback
    return Math.round(peakMiles * 0.6);
  }

  /**
   * Get recovery week long run miles
   * DEPRECATED: Recovery weeks now calculated as 75% of previous week in calculateLongRunProgression
   * This method kept for backwards compatibility but not used
   */
  private getRecoveryWeekMiles(week: number, startMiles: number): number {
    // Recovery weeks: start at 10, can go up to 12 later in plan
    return Math.min(12, startMiles - 2 + Math.floor(week / 8) * 2);
  }

  /**
   * Get peak long run distance based on plan duration and fitness
   * Shorter plans cap at 18 miles; longer plans can reach 20
   */
  private getMaxLongRunMiles(): number {
    const durationReqs = getMarathonDurationRequirements(this.params.duration_weeks);
    return durationReqs.peakLongRun;
  }

  /**
   * Calculate progressive build-up miles for a given week
   * Ensures:
   * - Minimum +1 mile per week (except recovery)
   * - Maximum +2 miles per week
   * - Never repeat same distance
   */
  private calculateBuildUpMiles(
    currentWeek: number,
    peakWeek: number,
    peakMiles: number,
    startMiles: number,
    previousMiles: number
  ): number {
    // Calculate how many build weeks we have (excluding recovery weeks)
    const buildWeeks = peakWeek - 1;
    const recoveryWeeksInBuild = Math.floor(buildWeeks / 4);
    const effectiveBuildWeeks = buildWeeks - recoveryWeeksInBuild;
    
    // Calculate effective week (excluding recovery weeks already passed)
    const recoveryWeeksPassed = Math.floor((currentWeek - 1) / 4);
    const effectiveWeek = currentWeek - recoveryWeeksPassed;
    
    // Calculate target miles based on linear progression
    const milesNeeded = peakMiles - 2 - startMiles;  // -2 so peak week is distinct
    const progressRatio = Math.min(1, (effectiveWeek - 1) / Math.max(1, effectiveBuildWeeks - 1));
    let targetMiles = startMiles + milesNeeded * progressRatio;
    
    // Ensure at least +1 mile from previous (unless that would exceed cap)
    const minMiles = previousMiles > 0 ? previousMiles + 1 : startMiles;
    const maxMiles = previousMiles > 0 ? previousMiles + 2 : startMiles + 2;
    
    // Round and constrain
    targetMiles = Math.round(targetMiles);
    targetMiles = Math.max(minMiles, Math.min(maxMiles, targetMiles));
    
    // Never exceed peak - 2 during build
    targetMiles = Math.min(targetMiles, peakMiles - 2);
    
    return targetMiles;
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
   * Long run with VDOT pacing description (TIME-BASED per Jack Daniels method)
   * Uses time caps: 2.5 hours for easy runs, 3 hours for runs with M-pace segments
   */
  private createVDOTLongRun(targetMiles: number, mpMiles: number = 0): Session {
    const hasMPaceSegments = mpMiles > 0;
    
    // Calculate actual time based on pace, applying Jack Daniels time caps
    const totalTime = this.calculateLongRunTime(targetMiles, hasMPaceSegments, mpMiles);
    const timeCap = this.getLongRunTimeCap(hasMPaceSegments);
    
    // Calculate approximate miles for description (may be less than target if capped)
    const easyPace = this.getEasyPaceForTimeCalc();
    const mpPace = this.getMarathonPaceForTimeCalc();
    
    let description: string;
    let tokens: string[];
    
    if (hasMPaceSegments) {
      // Calculate time breakdown for M-pace segments
      // First, calculate what the time would be without cap
      const mpTimeUncapped = mpMiles * mpPace;
      const easyMilesUncapped = targetMiles - mpMiles;
      const easyTimeUncapped = easyMilesUncapped * easyPace;
      const totalTimeUncapped = easyTimeUncapped + mpTimeUncapped;
      
      // If time was capped, scale down proportionally
      let mpTime: number;
      let easyTime: number;
      if (totalTimeUncapped > timeCap) {
        const scaleFactor = timeCap / totalTimeUncapped;
        mpTime = mpTimeUncapped * scaleFactor;
        easyTime = easyTimeUncapped * scaleFactor;
      } else {
        mpTime = mpTimeUncapped;
        easyTime = easyTimeUncapped;
      }
      
      const easyMilesApprox = this.minutesToApproximateMiles(easyTime, easyPace);
      const mpMilesActual = this.minutesToApproximateMiles(mpTime, mpPace);
      const totalMilesApprox = easyMilesApprox + mpMilesActual;
      
      // Round times to nearest 5 minutes for cleaner descriptions
      const easyTimeRounded = Math.round(easyTime / 5) * 5;
      const mpTimeRounded = Math.round(mpTime / 5) * 5;
      
      description = `${totalTime} minutes (${totalMilesApprox.toFixed(1)} miles): ` +
        `First ${easyTimeRounded} minutes at E pace (easy, conversational), ` +
        `final ${mpTimeRounded} minutes at M pace (marathon goal pace). ` +
        `Practice race-day fueling and pacing.`;
      
      // Use time-based tokens per Jack Daniels method
      tokens = [TOKEN_PATTERNS.long_run_with_mp(easyTimeRounded, mpTimeRounded)];
    } else {
      const totalMilesApprox = this.minutesToApproximateMiles(totalTime, easyPace);
      const timeRounded = Math.round(totalTime / 5) * 5;
      
      description = `${timeRounded} minutes (${totalMilesApprox.toFixed(1)} miles) at E pace (easy, conversational). ` +
        `Stay relaxed and save energy for quality days.`;
      
      // Use time-based tokens per Jack Daniels method
      tokens = [TOKEN_PATTERNS.long_run(timeRounded)];
    }
    
    // Note if time was capped
    if (totalTime >= timeCap && targetMiles * easyPace > timeCap) {
      description += ` [Time capped at ${timeCap} minutes per Jack Daniels' method to prevent excessive fatigue.]`;
    }
    
    return this.createSession('Sunday', 'Long Run', description, totalTime, tokens, ['long_run']);
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
   * Marathon pace run (M pace session)
   */
  private createMPaceSession(weekInPhase: number): Session {
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
   * Easy run with strides (TIME-BASED per Jack Daniels method)
   */
  private createEasyWithStrides(targetMiles: number, day: string): Session {
    const easyPace = this.getEasyPaceForTimeCalc();
    const easyTime = Math.round(targetMiles * easyPace);
    const easyTimeRounded = Math.round(easyTime / 5) * 5;
    const easyMilesApprox = this.minutesToApproximateMiles(easyTimeRounded, easyPace);
    
    return this.createSession(
      day,
      'Easy Run + Strides',
      `${easyTimeRounded} minutes (${easyMilesApprox.toFixed(1)} miles) at E pace, then 4×100m strides (fast but relaxed, full recovery). ` +
      `Strides maintain leg turnover and neuromuscular coordination.`,
      easyTimeRounded + 10,
      [TOKEN_PATTERNS.easy_run(easyTimeRounded), TOKEN_PATTERNS.strides_4x100m],
      ['easy_run', 'strides', 'recovery'] // Explicitly tag as recovery/aerobic, not quality
    );
  }

  /**
   * Create time-based easy run (per Jack Daniels method)
   */
  private createEasyRunTime(targetMiles: number, day: string): Session {
    const easyPace = this.getEasyPaceForTimeCalc();
    const easyTime = Math.round(targetMiles * easyPace);
    const easyTimeRounded = Math.round(easyTime / 5) * 5;
    const easyMilesApprox = this.minutesToApproximateMiles(easyTimeRounded, easyPace);
    
    return this.createSession(
      day,
      'Easy Run',
      `${easyTimeRounded} minutes (${easyMilesApprox.toFixed(1)} miles) at E pace. Recovery and aerobic maintenance.`,
      easyTimeRounded,
      [TOKEN_PATTERNS.easy_run(easyTimeRounded)],
      ['easy_run']
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
   * Get appropriate easy run time range based on days_per_week selection
   * Fewer days = shorter easy runs to keep weekly volume appropriate
   * Returns time in minutes (per Jack Daniels "time on feet" philosophy)
   */
  private getEasyRunTimeRange(): { min: number; max: number } {
    const daysPerWeek = this.params.days_per_week;
    
    switch (daysPerWeek) {
      case '3-4':
        return { min: 30, max: 45 };  // 30-45 minutes
      case '4-5':
        return { min: 35, max: 50 };  // 35-50 minutes
      case '5-6':
        return { min: 40, max: 60 };  // 40-60 minutes
      case '6-7':
        return { min: 45, max: 60 };  // 45-60 minutes
      default:
        return { min: 35, max: 50 };
    }
  }

  /**
   * Fill remaining days with easy runs (TIME-BASED per Jack Daniels method)
   * Uses "time on feet" approach rather than distance
   */
  private fillWithEasyRuns(
    sessions: Session[], 
    targetDays: number,
    remainingMiles: number
  ): void {
    const remainingDays = Math.max(0, targetDays - sessions.length);
    if (remainingDays <= 0) return;

    const { min, max } = this.getEasyRunTimeRange();
    const easyPace = this.getEasyPaceForTimeCalc();
    
    // Convert remaining miles to approximate time, then distribute
    const totalTimeNeeded = remainingMiles * easyPace;
    const timePerDay = Math.max(min, Math.round(totalTimeNeeded / remainingDays));
    const easyTime = Math.max(min, Math.min(max, timePerDay));
    
    // Round to nearest 5 minutes for cleaner descriptions
    const easyTimeRounded = Math.round(easyTime / 5) * 5;
    const easyMilesApprox = this.minutesToApproximateMiles(easyTimeRounded, easyPace);
    
    for (let i = 0; i < remainingDays; i++) {
      sessions.push(this.createSession(
        '',
        'Easy Run',
        `${easyTimeRounded} minutes (${easyMilesApprox.toFixed(1)} miles) at E pace. Recovery and aerobic maintenance.`,
        easyTimeRounded,
        [TOKEN_PATTERNS.easy_run(easyTimeRounded)],
        ['easy_run']
      ));
    }
  }
}
