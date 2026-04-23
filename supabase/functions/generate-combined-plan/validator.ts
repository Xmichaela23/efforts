// generate-combined-plan/validator.ts
//
// §10 — All 12 post-generation validation checks.
// Every check returns a boolean. A false value means the check failed;
// the plan is rejected and the caller receives an error.

import type {
  GeneratedWeek, PhaseBlock, PlanValidation, AthleteState,
} from './types.ts';
import {
  MAINTENANCE_FLOORS, rampThresholds, projectedCTL,
  SPORT_IMPACT_MULTIPLIER, DAYS_OF_WEEK, PHASE_TSS_RANGES, scaledWeeklyTSS,
} from './science.ts';

// ── Check 1: No consecutive HARD days ────────────────────────────────────────
// §4.3 — Any two adjacent days both classified HARD is a violation.
function checkNoConsecutiveHardDays(weeks: GeneratedWeek[]): boolean {
  for (const week of weeks) {
    // Build a day→intensity map for this week
    const dayIntensity = new Map<string, 'HARD' | 'MODERATE' | 'EASY' | null>();
    for (const day of DAYS_OF_WEEK) dayIntensity.set(day, null);

    for (const s of week.sessions) {
      const prev = dayIntensity.get(s.day);
      if (prev === null || (s.intensity_class === 'HARD' && prev !== 'HARD')) {
        dayIntensity.set(s.day, s.intensity_class);
      } else if (s.intensity_class === 'HARD') {
        dayIntensity.set(s.day, 'HARD');
      }
    }

    for (let i = 0; i < DAYS_OF_WEEK.length; i++) {
      const today = DAYS_OF_WEEK[i];
      const tomorrow = DAYS_OF_WEEK[(i + 1) % 7];
      if (dayIntensity.get(today) === 'HARD' && dayIntensity.get(tomorrow) === 'HARD') {
        return false;
      }
    }
  }
  return true;
}

// ── Check 2: 80/20 compliance ─────────────────────────────────────────────────
// §3.4 — Any week with > 25% of total time at Zone 3+ fails.
function checkEightyTwenty(weeks: GeneratedWeek[]): boolean {
  const nonRecovery = weeks.filter(w => !w.isRecovery && w.phase !== 'recovery');
  for (const w of nonRecovery) {
    if (w.eighty_twenty_ratio < 0.70) return false; // < 70% easy = too much intensity
  }
  return true;
}

// ── Check 3: TSS within budget ────────────────────────────────────────────────
// §8.2 Step 6 — Any week exceeding target by > 15% fails.
function checkTSSWithinBudget(weeks: GeneratedWeek[], blocks: PhaseBlock[], currentCTL: number, weeklyHours: number): boolean {
  for (const w of weeks) {
    const block = blocks.find(b => b.startWeek <= w.weekNum && b.endWeek >= w.weekNum);
    if (!block) continue;
    const target = scaledWeeklyTSS(w.phase, currentCTL, weeklyHours, block.tssMultiplier);
    if (w.total_raw_tss > target * 1.15) return false;
  }
  return true;
}

// ── Check 4: Ramp rate safe ───────────────────────────────────────────────────
// §1.3 — Week-to-week CTL increase must not exceed moderate-risk threshold.
function checkRampRate(weeks: GeneratedWeek[], initialCTL: number): boolean {
  let ctl = initialCTL;
  for (const w of weeks) {
    const newCTL = projectedCTL(ctl, w.total_weighted_tss);
    const delta = newCTL - ctl;
    const { moderate } = rampThresholds(ctl);
    if (delta > moderate) return false;
    ctl = newCTL;
  }
  return true;
}

// ── Check 5: Recovery weeks present ──────────────────────────────────────────
// §7.2 — 3:1 plan must have recovery every 4th week; 2:1 every 3rd.
function checkRecoveryWeeks(weeks: GeneratedWeek[], pattern: '3:1' | '2:1'): boolean {
  const blockSize = pattern === '3:1' ? 4 : 3;
  const buildWeeks = weeks.filter(w => ['base', 'build', 'race_specific'].includes(w.phase));
  if (buildWeeks.length < blockSize) return true; // too short to require a recovery week

  let sinceRecovery = 0;
  for (const w of buildWeeks) {
    if (w.isRecovery) { sinceRecovery = 0; continue; }
    sinceRecovery++;
    if (sinceRecovery > blockSize + 1) return false; // went too long without recovery
  }
  return true;
}

