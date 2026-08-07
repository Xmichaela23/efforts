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
// ⛔ MOVED TO `src/lib/run-volume-tables.ts` (2026-08-04). The intake validates a typed weekly
// mileage against week 1 of this arc, so the numbers had to become shareable. One copy, imported.
// See that file's header for the deploy consequence.
import {
  LONG_RUN_PROGRESSION,
  WEEKLY_MILEAGE,
  MAX_WEEKLY_MILEAGE_INCREASE,
  PRESCRIPTIVE_TAPER_RATIOS,
  marathonPrerequisiteFor,
  type MarathonPrerequisite,
  buildLongRunArc,
  longRunPeakWeek,
  type LongRunArc,
} from '../../../../src/lib/run-volume-tables.ts';


export class SustainableGenerator extends BaseGenerator {
  generatePlan(): TrainingPlan {
    const phaseStructure = this.determinePhaseStructure();
    /**
     * ⛔ THE PEAK WEEK IS NEVER A CUTBACK WEEK, AND IT IS STRUCK ONCE HERE. The cutback cadence is
     * every 4th week and the peak week is derived from the race date, so on some windows they
     * collide: an 11-week block put its 18-miler inside a deloaded week that ALSO dropped to three
     * running days — a 36-mile week carrying a 50% long run.
     *
     * ⚠️ STRUCK FROM THE PHASE STRUCTURE, not from a local flag. `getRunningDaysForWeek`,
     * `calculateWeeklyMileage`, the speedwork gate and the strength overlay each re-derive recovery
     * from this array; fixing one of them leaves the week half-deloaded in a way nothing reports.
     */
    const arcPeak = this.resolveLongRunArc()?.peakWeek ?? -1;
    if (phaseStructure.recovery_weeks.includes(arcPeak)) {
      phaseStructure.recovery_weeks = phaseStructure.recovery_weeks.filter((w) => w !== arcPeak);
      console.log(`[PlanGen] week ${arcPeak} un-deloaded: it carries the peak long run`);
    }
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
    const base = `A ${this.params.duration_weeks}-week plan designed to get you to the finish line healthy and confident. ` +
      `Uses effort-based pacing (no complicated pace charts) with optional light speedwork. ` +
      `Based on progressive training principles.`;
    /**
     * ⛔ THE PREREQUISITE, ON THE PLAN ITSELF (2026-08-06, Michael's words). This is what makes an
     * 18-mile peak honest rather than reckless: the block no longer builds from wherever the athlete
     * is, so it has to say what it assumed. Every published marathon plan opens with this line —
     * Higdon's "about a year of running", Pfitzinger's 55-mile weeks — and this one had been
     * building to a stated peak while assuming a base it never mentioned.
     *
     * ⚠️ IT NAMES THE ALTERNATIVE. "Do the half" is the actionable half of the sentence; a warning
     * with no other door is just a disclaimer.
     */
    const pre = this.marathonPrerequisite();
    if (!pre) return base;
    // ⛔ TOO SHORT FOR ANY HONEST PREREQUISITE. Past this the block would be asking the athlete to
    // arrive already marathon-fit so it can "build" them two miles. Name the half; do not pretend.
    if (!pre.meetable) {
      return `${base} This window is too short to build a marathon from any starting point we could ` +
        `honestly ask for — it would need you race-ready on day one. The half is the build this ` +
        `timeline supports.`;
    }
    return `${base} This plan assumes you're already running about ${pre.weeklyMi} miles a week with a long run around ${pre.longRunMi}. ` +
      `If that's not where you are, do the half — this build won't be safe for you.`;
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
      // ⛔ THE THIRD COPY OF THE SAME CEILING, and the one that survived the first sweep. A week
      // whose SUNDAY is 8-14 days out but whose other days are further does not route through
      // `generateRaceWeekSessions` at all — it lands here, where a flat 10 clipped the taper's
      // first step (14 → 10) exactly as the other two did. Same rule: 0.8 of the block's peak.
      const taperCeiling = Math.max(4, Math.round((this.resolveLongRunArc()?.maxMi ?? 18) * 0.8));
      const adjustedLongRunMiles = sundayProximity === 'reduced_quality'
        ? Math.min(longRunMiles, taperCeiling)
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
    this.fillWithSimpleEasyRuns(sessions, runningDays, weeklyMiles - usedMiles, budgeted, longRunMiles);

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
    const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
    const prox = raceProximity.dayProximity;
    const sessions: Session[] = [];
    let used = 0;                                   // counts against the athlete's day count
    const room = () => used < runningDays;

    /**
     * ⛔ ANCHORS FIRST, THEN FILL — and the day count binds on both (2026-08-06). Michael, on the
     * export: six runs in the race week of a plan built for four days a week.
     *
     * `shakeout` and `easy_short` pushed with NO guard at all, so race week ignored the answer
     * entirely. But bolting the guard onto a Monday→Sunday walk drops the wrong sessions — the
     * early-week easy runs spend the budget and the Saturday shakeout falls off the end. Walking
     * BACKWARD from the race fixes race week and breaks the week before it, which is not a race
     * week at all: it ends up training Thursday, Friday and Sunday with the first half of the week
     * empty.
     *
     * So neither direction is the rule. **Priority is.** Two sessions give the week its shape and
     * claim their slots before anything else: the SHAKEOUT (the one session race week exists for)
     * and the SUNDAY LONG RUN (the anchor every other day is placed around). Everything else is
     * filler and takes what is left, in day order. Race day itself is exempt — it is not a training
     * day the athlete chose.
     */
    for (const day of days) {
      const p = prox[day];
      if (p === 'race') {
        // ⛔ THE RACE IS ON THE CALENDAR NOW. This case read "don't add a training session" and did
        // nothing at all, so a completion plan ended on a Saturday shakeout with NOTHING on race
        // day. `performance-build` has built a race-day row since it shipped; this path never did,
        // and the athlete's own event was the one thing missing from the plan built for it.
        sessions.push(this.createCompletionRaceDay(day));
        continue;
      }
      if (p === 'shakeout' && room()) {
        sessions.push(this.createShakeoutRun(day));
        used++;
        continue;
      }
      if (day === 'Sunday' && (p === 'easy_medium' || p === 'reduced_quality') && room()) {
        // ⛔ THE TAPER'S OWN NUMBER, NOT A CONSTANT. The `easy_medium` arm read
        // `createSimpleLongRun(8)` — a literal three functions away from the arc that had already
        // computed this week's long run. On the 9-week case the arc stepped 9 → 8 → 6 → 4 and this
        // overwrote the 6, so the taper printed 9 → 8 → 8 and read as a plateau. Both numbers
        // survive as CEILINGS: never more than 8 inside a week of the race, never more than 10
        // inside two, however big the block got.
        // ⛔ THE CEILINGS SCALE WITH THE PEAK (2026-08-06). They were flat 8 and 10 — numbers
        // calibrated for an 18-20 mile peak, which is exactly what a prescriptive block now has.
        // Left flat they crushed its taper: an 18 → 14 → 10 descent printed 18 → 10 → 8. As
        // fractions they are the same guard (0.8 and 0.6 of peak = 14 and 11 off an 18) and they
        // still bind on an arc that does NOT taper — which is what they were written for.
        // Pfitzinger's 18/55 tapers 20 → 16 → 12: 0.80 then 0.60.
        const peakMi = this.resolveLongRunArc()?.maxMi ?? 18;
        const cap = Math.max(4, Math.round(peakMi * (p === 'easy_medium' ? 0.6 : 0.8)));
        sessions.push(this.createSimpleLongRun(Math.min(cap, this.getLongRunMiles(weekNumber))));
        used++;
      }
    }

    // ── Filler, in day order, until the count is spent ────────────────────────
    for (const day of days) {
      if (!room()) break;
      if (sessions.some((s) => s.day === day)) continue;   // anchored (or the race) — leave it
      const p = prox[day];

      if (p === 'easy_short') {
        // 3-4 days before race: short easy run
        sessions.push(this.createSession(
          day,
          'Easy Run',
          '3-4 miles very easy. Keep the legs loose and stay relaxed.',
          this.milesToMinutes(4),
          [TOKEN_PATTERNS.easy_run_miles(4)],
          ['easy_run', 'taper']
        ));
        used++;
      } else if (p === 'easy_medium') {
        // 5-7 days before race: normal easy, maybe light strides
        if (day === 'Tuesday') {
          sessions.push(this.createSession(
            day,
            'Easy + Strides',
            '4 miles easy with 4×100m strides. Keep it light and fun!',
            this.milesToMinutes(4) + 5,
            [TOKEN_PATTERNS.easy_run_miles(4), TOKEN_PATTERNS.strides_4x100m],
            ['easy_run', 'strides', 'taper']
          ));
        } else {
          sessions.push(this.createSimpleEasyRun(4, day));
        }
        used++;
      } else if (p === 'reduced_quality' && day !== 'Saturday') {
        // 8-14 days before race — reduced but still training. Saturday stays clear before Sunday.
        if (day === 'Tuesday') {
          sessions.push(this.createSession(
            day,
            'Easy + Strides',
            '4 miles easy with 4×100m strides. Keep it light!',
            this.milesToMinutes(4) + 5,
            [TOKEN_PATTERNS.easy_run_miles(4), TOKEN_PATTERNS.strides_4x100m],
            ['easy_run', 'strides']
          ));
        } else {
          sessions.push(this.createSimpleEasyRun(5, day));
        }
        used++;
      }
      // 'normal' (more than 14 days out) cannot occur in a week that reached this function.
    }

    // Monday-first. This week bypasses `assignDaysToSessions` — it is already day-assigned — so
    // nothing downstream would reorder it, and the anchors were placed out of order by design.
    return sessions.sort((a, b) => days.indexOf(a.day) - days.indexOf(b.day));
  }

