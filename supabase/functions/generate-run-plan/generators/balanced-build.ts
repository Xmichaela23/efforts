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

export class BalancedBuildGenerator extends BaseGenerator {
  // Cache for dynamically calculated long run progression
  private longRunProgressionCache?: number[];

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
    const longRunMiles = this.getLongRunMiles(weekNumber, isRecovery);
    
    // Check race proximity for each day - this enables smart tapering
    const raceProximity = this.checkWeekRaceProximity(weekNumber);
    
    // If any day this week is within 7 days of race, use race-aware session generation
    if (raceProximity.hasRaceWeekSessions) {
      return this.generateRaceWeekSessions(weekNumber, raceProximity, runningDays);
    }
    
    // Long run (Sunday) - with MP segments in Phase III
    // Skip if Sunday is too close to race
    const sundayProximity = this.getRaceProximitySession(
      this.getDaysUntilRace(weekNumber, 'Sunday', this.params.start_date, this.params.race_date)
    );
    
    if (sundayProximity === 'normal' || sundayProximity === 'reduced_quality') {
      const withMP = phase.name === 'Race Prep' && !isRecovery && 
                     (this.params.distance === 'marathon' || this.params.distance === 'half');
      const mpMiles = withMP ? this.getMPSegmentMiles(weekNumber, phase) : 0;
      
      // Long run uses dynamic progression which already handles tapering
      // No need for race proximity caps - progression positions peak correctly
      sessions.push(this.createVDOTLongRun(longRunMiles, mpMiles));
    }

    let usedMiles = sessions.length > 0 ? longRunMiles : 0;

    // Two Quality Days (2Q System) - not in recovery or taper
    if (!isRecovery) {
      const quality = this.addQualitySessions(sessions, weekNumber, phase, runningDays);
      usedMiles += quality;
    } else {
      // Recovery week: reduced quality on both Tuesday and Thursday
      // Tuesday: Easy + Strides (maintains leg turnover)
      sessions.push(this.createEasyWithStrides(4, 'Tuesday'));
      usedMiles += 4;
      
      // Thursday: Easy run (reduced volume, maintains 2Q structure)
      if (runningDays >= 5) {
        sessions.push(this.createEasyRunMiles(3, 'Thursday'));
        usedMiles += 3;
      }
    }

    // Fill with easy runs
    this.fillWithEasyRuns(sessions, runningDays, weeklyMiles - usedMiles);

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

    for (const day of days) {
      const proximity = raceProximity.dayProximity[day];

      switch (proximity) {
        case 'race':
          // Race day - THE MARATHON
          // Only add if this is the final week and Sunday
          if (weekNumber === this.params.duration_weeks && day === 'Sunday') {
            const raceName = this.params.race_name || 'MARATHON';
            const raceYear = this.params.race_date ? new Date(this.params.race_date + 'T00:00:00').getFullYear() : new Date().getFullYear();
            sessions.push(this.createSession(
              day,
              'RACE DAY',
              `${raceName} ${raceYear}. Trust your training. Go crush it.`,
              this.milesToMinutes(26.2),
              [TOKEN_PATTERNS.long_run(this.milesToMinutes(26.2))],
              ['race', 'marathon']
            ));
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
  // QUALITY SESSIONS (2Q SYSTEM)
  // ============================================================================

  /**
   * Add quality sessions based on phase
   * 2Q System: Two quality days EVERY non-recovery week
   * Q1 = Tuesday (Intervals)
   * Q2 = Thursday (Tempo/Cruise)
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
        // Phase I: Foundation - 2Q from Week 1
        // Q1 Tuesday: Introductory intervals (lower volume)
        sessions.push(this.createBaseIntervalSession(weekInPhase));
        mileageUsed += 5;
        
        // Q2 Thursday: Cruise intervals (T pace)
        if (runningDays >= 5) {
          sessions.push(this.createBaseCruiseSession(weekInPhase));
          mileageUsed += 5;
        }
        break;

      case 'Speed':
        // Phase II: Full I + T work
        // Q1 Tuesday: Intervals
        sessions.push(this.createIntervalSession(weekInPhase));
        mileageUsed += 6;
        
        // Q2 Thursday: Cruise Intervals
        if (runningDays >= 5) {
          sessions.push(this.createCruiseIntervals(weekInPhase));
          mileageUsed += 7;
        }
        break;

      case 'Race Prep':
        // Phase III: Marathon-specific M pace work
        if (this.params.distance === 'marathon' || this.params.distance === 'half') {
          // Q1 Tuesday: MP run
          sessions.push(this.createMPaceSession(weekInPhase));
          mileageUsed += 6;
          
          // Q2 Thursday: Cruise intervals
          if (runningDays >= 5) {
            sessions.push(this.createCruiseIntervals(weekInPhase));
            mileageUsed += 7;
          }
        } else {
          // Shorter distances: continue I + T
          sessions.push(this.createIntervalSession(weekInPhase));
          mileageUsed += 6;
          if (runningDays >= 5) {
            sessions.push(this.createTempoRun(weekInPhase));
            mileageUsed += 6;
          }
        }
        break;

      case 'Taper':
        // Phase IV: Reduced volume sharpening - 1Q only
        sessions.push(this.createTaperInterval());
        mileageUsed += 4;
        break;
    }

    return mileageUsed;
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
      
      // Handle recovery weeks: 75% of previous week
      if (weekTypes[idx] === 'recovery') {
        const previousWeekMiles = idx > 0 ? progression[idx - 1] : startMiles;
        progression[idx] = Math.round(previousWeekMiles * 0.75);
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
   * Get appropriate easy run distance based on days_per_week selection
   * Fewer days = shorter easy runs to keep weekly volume appropriate
   */
  private getEasyRunCaps(): { min: number; max: number } {
    const daysPerWeek = this.params.days_per_week;
    
    switch (daysPerWeek) {
      case '3-4':
        return { min: 3, max: 5 };
      case '4-5':
        return { min: 4, max: 6 };  // Reduced from 4-8
      case '5-6':
        return { min: 5, max: 7 };
      case '6-7':
        return { min: 5, max: 8 };
      default:
        return { min: 4, max: 6 };
    }
  }

  /**
   * Fill remaining days with easy runs
   * Scales easy run distance based on days_per_week selection
   */
  private fillWithEasyRuns(
    sessions: Session[], 
    targetDays: number,
    remainingMiles: number
  ): void {
    const remainingDays = Math.max(0, targetDays - sessions.length);
    if (remainingDays <= 0) return;

    const { min, max } = this.getEasyRunCaps();
    const milesPerDay = Math.max(min, Math.round(remainingMiles / remainingDays));
    const easyMiles = Math.max(min, Math.min(max, milesPerDay));
    
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