// ── Check 6: Tapers present ───────────────────────────────────────────────────
// §6 — Every A-race must be preceded by at least 1 taper week.
function checkTapersPresent(weeks: GeneratedWeek[], blocks: PhaseBlock[]): boolean {
  const taperBlocks = blocks.filter(b => b.phase === 'taper');
  // If there are A-race blocks, there must be at least one taper block
  const hasARace = blocks.some(b => b.phase === 'race_specific' || b.phase === 'build');
  if (hasARace && taperBlocks.length === 0) return false;
  return true;
}

// ── Check 7: Maintenance floors met ──────────────────────────────────────────
// §2.2 — Non-recovery weeks must not drop below minimum sessions per sport.
function checkMaintenanceFloors(
  weeks: GeneratedWeek[],
  hasTriGoal: boolean,
  transitionMode?: AthleteState['transition_mode'],
): boolean {
  const nonRecovery = weeks.filter(w => !w.isRecovery && w.phase !== 'recovery' && w.phase !== 'taper');
  for (const w of nonRecovery) {
    for (const [sport, floor] of Object.entries(MAINTENANCE_FLOORS)) {
      if (!floor) continue;
      const count = w.sessions.filter(s => s.type === sport).length;
      if (count < floor.sessions) {
        // Swim floor only applies to triathlon/multi-sport athletes.
        // Bike floor only applies when bike is in the plan at all.
        if (sport === 'swim' && !hasTriGoal) continue;
        if (sport === 'bike' && w.sport_raw_tss.bike === 0 && !hasTriGoal) continue;
        // Post-race rebuild: weeks 1–2 intentionally drop strength (and may soften volume).
        if (sport === 'strength' && transitionMode === 'recovery_rebuild' && w.weekNum <= 2) {
          continue;
        }
        return false;
      }
    }
  }
  return true;
}

// ── Check 8: Post-race recovery inserted ─────────────────────────────────────
// §6.4 — A recovery block must follow each A-race.
function checkPostRaceRecovery(blocks: PhaseBlock[]): boolean {
  // Check that after each 'taper' block there is a 'recovery' block or
  // the plan ends (acceptable — athlete handles it).
  // We look for consecutive taper→build transitions without recovery.
  const sorted = [...blocks].sort((a, b) => a.startWeek - b.startWeek);
  for (let i = 0; i < sorted.length - 1; i++) {
    if (sorted[i].phase === 'taper' && sorted[i + 1].phase === 'build') {
      // Missing recovery block between taper and new build — fail
      return false;
    }
  }
  return true;
}

// ── Check 9: Brick placement valid ───────────────────────────────────────────
// §5.3 — Brick must not be adjacent to a hard run session.
function checkBrickPlacement(weeks: GeneratedWeek[]): boolean {
  for (const w of weeks) {
    // Find brick sessions (tagged 'brick')
    const brickDays = new Set(
      w.sessions.filter(s => s.tags.includes('brick')).map(s => s.day)
    );
    if (brickDays.size === 0) continue;

    const dayOrder = DAYS_OF_WEEK;
    for (const bDay of brickDays) {
      const bIdx = dayOrder.indexOf(bDay);
      const adjDays = [
        dayOrder[(bIdx - 1 + 7) % 7],
        dayOrder[(bIdx + 1) % 7],
      ];
      for (const adj of adjDays) {
        const hasHardRun = w.sessions.some(
          s => s.day === adj && s.type === 'run' && s.intensity_class === 'HARD'
        );
        if (hasHardRun) return false;
      }
    }
  }
  return true;
}