  /**
   * ⛔ RACE DAY, ON A COMPLETION PLAN — and it is NOT `performance-build`'s race day.
   *
   * That one prescribes M pace off the athlete's VDOT and signs off with "Trust your training. Go
   * crush it." This path has no goal pace by construction — the intake card says so in as many
   * words (*"Getting to the finish: easy running and long runs. No pace targets to hit."*) — so the
   * row states the distance and the effort the whole block was written in, and targets nothing.
   *
   * ⚠️ THE TOKEN IS TIME-BASED, DELIBERATELY. `longrun_{n}mi_easypace` is matched by
   * `materialize-plan` with `longrun_(\d+)mi` — INTEGERS ONLY — and every race distance is a
   * decimal (26.2, 13.1, 6.2, 3.1), so a distance token would parse to nothing and materialize as
   * an empty workout. The minutes form is integer by construction and both the validator and the
   * expander accept it. The DISTANCE is in the name and the description, where it is read.
   *
   * ⚠️ A run session with an empty `steps_preset` FAILS `validatePlanSchema`, so "no token" is not
   * an option here even though the combined-plan tri race row does exactly that (different
   * validator, different path).
   */
  private createCompletionRaceDay(day: string): Session {
    const miles = this.getRaceDistanceMiles();
    const duration = this.milesToMinutes(miles);
    const raceName = this.params.race_name || 'Race';
    const distanceLabel: Record<string, string> = {
      marathon: 'Marathon', half: 'Half marathon', '10k': '10K', '5k': '5K',
    };
    const label = distanceLabel[this.params.distance] ?? 'Race';
    return this.createSession(
      day,
      `${raceName} — ${label}`,
      `${miles} miles. The effort you have run all block: conversational at the start, and it will not stay that way. ` +
      `No pace target — this block was built to get you here able to finish.`,
      duration,
      [TOKEN_PATTERNS.long_run(duration)],
      ['race_day', 'event', this.params.distance],
    );
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
    // ⛔ …BUT NOT BELOW THE BLOCK'S ASSUMED BASE (2026-08-06). A prescription that opens at the
    // athlete's 20 mi/wk cannot carry the 18-mile long run it prescribes six weeks later — an 18 on
    // a 36-mile week is a 50% share. The prerequisite is the floor for the same reason it is the
    // prerequisite, and the plan states it rather than quietly assuming it.
    const assumedBase = this.marathonPrerequisite()?.weeklyMi ?? 0;
    const effectiveStart = Math.max(assumedBase, this.resolveEffectiveStartVolume(start, peak));

    const taperPhase = phaseStructure.phases.find(p => isRestedTerminal(canonicalizePhaseName(p.name)));
    const taperStart = taperPhase?.start_week || this.params.duration_weeks;

    // ⛔ THE RAMP IS CEILINGED AT ~10% A WEEK (2026-08-06). The straight line from start to peak is
    // as steep as the plan is short: a 9-week block from 19 mi/wk to a 40-mile peak asks for +3.5
    // miles a week — an 18% jump into week 2, then 16%, then 14%. Nothing capped it, and nothing
    // said so. `MAX_WEEKLY_MILEAGE_INCREASE` is the guard; the tables still decide the destination.
    //
    // ⚠️ THE CAP RUNS ON THE BUILD TREND, so it has to be walked from week 1 rather than evaluated
    // at `weekNumber` — a capped week is the base for the next week's ceiling. Cheap (≤20 steps) and
    // keeps the function pure, which is what every caller here assumes.
    //
    // ⚠️ A CUTBACK WEEK DOES NOT ADVANCE THE BUILD, and this is the same convention the long-run
    // rows already use ("post-recovery: resume at pre-recovery level, not beyond"). Without it the
    // trend keeps climbing underneath the deload and the athlete comes back to a week 22% over the
    // last one they actually ran — a 10% cap that only holds on paper. The cut itself is applied
    // after the walk, so the deloaded week is never the base for the next week's ceiling either.
    /**
     * ⛔ THE WEEK PEAKS WHERE THE LONG RUN PEAKS (2026-08-06). This ramped toward `taperStart`, which
     * on a race block is two or three weeks AFTER the long-run peak — so the biggest long run landed
     * on a week the volume had not caught up to yet. A 9-week beginner peaked an 18-mile run inside a
     * 36-mile week: a 50% share, against the 45% the tables are built on. Volume and the long run
     * peak together now, which is also what every periodisation model does.
     *
     * ⚠️ AFTER THE PEAK THE WEEK FOLLOWS THE LONG RUN DOWN, on the same ratios (0.78 / 0.55) rather
     * than a flat half — a taper that cuts volume faster than it cuts the long run raises the share
     * exactly when it should be falling.
     */
    const arcPeakWeek = this.resolveLongRunArc()?.peakWeek ?? Math.max(1, taperStart - 1);
    const uncapped = (w: number) => {
      if (w > arcPeakWeek) {
        const j = w - arcPeakWeek;
        const ratio = PRESCRIPTIVE_TAPER_RATIOS[Math.min(j - 1, PRESCRIPTIVE_TAPER_RATIOS.length - 1)];
        return peak * ratio;
      }
      const progress = (w - 1) / Math.max(1, arcPeakWeek - 1);
      return effectiveStart + (peak - effectiveStart) * Math.min(1, progress);
    };
    let targetMiles = effectiveStart;
    for (let w = 2; w <= weekNumber; w++) {
      if (this.isRecoveryWeek(w, phaseStructure)) continue;
      targetMiles = Math.min(uncapped(w), targetMiles * MAX_WEEKLY_MILEAGE_INCREASE);
    }

    // ⛔ NEVER DELOAD THE WEEK THAT CARRIES THE PEAK LONG RUN. The cutback cadence is every 4th week
    // and the peak week is derived from the race date, so on some windows they collide — an 11-week
    // block put its 18-miler inside a deloaded 26-mile week, a 69% share. The long run is the point
    // of that week; the cutback moves, not the peak.
    if (isRecovery && weekNumber !== arcPeakWeek) {
      targetMiles = targetMiles * 0.7;
    }

    return Math.round(targetMiles);
  }

