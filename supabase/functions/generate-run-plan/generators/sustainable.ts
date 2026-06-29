// Sustainable Generator - Hal Higdon Inspired
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
import { canonicalizePhaseName, isRestedTerminal } from '../../_shared/periodization/index.ts';
import { hrZones, paceZonesFromVdot, longRunMilesForWeek, rampWeeksForPhase, type PhaseKey } from '../../_shared/endurance/index.ts';
import { formatPace } from '../effort-score.ts';

// Long run progression by fitness level (in miles)
// SMOOTH progression: max +1 mile per week, recovery weeks reduce by ~30%
// Post-recovery: resume at pre-recovery level (not beyond)
const LONG_RUN_PROGRESSION: Record<string, Record<string, number[]>> = {
  'marathon': {
    'beginner': [
      // Weeks 1-4: Build 6→8, recovery drops to 6
      6, 7, 8, 6,
      // Weeks 5-8: Resume 8→11, recovery drops to 8  
      8, 9, 10, 8,
      // Weeks 9-12: Resume 10→13, recovery drops to 10
      10, 11, 12, 10,
      // Weeks 13-16: Peak at 18, recovery drops to 13
      14, 16, 18, 13,
      // Weeks 17-20: Final build and taper
      15, 17, 12, 8    // Week 17 resume, 18 peak, 19 taper, 20 race week
    ],
    'intermediate': [
      8, 9, 10, 8,      // Weeks 1-4
      10, 11, 12, 10,   // Weeks 5-8
      12, 14, 16, 12,   // Weeks 9-12
      16, 18, 20, 14,   // Weeks 13-16
      16, 18, 14, 10   // Weeks 17-20: Final build and taper
    ],
    'advanced': [
      10, 11, 12, 10,   // Weeks 1-4
      12, 14, 16, 12,   // Weeks 5-8
      16, 18, 20, 14,   // Weeks 9-12
      18, 20, 20, 16,   // Weeks 13-16
      18, 20, 16, 12    // Weeks 17-20: Final build and taper
    ]
  },
  'half': {
    'beginner': [5, 6, 7, 5, 7, 8, 9, 7, 9, 10, 11, 8],
    'intermediate': [6, 7, 8, 6, 8, 9, 10, 8, 10, 11, 12, 8],
    'advanced': [8, 9, 10, 8, 10, 11, 12, 10, 12, 13, 14, 10]
  },
  '10k': {
    'beginner': [4, 5, 6, 4, 5, 6, 7, 5, 7, 8, 8, 6],
    'intermediate': [5, 6, 7, 5, 7, 8, 9, 7, 9, 10, 10, 7],
    'advanced': [7, 8, 9, 7, 9, 10, 11, 8, 10, 11, 12, 8]
  },
  '5k': {
    'beginner': [3, 4, 4, 3, 4, 5, 5, 4, 5, 6, 6, 4],
    'intermediate': [4, 5, 5, 4, 5, 6, 6, 5, 6, 7, 7, 5],
    'advanced': [5, 6, 7, 5, 7, 8, 8, 6, 8, 9, 9, 7]
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

export class SustainableGenerator extends BaseGenerator {
  generatePlan(): TrainingPlan {
    const phaseStructure = this.determinePhaseStructure();
    const sessions_by_week: Record<string, Session[]> = {};
    const weekly_summaries: Record<string, any> = {};
    const volume_notes: string[] = []; // E3b glass-box: budget-vs-legal-week reconciliation surfaced here

    for (let week = 1; week <= this.params.duration_weeks; week++) {
      const phase = this.getCurrentPhase(week, phaseStructure);
      const isRecovery = this.isRecoveryWeek(week, phaseStructure);

      const weekSessions = this.generateWeekSessions(week, phase, phaseStructure, isRecovery, volume_notes);
      sessions_by_week[week.toString()] = weekSessions;
      weekly_summaries[week.toString()] = this.generateWeeklySummary(
        week, weekSessions, phase, isRecovery
      );
    }

    // E3b Part 2 — carry the budget split (one number, no double-count). rideHrs has no consumer yet;
    // the future bike engine reads it through this same path with zero rework.
    if ((this.params.weekly_hours ?? 0) > 0) {
      const s = this.budgetSplit();
      console.log(`[PlanGen] E3b budget split: total ${s.total}h = strength ${s.reserveHrs}h + run ${s.runHrs}h + ride ${s.rideHrs}h  (sum ${s.reserveHrs + s.runHrs + s.rideHrs}h)`);
    }

    return {
      name: this.generatePlanName(),
      description: this.generatePlanDescription(),
      duration_weeks: this.params.duration_weeks,
      units: this.params.units ?? 'imperial',
      baselines_required: {
        run: ['easyPace'] // Only need easy pace - effort-based training
      },
      weekly_summaries,
      sessions_by_week,
      ...(volume_notes.length ? { volume_notes } : {})
    };
  }

  protected generatePlanName(): string {
    // If we have a race name, use it (e.g., "Boston Marathon 2025 Completion Plan")
    if (this.params.race_name && this.params.race_date) {
      const year = new Date(this.params.race_date + 'T00:00:00').getFullYear();
      return `${this.params.race_name} ${year} Completion Plan`;
    }
    
    // Fallback to distance-based naming
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
    isRecovery: boolean,
    volumeNotes: string[] = []
  ): Session[] {
    const sessions: Session[] = [];
    // Use week-specific day count (fewer days on recovery weeks)
    const runningDays = this.getRunningDaysForWeek(weekNumber, phaseStructure);

    // E3b: budget-anchored when a weekly_hours budget is supplied (non-race); else the legacy tables
    // (the no-budget default — races/no-budget callers stay byte-identical). SPEC-e3b-bottom-up-volume.md.
    const budgeted = (this.params.weekly_hours ?? 0) > 0;

    // Weekly target — hours budget (→ miles via pace) when budgeted, else the legacy table.
    const weeklyMiles = budgeted
      ? this.budgetWeeklyMiles(isRecovery)
      : this.calculateWeeklyMileage(weekNumber, phase, isRecovery, phaseStructure);

    // Long run — distance-precise spine ramp when budgeted, else the legacy table.
    const longRunMiles = budgeted
      ? this.spineLongRunMiles(weekNumber, phase)
      : this.getLongRunMiles(weekNumber);

    // Check race proximity for each day - this enables smart tapering
    const raceProximity = this.checkWeekRaceProximity(weekNumber);
    
    // If any day this week is within 7 days of race, use race-aware session generation
    if (raceProximity.hasRaceWeekSessions) {
      return this.generateRaceWeekSessions(weekNumber, raceProximity, runningDays);
    }
    
    // Check Sunday proximity for long run adjustments
    const sundayProximity = this.getRaceProximitySession(
      this.getDaysUntilRace(weekNumber, 'Sunday', this.params.start_date, this.params.race_date)
    );
    
    // Long run (always on Sunday) - reduce if close to race
    if (sundayProximity === 'normal' || sundayProximity === 'reduced_quality') {
      const adjustedLongRunMiles = sundayProximity === 'reduced_quality' 
        ? Math.min(longRunMiles, 10) 
        : longRunMiles;
      sessions.push(this.createSimpleLongRun(adjustedLongRunMiles));
    }

    let usedMiles = sessions.length > 0 ? longRunMiles : 0;

    // Add optional speedwork (not in recovery weeks or a rested terminal — taper OR retest)
    if (!isRecovery && !isRestedTerminal(canonicalizePhaseName(phase.name))) {
      // Light speedwork: strides or fartlek (only 1x per week, optional feel)
      if (weekNumber >= 3 && runningDays >= 4) {
        const speedworkMiles = 4;
        sessions.push(this.createOptionalSpeedwork(weekNumber, phase));
        usedMiles += speedworkMiles;
      }
    }

    // Glass-box reconciliation (never cram): a LEGAL week = current sessions + easy runs maxed at the
    // protocol's 5mi ceiling on the ≤3 easy-day slots (Mon/Wed/Fri). Surface the gap when the budget
    // wants more than that holds, or when the distance-precise long run alone overruns the budget.
    if (budgeted) {
      const easyDays = Math.max(0, Math.min(3, runningDays - sessions.length));
      const legalMax = usedMiles + easyDays * 5; // protocol §5.2 easy ceiling
      if (longRunMiles > weeklyMiles) {
        volumeNotes.push(`Week ${weekNumber}: the distance-precise long run (${longRunMiles}mi) alone exceeds this week's time budget (${weeklyMiles}mi). Long run kept; week kept minimal — raise hours or accept a larger long-run share.`);
      } else if (weeklyMiles > legalMax + 1) {
        const overHrs = (weeklyMiles - legalMax) * this.enduranceEasyPaceMinPerMile() / 60;
        volumeNotes.push(`Week ${weekNumber}: your time budget allows ~${overHrs.toFixed(1)}h more than a legal ${runningDays}-day week holds (long run + ${easyDays} easy runs ≤5mi). Add a training day or accept a lighter week — not crammed.`);
      }
    }

    // Fill remaining days with easy runs (budget-aware: easy ∈ [3,5]mi on ≤3 slots — never cram)
    this.fillWithSimpleEasyRuns(sessions, runningDays, weeklyMiles - usedMiles, budgeted);

    // Assign days
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
          // Race day - don't add a training session
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
            '3-4 miles very easy. Keep the legs loose and stay relaxed.',
            this.milesToMinutes(4),
            [TOKEN_PATTERNS.easy_run_miles(4)],
            ['easy_run', 'taper']
          ));
          break;
          
        case 'easy_medium':
          // 5-7 days before race: normal easy, maybe light strides
          if (day === 'Tuesday' && sessions.length < runningDays) {
            // Light strides to stay sharp
            sessions.push(this.createSession(
              day,
              'Easy + Strides',
              '4 miles easy with 4×100m strides. Keep it light and fun!',
              this.milesToMinutes(4) + 5,
              [TOKEN_PATTERNS.easy_run_miles(4), TOKEN_PATTERNS.strides_4x100m],
              ['easy_run', 'strides', 'taper']
            ));
          } else if (day === 'Sunday') {
            // Reduced long run
            sessions.push(this.createSimpleLongRun(8));
          } else if (sessions.length < runningDays) {
            sessions.push(this.createSimpleEasyRun(4, day));
          }
          break;
          
        case 'reduced_quality':
          // 8-14 days before race - reduced but still training
          if (day === 'Tuesday' && sessions.length < runningDays) {
            sessions.push(this.createSession(
              day,
              'Easy + Strides',
              '4 miles easy with 4×100m strides. Keep it light!',
              this.milesToMinutes(4) + 5,
              [TOKEN_PATTERNS.easy_run_miles(4), TOKEN_PATTERNS.strides_4x100m],
              ['easy_run', 'strides']
            ));
          } else if (day === 'Sunday') {
            // Reduced long run (10 miles max)
            sessions.push(this.createSimpleLongRun(Math.min(10, this.getLongRunMiles(weekNumber))));
          } else if (sessions.length < runningDays && day !== 'Saturday') {
            sessions.push(this.createSimpleEasyRun(5, day));
          }
          break;
          
        case 'normal':
          // More than 14 days out - should not be in race week, skip
          break;
      }
    }

    return sessions;
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

    // Use athlete's actual current volume as week-1 anchor when available,
    // respecting ACWR fatigue and volume trend signals.
    const effectiveStart = this.resolveEffectiveStartVolume(start, peak);

    const taperPhase = phaseStructure.phases.find(p => isRestedTerminal(canonicalizePhaseName(p.name)));
    const taperStart = taperPhase?.start_week || this.params.duration_weeks;

    let targetMiles: number;
    if (weekNumber < taperStart) {
      const progress = (weekNumber - 1) / Math.max(1, taperStart - 2);
      targetMiles = effectiveStart + (peak - effectiveStart) * Math.min(1, progress);
    } else {
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

    // Peak pivot: athlete is already at or near peak fitness and this is a
    // short plan. Route to either a maintenance arc (peak-bridge) or an
    // ascending re-entry arc depending on how recently the peak occurred.
    const recentLongRun = this.params.recent_long_run_miles;
    if (recentLongRun && this.isAtPeakFitness(progression) && this.params.duration_weeks <= 10) {
      const totalWeeks = this.params.duration_weeks;
      const raceWeekMiles = Math.max(4, Math.round(recentLongRun * 0.30));
      const weeksSincePeak = this.params.weeks_since_peak_long_run ?? 0;
      const transitionMode = this.params.transition_mode;

      const taperStartWeek = totalWeeks <= 6
        ? totalWeeks - 1
        : Math.round(totalWeeks * 0.72);

      const recoveryWeeks: number[] = [];
      for (let w = 4; w <= totalWeeks; w += 4) {
        if (w < taperStartWeek) recoveryWeeks.push(w);
      }
      const isThisRecovery = recoveryWeeks.includes(weekNumber);

      // Decide arc: if peak was recent (<=2 weeks) and not a recovery rebuild,
      // use the original descending maintenance arc. Otherwise use ascending re-entry.
      const needsReEntry = weeksSincePeak > 2
        || transitionMode === 'recovery_rebuild'
        || (transitionMode === 'peak_bridge' && weeksSincePeak > 2);

      if (needsReEntry) {
        // Ascending re-entry: same structure as performance-build's re-entry arc
        if (isThisRecovery) {
          return Math.max(6, Math.round(recentLongRun * 0.55));
        }
        if (weekNumber >= taperStartWeek) {
          const taperWeeksTotal = totalWeeks - taperStartWeek + 1;
          const taperWeekIdx = weekNumber - taperStartWeek;
          const taperEntryMiles = Math.round(recentLongRun * 0.70);
          const dropPerWeek = (taperEntryMiles - raceWeekMiles) / Math.max(1, taperWeeksTotal);
          return Math.max(raceWeekMiles, Math.round(taperEntryMiles - taperWeekIdx * dropPerWeek));
        }
        const startPct = Math.max(0.55, 0.75 - (weeksSincePeak - 2) * 0.05);
        const targetPct = 0.90;
        const buildWeeks = taperStartWeek - 1;
        const effectiveBuildWeeks = Math.max(1, buildWeeks - recoveryWeeks.filter(w => w < taperStartWeek).length);
        const stepPerWeek = (targetPct - startPct) / effectiveBuildWeeks;
        let buildStep = 0;
        for (let w = 1; w < weekNumber; w++) {
          if (!recoveryWeeks.includes(w)) buildStep++;
        }
        const pct = Math.min(targetPct, startPct + buildStep * stepPerWeek);
        const governor = this.getStructuralGovernor(weekNumber);
        return Math.max(6, Math.round(recentLongRun * pct * governor));
      }

      // Original descending maintenance arc (peak is current)
      if (isThisRecovery) {
        return Math.max(6, Math.round(recentLongRun * 0.55));
      }
      if (weekNumber >= taperStartWeek) {
        const taperWeeksTotal = totalWeeks - taperStartWeek + 1;
        const taperWeekIdx = weekNumber - taperStartWeek;
        const taperEntryMiles = Math.round(recentLongRun * 0.70);
        const dropPerWeek = (taperEntryMiles - raceWeekMiles) / Math.max(1, taperWeeksTotal);
        return Math.max(raceWeekMiles, Math.round(taperEntryMiles - taperWeekIdx * dropPerWeek));
      }
      const lastRecovery = [...recoveryWeeks].reverse()[0] ?? null;
      if (!lastRecovery || weekNumber < lastRecovery) {
        const preBuildWeeks = lastRecovery ? lastRecovery - 1 : taperStartWeek - 1;
        const highMark = Math.round(recentLongRun * 0.90);
        const dropMark = Math.round(recentLongRun * 0.78);
        const dropPerWeek = preBuildWeeks > 1 ? (highMark - dropMark) / (preBuildWeeks - 1) : 0;
        const governor = this.getStructuralGovernor(weekNumber);
        return Math.max(dropMark, Math.round((highMark - (weekNumber - 1) * dropPerWeek) * governor));
      }
      return Math.round(recentLongRun * 0.76);
    }

    // Standard path: find where the athlete sits in the progression table.
    const offset = this.getProgressionOffset(progression);
    const index = weekNumber - 1 + offset;

    if (index < progression.length) {
      return progression[index] || 10;
    }

    // Beyond the table: gentle taper (2 miles/week down from the last value)
    const lastValue = progression[progression.length - 1];
    const weeksBeyond = index - (progression.length - 1);
    return Math.max(8, lastValue - weeksBeyond * 2);
  }

  // ============================================================================
  // WORKOUT CREATORS - SIMPLE, EFFORT-BASED
  // ============================================================================

  /**
   * E3a: dual-anchor zone target (HR via Friel/Karvonen + pace via Daniels VDOT) for a zone index
   * (0=Z1 … 4=Z5) + pace key, from the shared endurance spine. Returns '' when no learned data on
   * file → the caller falls back to RPE wording. Demotes RPE to a no-data fallback (SPEC-e3a-nonrace-zones).
   */
  private enduranceZoneTag(zoneIdx: number, paceKey: 'base' | 'steady' | 'power' | 'speed'): string {
    const hr = hrZones(this.params.lthr ?? null, this.params.max_hr ?? null, this.params.resting_hr ?? null);
    const paces = (this.params.vdot && this.params.vdot > 0) ? paceZonesFromVdot(this.params.vdot) : null;
    const parts: string[] = [];
    if (hr && hr[zoneIdx]) {
      const z = hr[zoneIdx];
      parts.push(`HR ${z.min}–${z.max ?? '+'}`);
    }
    if (paces) parts.push(`~${formatPace(paces[paceKey])}/mi`);
    return parts.join(' · ');
  }

  /**
   * Create simple long run — zone-led (Z2 aerobic) when learned data exists; RPE fallback otherwise.
   */
  private createSimpleLongRun(miles: number): Session {
    const duration = this.milesToMinutes(miles);
    const zt = this.enduranceZoneTag(1, 'base'); // Z2 aerobic
    const description = zt
      ? `${miles} miles — Z2 aerobic (${zt}). Easy and conversational; talk in full sentences throughout. Time on feet, not speed.`
      : `${miles} miles at easy, conversational pace. You should be able to talk in full sentences throughout. Focus on time on your feet, not speed.`;
    return this.createSession(
      'Sunday',
      'Long Run',
      description,
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
    const baseMiles = 4;
    const baseDuration = this.milesToMinutes(baseMiles);
    const baseTag = this.enduranceZoneTag(1, 'base'); // Z2 easy base

    if (useStrides) {
      const z5 = this.enduranceZoneTag(4, 'speed'); // Z5 for the strides
      const description = z5
        ? `${baseMiles} miles easy${baseTag ? ` (${baseTag})` : ''}, then 6×100m strides at Z5 effort (${z5}) — quick, relaxed, full recovery. Strides optional; skip if tired.`
        : `${baseMiles} miles easy, then 6×100m strides (quick but relaxed sprints with full recovery). Strides are optional - skip if tired. Focus on good form and having fun.`;
      return this.createSession(
        'Tuesday',
        'Easy Run + Strides',
        description,
        baseDuration + 10, // 10 min for strides
        [TOKEN_PATTERNS.easy_run_miles(baseMiles), TOKEN_PATTERNS.strides_4x100m],
        ['easy_run', 'strides']
      );
    } else {
      const pickups = Math.min(8, 5 + Math.floor(weekNumber / 4));
      const z4 = this.enduranceZoneTag(3, 'power'); // Z4 for the pickups
      const description = z4
        ? `${baseMiles} miles with ${pickups} pickups at Z4–Z5 effort (${z4}): 30–60s comfortably hard, then easy jog to recover. Easy base${baseTag ? ` (${baseTag})` : ''}.`
        : `${baseMiles} miles with ${pickups} pick-ups: run comfortably hard for 30-60 seconds when you feel like it, then easy jog to recover. No watch needed - run by feel and enjoy it!`;
      return this.createSession(
        'Tuesday',
        'Fartlek Run',
        description,
        baseDuration, // Fartlek is within the 4 mile run, not additional
        [TOKEN_PATTERNS.easy_run_miles(baseMiles), TOKEN_PATTERNS.fartlek(pickups)],
        ['easy_run', 'fartlek']
      );
    }
  }

  /**
   * Create simple easy run - effort-based
   */
  private createSimpleEasyRun(miles: number, day: string = ''): Session {
    const duration = this.milesToMinutes(miles);

    const zt = this.enduranceZoneTag(1, 'base'); // Z1–Z2 easy aerobic
    let description: string;
    if (zt) {
      description = `${miles} miles — easy aerobic, Z1–Z2 (${zt}). Conversational throughout.`;
    } else {
      const descriptions = [
        `${miles} miles at easy, conversational pace.`,
        `${miles} miles nice and easy. Enjoy the run!`,
        `${miles} miles at a comfortable effort. Chat with a friend or enjoy some music.`
      ];
      description = descriptions[Math.floor(Math.random() * descriptions.length)];
    }

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
    remainingMiles: number,
    respectBudget: boolean = false
  ): void {
    const remainingDays = Math.max(0, targetDays - sessions.length);
    if (remainingDays <= 0) return;

    // E3b: budget-anchored — cap easy runs by the remaining time budget; never silently exceed it.
    // If the distance-precise long run already consumed the budget, add nothing.
    if (respectBudget) {
      if (remainingMiles < 3) return; // no budget left for even one (legal, ≥3mi) easy run
      // PROTOCOL §5.2: easy runs are 3–5mi (genuinely easy, Z1–Z2). Easy days follow the Mon/Wed/Fri
      // grid in assignDaysToSessions → at most 3 slots. Size within [3,5] toward the budget; NEVER
      // inflate an easy run past 5mi to cram the budget — the caller surfaces any excess glass-box.
      const EASY_SLOTS = 3;
      const numEasy = Math.min(EASY_SLOTS, remainingDays, Math.max(1, Math.floor(remainingMiles / 3)));
      if (numEasy <= 0) return;
      const easyMiles = Math.max(3, Math.min(5, Math.round(remainingMiles / numEasy)));
      for (let i = 0; i < numEasy; i++) {
        sessions.push(this.createSimpleEasyRun(easyMiles));
      }
      return;
    }

    const milesPerDay = Math.max(3, Math.round(remainingMiles / remainingDays));
    const easyMiles = Math.max(3, Math.min(6, milesPerDay)); // Cap at 6 miles for easy runs

    for (let i = 0; i < remainingDays; i++) {
      sessions.push(this.createSimpleEasyRun(easyMiles));
    }
  }

  // ── E3b helpers: budget-anchored sizing (active only when weekly_hours is supplied) ──

  /** Map the generator's phase name → the shared volume PhaseKey (spine vocabulary). */
  private toVolumePhaseKey(name: string): PhaseKey {
    switch (name) {
      case 'Base': return 'base';
      case 'Speed': return 'build';
      case 'Race Prep': return 'race_specific';
      case 'Build': return 'race_specific'; // retest rename of Race Prep — same ramp position
      case 'Taper': return 'taper';
      case 'Retest': return 'retest';
      default: return 'base';
    }
  }

  /** Athlete easy pace (min/mi) — from VDOT (E3a zone inputs) when present, else the fitness default. */
  private enduranceEasyPaceMinPerMile(): number {
    if (this.params.vdot && this.params.vdot > 0) return paceZonesFromVdot(this.params.vdot).base / 60;
    return this.getEasyPaceMinPerMile();
  }

  /**
   * E3b Part 2 — split the ONE total budget: strength reserved off the top (frequency × ~1hr), the
   * endurance remainder split run/ride by run_lean. One budget number, no hour double-counted:
   * reserveHrs + runHrs + rideHrs === weekly_hours, always. rideHrs is carried for the future bike
   * engine (run-only → 0). Replaces Part 1's "weekly_hours IS the run budget" simplification.
   */
  private budgetSplit(): { total: number; reserveHrs: number; enduranceHrs: number; runHrs: number; rideHrs: number } {
    const STRENGTH_SESSION_HOURS = 1.0; // ~1hr per strength session — the near-fixed reservation (SPEC §1)
    const total = this.params.weekly_hours ?? 0;
    const reserveHrs = Math.max(0, Number(this.params.strength_frequency) || 0) * STRENGTH_SESSION_HOURS;
    const enduranceHrs = Math.max(0, total - reserveHrs);
    const runLean = Math.max(0, Math.min(1, this.params.run_lean ?? 1.0));
    const runHrs = enduranceHrs * runLean;
    const rideHrs = enduranceHrs - runHrs; // remainder (= endurance × (1−run_lean)) so the split sums EXACTLY
    return { total, reserveHrs, enduranceHrs, runHrs, rideHrs };
  }

  /** Weekly run mileage from the run-endurance hours (total − strength reserve, run slice); recovery deloaded. */
  private budgetWeeklyMiles(isRecovery: boolean): number {
    const { runHrs } = this.budgetSplit();
    const miles = (runHrs * 60) / this.enduranceEasyPaceMinPerMile();
    return Math.round(miles * (isRecovery ? 0.7 : 1.0));
  }

  /** Distance-precise long run from the shared spine ramp (RUN-PROTOCOL §4.5). */
  private spineLongRunMiles(weekNumber: number, phase: Phase): number {
    const key = this.toVolumePhaseKey(phase.name);
    const weekInPhase = Math.max(1, weekNumber - phase.start_week + 1);
    return longRunMilesForWeek(this.params.distance, key, weekInPhase, rampWeeksForPhase(key));
  }
}