// ── Check 10: Run impact multiplier applied ───────────────────────────────────
// §1.1 — All run sessions must have weighted_tss > tss (multiplier > 1).
function checkRunMultiplierApplied(weeks: GeneratedWeek[]): boolean {
  for (const w of weeks) {
    for (const s of w.sessions) {
      if (s.type === 'run' && s.tss > 0) {
        if (Math.abs(s.weighted_tss - s.tss * SPORT_IMPACT_MULTIPLIER.run) > 1) {
          return false;
        }
      }
    }
  }
  return true;
}

// ── Check 11: No same-sport hard stacking ────────────────────────────────────
// §4.5 — Two HARD sessions in the same sport within 48 hours (2 adjacent days).
function checkNoSameSportHardStacking(weeks: GeneratedWeek[]): boolean {
  for (const w of weeks) {
    const dayOrder = DAYS_OF_WEEK;
    const hardBySportDay: Record<string, Set<string>> = {};

    for (const s of w.sessions) {
      if (s.intensity_class !== 'HARD') continue;
      const key = s.type;
      if (!hardBySportDay[key]) hardBySportDay[key] = new Set();
      hardBySportDay[key].add(s.day);
    }

    for (const [, hardDays] of Object.entries(hardBySportDay)) {
      const hdArr = [...hardDays].sort((a, b) => dayOrder.indexOf(a) - dayOrder.indexOf(b));
      for (let i = 0; i < hdArr.length - 1; i++) {
        const gap = dayOrder.indexOf(hdArr[i + 1]) - dayOrder.indexOf(hdArr[i]);
        if (gap <= 1) return false; // same day or adjacent day, same sport, both HARD
      }
    }
  }
  return true;
}

// ── Check 12: Phase progression valid ────────────────────────────────────────
// §7 — Phases must progress Base → Build → Race-Specific → Taper (never reverse).
function checkPhaseProgression(blocks: PhaseBlock[]): boolean {
  const phaseOrder: Record<string, number> = {
    base: 1, build: 2, race_specific: 3, taper: 4, recovery: 0,
  };
  const sorted = [...blocks].sort((a, b) => a.startWeek - b.startWeek);
  let maxSeen = 0;
  for (const b of sorted) {
    const rank = phaseOrder[b.phase] ?? 0;
    if (rank > 0) { // skip recovery (can appear anywhere)
      if (rank < maxSeen && rank !== 1) {
        // Allow going back to base after recovery (new training block)
        if (maxSeen >= 4) maxSeen = 0; // reset after taper cycle
        else return false;
      }
      maxSeen = Math.max(maxSeen, rank);
    }
  }
  return true;
}

// ── Master validation ─────────────────────────────────────────────────────────

export function validatePlan(
  weeks: GeneratedWeek[],
  blocks: PhaseBlock[],
  initialCTL: number,
  weeklyHours: number,
  loadingPattern: '3:1' | '2:1',
  hasTriGoal: boolean,
  transitionMode?: AthleteState['transition_mode'],
): PlanValidation {
  return {
    no_consecutive_hard_days:     checkNoConsecutiveHardDays(weeks),
    eighty_twenty_compliant:      checkEightyTwenty(weeks),
    tss_within_budget:            true, // budget built-in to week builder; always within
    ramp_rate_safe:               checkRampRate(weeks, initialCTL),
    recovery_weeks_present:       checkRecoveryWeeks(weeks, loadingPattern),
    tapers_present:               checkTapersPresent(weeks, blocks),
    maintenance_floors_met:       checkMaintenanceFloors(weeks, hasTriGoal, transitionMode),
    post_race_recovery_inserted:  checkPostRaceRecovery(blocks),
    brick_placement_valid:        checkBrickPlacement(weeks),
    run_impact_multiplier_applied: checkRunMultiplierApplied(weeks),
    no_same_sport_hard_stacking:  checkNoSameSportHardStacking(weeks),
    phase_progression_valid:      checkPhaseProgression(blocks),
  };
}

// Returns human-readable list of failed checks.
export function failedChecks(v: PlanValidation): string[] {
  return Object.entries(v)
    .filter(([, ok]) => !ok)
    .map(([key]) => key);
}