  // ── The long run, anchored to race day ─────────────────────────────────────

  /** Built once per plan — the arc is a whole-plan shape, not a per-week lookup. */
  private longRunArcMemo: LongRunArc | null | undefined;

  private prereqMemo: MarathonPrerequisite | null | undefined;

  /**
   * The block's assumed base — computed from THIS window, so a short block quotes a high base and a
   * long one quotes almost nothing. Marathon only: the shorter distances build from where you are.
   *
   * ⚠️ THE SAME `peakWeek` THE ARC USES. The prerequisite is derived from how many climbing weeks
   * there are before the peak, so reading a different peak week here would quote a base that does
   * not match the ramp the plan actually runs.
   */
  private marathonPrerequisite(): MarathonPrerequisite | null {
    if (this.params.distance !== 'marathon') return null;
    if (this.prereqMemo === undefined) {
      this.prereqMemo = marathonPrerequisiteFor({
        distance: this.params.distance,
        fitness: this.params.fitness,
        durationWeeks: this.params.duration_weeks,
        peakWeek: longRunPeakWeek({
          durationWeeks: this.params.duration_weeks,
          startDateISO: this.params.start_date,
          raceDateISO: this.params.race_date,
        }),
      });
    }
    return this.prereqMemo;
  }

  private resolveLongRunArc(): LongRunArc | null {
    if (this.longRunArcMemo === undefined) {
      // ⚠️ THE PEAK WEEK RULE LIVES IN THE SHARED FILE, not here — the intake quotes the peak this
      // arc reaches before the athlete commits, and it has to be reading the same week.
      this.longRunArcMemo = buildLongRunArc({
        distance: this.params.distance,
        fitness: this.params.fitness,
        durationWeeks: this.params.duration_weeks,
        entryLongRunMi: this.params.recent_long_run_miles,
        // ⛔ THE BLOCK'S ASSUMED BASE. Marathon only, and only where a prerequisite is named — it
        // turns the arc from "build from where you are" into "build to the peak this distance
        // needs, and say what that assumed." `generatePlanDescription` states it on the plan.
        prerequisiteLongRunMi: this.marathonPrerequisite()?.longRunMi ?? null,
        peakWeek: longRunPeakWeek({
          durationWeeks: this.params.duration_weeks,
          startDateISO: this.params.start_date,
          raceDateISO: this.params.race_date,
        }),
        // Race day carries no long run, so the taper is anchored to the week before it.
        raceWeekIsLast: !!(this.params.start_date && this.params.race_date),
      });
      const a = this.longRunArcMemo;
      if (a) {
        console.log(`[PlanGen] long-run arc: peak ${a.peakMi}mi on week ${a.peakWeek} of ${this.params.duration_weeks}, longest ${a.maxMi}mi (table max ${a.tableMaxMi}), arc ${a.weeks.join('/')}`);
      }
    }
    return this.longRunArcMemo;
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

    // ⛔ STANDARD PATH — ANCHORED TO RACE DAY, NOT TO WEEK 1 (2026-08-06).
    //
    // This used to be `index = weekNumber - 1 + offset` against a table read forward. The row's tail
    // IS the taper, so a plan shorter than the row never reached it: a 9-week beginner marathon
    // climbed to a 10-mile long run and then raced, with the biggest long run of the block ON RACE
    // WEEK and no taper anywhere. The offset only shifted the entry point when the athlete had a
    // long run on file, which a new account does not.
    //
    // `buildLongRunArc` (`src/lib/run-volume-tables.ts`) now lands the row's final peak on the peak
    // week and tapers off whatever peak was actually reached. Same rows, same rungs, same ladder —
    // read from the other end. At full length it returns exactly what this code did.
    const arc = this.resolveLongRunArc();
    if (!arc) return 10;
    return arc.weeks[weekNumber - 1] ?? arc.weeks[arc.weeks.length - 1] ?? 10;
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
    respectBudget: boolean = false,
    longRunMiles: number = 0
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

    // ⛔ THE REMAINDER IS SPREAD, NOT ROUNDED AWAY (2026-08-06). Every easy day used to get the SAME
    // rounded number, so the week the athlete reads jumped in steps of `remainingDays` miles: a
    // 19 → 21 mile ramp printed as 18 → 23, a 28% week-over-week rise out of a trend capped at 10%.
    // The cap is only worth having if the printed week honours it.
    //
    // ⚠️ THE 3-6 MILE BAND IS UNCHANGED — this decides how the remainder lands inside it, not how
    // big an easy run may be.
    // ⛔ THE EASY CEILING IS HALF THE LONG RUN, NOT A FLAT 6 (2026-08-06). Six was fine for a block
    // that peaked at a 9-mile long run and became the binding constraint the moment the arc became
    // a prescription: a four-day week of 18 + 3×6 tops out at 36 miles, so a 45-mile target could
    // not be built at all — the week silently came out short and nothing said so.
    //
    // ⚠️ HALF THE LONG RUN IS THE FIELD'S OWN SHAPE. Pfitzinger's midweek runs run 8-11 against a
    // 20-mile long run; Higdon's Novice 2 runs 5 against a 10. Capped at 10 so no "easy run" ever
    // becomes a second long run, floored at 3 (protocol §5.2). Nothing changes for a low-volume
    // block: the cap is a ceiling, and the fill only reaches it when the week's target asks it to.
    const easyCeiling = longRunMiles > 0
      ? Math.max(3, Math.min(10, Math.round(longRunMiles * 0.5)))
      : 6;
    const target = Math.max(0, Math.round(remainingMiles));
    const base = Math.max(3, Math.min(easyCeiling, Math.floor(target / remainingDays)));
    let leftover = target - base * remainingDays;

    for (let i = 0; i < remainingDays; i++) {
      const takesOne = leftover > 0 && base < easyCeiling;
      if (takesOne) leftover -= 1;
      sessions.push(this.createSimpleEasyRun(base + (takesOne ? 1 : 0)));
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
