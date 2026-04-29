// generate-combined-plan/week-builder.ts
// IMPORTANT: This file implements scheduling logic that is also implemented in
// _shared/week-optimizer.ts. The same-day matrix is shared via
// schedule-session-constraints.ts but sequential rules and placement logic are
// duplicated. Any rule change MUST be applied to both files.
// See: supabase/functions/_shared/schedule-session-constraints.ts
//
// Implements §8 Week Construction Algorithm — all 7 steps.
// This is the core of the engine. All hard/easy constraints, 80/20 enforcement,
// TSS budgeting, ramp rate validation, and brick placement happen here.

import type {
  PlannedSession, GeneratedWeek, Phase, PhaseBlock, GoalInput,
  AthleteState, AthleteMemory, RaceAnchor,
} from './types.ts';
import type { Sport, Intensity } from './types.ts';
import {
  DAYS_OF_WEEK, DAY_INDEX, BRICKS_PER_WEEK,
  PHASE_ZONE_DIST, hardEasyOk, scaledWeeklyTSS, projectedCTL,
  rampThresholds, estimateSessionTSS, weightedTSS,
  expectedBikeDurationHours, brickRunTargetMiles, longRunFloorMiles,
  type TriRaceDistance,
} from './science.ts';
import type { DayOfWeek } from './science.ts';
import {
  longRun, easyRun, tempoRun, intervalRun, vo2Run, marathonPaceRun, racePaceRun,
  longRide, easyBike, bikeOpeners,
  groupRideQualityBikeSession,
  thresholdSwim, cssAerobicSwim, easySwim,
  brick, triathlonStrength, runStrength,
  downgradedEasyAerobicFrom, downgradedHardToModerateFrom,
} from './session-factory.ts';
import { arePlannedSessionsCompatible, plannedSessionToScheduleSlot } from '../_shared/schedule-session-constraints.ts';
import { blockForWeek } from './phase-structure.ts';

/**
 * Timeline rows are one week each (`pushBlockRange`: startWeek === endWeek). Using
 * `weekNum - block.startWeek + 1` would always yield 1 — count consecutive weeks
 * with the same phase / goal / recovery flag instead.
 */
function weekInPhaseForTimeline(phaseBlocks: PhaseBlock[], weekNum: number, block: PhaseBlock): number {
  let n = 1;
  for (let w = weekNum - 1; w >= 1; w--) {
    const b = blockForWeek(phaseBlocks, w);
    if (
      b.phase === block.phase &&
      b.primaryGoalId === block.primaryGoalId &&
      b.isRecovery === block.isRecovery
    ) {
      n++;
    } else break;
  }
  return n;
}

// ── Types ────────────────────────────────────────────────────────────────────

interface DaySlot {
  day: string;
  sessions: PlannedSession[];
  isRest: boolean;
}

type WeekGrid = Map<string, DaySlot>;

function makeGrid(restDays: Set<string>): WeekGrid {
  const grid: WeekGrid = new Map();
  for (const d of DAYS_OF_WEEK) {
    grid.set(d, { day: d, sessions: [], isRest: restDays.has(d) });
  }
  return grid;
}

function gridSessions(grid: WeekGrid): PlannedSession[] {
  return [...grid.values()].flatMap(s => s.sessions);
}

function dayIntensity(slot: DaySlot): Intensity | null {
  const intensities = slot.sessions.map(s => s.intensity_class);
  if (intensities.includes('HARD'))     return 'HARD';
  if (intensities.includes('MODERATE')) return 'MODERATE';
  if (intensities.length > 0)           return 'EASY';
  return null;
}

// Numerically index days so we can check adjacency
function adjDay(day: string, delta: number): DayOfWeek {
  const idx = DAY_INDEX[day] ?? 0;
  return DAYS_OF_WEEK[(idx + delta + 7) % 7];
}

// ── Step 4: Global Hard/Easy Enforcement ─────────────────────────────────────
// §4.3 — No two HARD days adjacent, regardless of sport.
// If a HARD session lands next to another HARD day, downgrade the later one's
// intensity to MODERATE and update its tokens.

function enforceHardEasy(grid: WeekGrid): void {
  for (const day of DAYS_OF_WEEK) {
    const prev = adjDay(day, -1);
    const prevIntensity = dayIntensity(grid.get(prev)!);
    const slot = grid.get(day)!;
    if (prevIntensity === 'HARD' && dayIntensity(slot) === 'HARD') {
      // Downgrade this day's HARD sessions to MODERATE
      for (const s of slot.sessions) {
        if (s.intensity_class === 'HARD') {
          Object.assign(s, downgradedHardToModerateFrom(s));
        }
      }
    }
  }
}

// ── Step 5: 80/20 compliance ─────────────────────────────────────────────────
// §3.4 — 80% of total training TIME must be at Zone 1–2.
//
// Key nuance: a threshold session is NOT 100% hard. Warm-ups and cool-downs
// are Zone 1–2. We use 0.65 as the "high-intensity fraction" for HARD sessions
// (the interval block) and 0.50 for MODERATE (tempo portions).
// This matches real-world intensity distribution within structured workouts.
//
// Downgrade priority when ratio is still failing:
//   swim threshold → bike quality → run quality  (ascending systemic impact)
// Protected sessions (never downgraded): bricks, long_run, long_ride.

const HARD_INTENSITY_FRACTION     = 0.65; // fraction of HARD session that is actually Z4-5
const MODERATE_INTENSITY_FRACTION = 0.50; // fraction of MODERATE session that is Z3

function effectiveHardMin(s: PlannedSession): number {
  if (s.intensity_class === 'HARD')     return s.duration * HARD_INTENSITY_FRACTION;
  if (s.intensity_class === 'MODERATE') return s.duration * MODERATE_INTENSITY_FRACTION;
  return 0;
}

function enforce8020(grid: WeekGrid, phase: Phase): string[] {
  const tradeOffs: string[] = [];
  const target   = PHASE_ZONE_DIST[phase];
  const sessions = gridSessions(grid);
  const totalMin = sessions.reduce((s, x) => s + x.duration, 0);
  if (totalMin === 0) return tradeOffs;

  let hardMin    = sessions.reduce((s, x) => s + effectiveHardMin(x), 0);
  const maxAllowed = totalMin * (1 - target.low); // e.g. 0.80 target → 20% of total

  if (hardMin <= maxAllowed) return tradeOffs;

  // Downgrade in sport priority order (lowest systemic impact first).
  // Each non-protected HARD/MODERATE session is a candidate. We downgrade
  // directly to EASY in a single step (not HARD→MODERATE→EASY across two passes)
  // because each sport is only iterated once in this loop.
  // Protected sessions (bricks, long_run, long_ride) are never touched.
  const downgradeSports: Sport[] = ['swim', 'bike', 'run'];
  for (const sport of downgradeSports) {
    if (hardMin <= maxAllowed) break;
    for (const slot of grid.values()) {
      for (const s of slot.sessions) {
        if (hardMin <= maxAllowed) break;
        const isProtected = s.type === 'race' || s.tags?.some(t =>
          ['brick', 'long_run', 'long_ride', 'quality'].includes(t),
        );
        if (s.type !== sport || s.intensity_class === 'EASY' || isProtected) continue;

        const before = effectiveHardMin(s);
        const prior = { name: s.name, intensity_class: s.intensity_class, day: s.day };
        // Replace with a real easy session so name, tokens, and description match EASY.
        Object.assign(s, downgradedEasyAerobicFrom(s));
        tradeOffs.push(
          `80/20 adjustment: "${prior.name}" on ${prior.day} downgraded from ${prior.intensity_class} to EASY — weekly hard-minute ceiling reached. Reduce total load or protect this session by adjusting anchor days.`,
        );
        hardMin -= before;
      }
    }
  }
  return tradeOffs;
}

// ── Same-day matrix (9×9 + extensions) — post placement ---------------------------------
// One source of truth: `_shared/schedule-session-constraints.ts` (used by AL prompts + engine).

interface SameDayValidationResult {
  valid: boolean;
  conflicts: string[];
}

function validateWeekGridSameDayMatrix(grid: WeekGrid): SameDayValidationResult {
  const conflicts: string[] = [];
  for (const [day, slot] of grid) {
    const sessions = slot.sessions;
    for (let i = 0; i < sessions.length; i++) {
      for (let j = i + 1; j < sessions.length; j++) {
        if (!arePlannedSessionsCompatible(sessions[i], sessions[j])) {
          conflicts.push(
            `${day}: "${sessions[i].name}" [${sessions[i].type}] + "${sessions[j].name}" [${sessions[j].type}]`,
          );
        }
      }
    }
  }
  return { valid: conflicts.length === 0, conflicts };
}

/**
 * Prefer dropping strength on a clashing day (movable) before returning the grid.
 * Exception: quality_run + lower_body_strength on the same day is allowed for
 * performance + co-equal strength athletes (AM/PM consolidated hard day per EXPERIENCE_MODIFIER).
 */
function tryResolveSameDayMatrixConflicts(grid: WeekGrid, isPerformanceCoequal = false): string[] {
  const actions: string[] = [];
  for (let pass = 0; pass < 32; pass++) {
    if (validateWeekGridSameDayMatrix(grid).valid) break;
    let removed = false;
    outer: for (const [day, slot] of grid) {
      const list = slot.sessions;
      for (let i = 0; i < list.length; i++) {
        for (let j = i + 1; j < list.length; j++) {
          if (arePlannedSessionsCompatible(list[i], list[j])) continue;
          // Performance exception: quality_run AM + lower_body_strength PM is an allowed
          // consolidated hard day for co-equal strength athletes (EXPERIENCE_MODIFIER rule).
          if (isPerformanceCoequal) {
            const kindI = plannedSessionToScheduleSlot(list[i]);
            const kindJ = plannedSessionToScheduleSlot(list[j]);
            const isQrLb =
              (kindI === 'quality_run' && kindJ === 'lower_body_strength') ||
              (kindI === 'lower_body_strength' && kindJ === 'quality_run');
            if (isQrLb) {
              console.log(`[week-builder] allowing quality_run + lower_body AM/PM on ${day} (performance co-equal exception)`);
              continue;
            }
          }
          if (list[i].type === 'strength') {
            const [rm] = list.splice(i, 1);
            actions.push(`removed strength on ${day}: ${rm.name}`);
            removed = true;
            break outer;
          }
          if (list[j].type === 'strength') {
            const [rm] = list.splice(j, 1);
            actions.push(`removed strength on ${day}: ${rm.name}`);
            removed = true;
            break outer;
          }
        }
      }
    }
    if (!removed) break;
  }
  return actions;
}

// ── TSS summary helpers ───────────────────────────────────────────────────────

function computeWeekMetrics(
  sessions: PlannedSession[],
  weekNum: number,
  phase: Phase,
  isRecovery: boolean,
  weekTradeOffs?: string[],
): GeneratedWeek {
  const sport_raw_tss: Record<Sport, number> = { run: 0, bike: 0, swim: 0, strength: 0, race: 0 };
  let total_raw = 0, total_weighted = 0, z12min = 0, z3min = 0;

  for (const s of sessions) {
    sport_raw_tss[s.type] = (sport_raw_tss[s.type] ?? 0) + s.tss;
    total_raw += s.tss;
    total_weighted += s.weighted_tss;
    // Use effective intensity fractions: threshold sessions are only 65% high-intensity
    // (the rest is warm-up/cool-down at Z1-2). MODERATE sessions are 50% Z3.
    const hardFrac = effectiveHardMin(s) / Math.max(1, s.duration);
    z3min   += s.duration * hardFrac;
    z12min  += s.duration * (1 - hardFrac);
  }

  const totalMin = z12min + z3min;
  return {
    weekNum, phase, isRecovery, sessions,
    total_raw_tss: Math.round(total_raw),
    total_weighted_tss: Math.round(total_weighted),
    sport_raw_tss,
    zone1_2_minutes: Math.round(z12min),
    zone3_plus_minutes: Math.round(z3min),
    eighty_twenty_ratio: totalMin > 0 ? z12min / totalMin : 1,
    ...(weekTradeOffs && weekTradeOffs.length > 0 ? { week_trade_offs: weekTradeOffs } : {}),
  };
}

// ── Main week construction ────────────────────────────────────────────────────
//
// Implements spec §8.2 seven-step algorithm.

export function buildWeek(
  weekNum: number,
  block: PhaseBlock,
  prevWeekWeightedTSS: number,
  goals: GoalInput[],
  athleteState: AthleteState,
  athleteMemory?: AthleteMemory,
  options?: { totalWeeks?: number; raceAnchors?: RaceAnchor[]; phaseBlocks?: PhaseBlock[] },
): GeneratedWeek {

  const phase = block.phase;
  const isRecovery = block.isRecovery;
  const raceAnchors = options?.raceAnchors ?? [];
  const raceThisWeek = raceAnchors.find((a) => a.planWeek === weekNum);

  const primaryGoal = goals.find(g => g.id === block.primaryGoalId) ?? goals[0];
  const hasTri = goals.some(g => ['triathlon', 'tri'].includes(g.sport?.toLowerCase()));
  const hasRun = goals.some(g => g.sport?.toLowerCase() === 'run');
  const triApproach = athleteState.tri_approach ?? 'race_peak';
  const servedGoal = 'shared'; // all sessions serve multiple goals in combined plan

  // Diagnostic: log all day-preference state for every week so we can trace preferred_days flow.
  console.log('[buildWeek] week', weekNum, {
    bikeQualityDay: athleteState.bike_quality_day,
    runQualityDay: athleteState.run_quality_day,
    longRideDay: athleteState.long_ride_day,
    longRunDay: athleteState.long_run_day,
    strengthPreferredDays: athleteState.strength_preferred_days,
    transition_mode: athleteState.transition_mode,
    triApproach,
    phase: block.phase,
    isRecovery: block.isRecovery,
  });

  // recoveryRebuildWeek1: suppresses strength + quality sessions and bricks in week 1 when the
  // athlete is post-marathon / post-race. Applies to both run and tri plans — no heavy neural
  // loading 8 days after a race regardless of sport. For tri plans only the session guards apply;
  // the aggressive minute caps (30min run / 60min ride) are run-plan specific and skipped below.
  const recoveryRebuildWeek1 =
    weekNum === 1 &&
    (athleteState.transition_mode === 'recovery_rebuild' || athleteState.structural_load_hint === 'low');

  // recoveryRebuildWeek2EasyRunOnly: swaps quality run for easy run in week 2.
  // Only for standalone run plans — tri plans have quality sessions from week 2 onward.
  const recoveryRebuildWeek2EasyRunOnly =
    !hasTri &&
    weekNum === 2 &&
    athleteState.transition_mode === 'recovery_rebuild';

  // Weekly TSS budget for this week (scaled by phase, CTL, hours, tss multiplier)
  const baseTSS = scaledWeeklyTSS(phase, athleteState.current_ctl, athleteState.weekly_hours_available, block.tssMultiplier);

  // §1.3 ramp rate check: ensure budget doesn't spike CTL dangerously
  const { moderate: moderateRamp } = rampThresholds(athleteState.current_ctl);
  const maxSafeTSS = weeklyTSSForRamp(athleteState.current_ctl, moderateRamp);
  const weeklyTSSBudget = Math.min(baseTSS, maxSafeTSS);

  // Convert rest_days (0=Sun…6=Sat) to day-name set.
  // Our DAYS_OF_WEEK is Mon-indexed, rest_days uses 0=Sun.
  const restDayNames = new Set<string>(
    (athleteState.rest_days ?? []).map(n => {
      const sunFirstIndex = n; // 0=Sun,1=Mon,...6=Sat
      const monFirstIndex = (sunFirstIndex + 6) % 7;
      return DAYS_OF_WEEK[monFirstIndex];
    })
  );

  // ── Step 1: Immovable constraints ────────────────────────────────────────
  const grid = makeGrid(restDayNames);

  // ── Step 2: Place key sessions ───────────────────────────────────────────
  // Long run day preference (default Sunday)
  const longRunDayIdx = athleteState.long_run_day != null
    ? (athleteState.long_run_day + 6) % 7
    : DAYS_OF_WEEK.indexOf('Sunday');
  const longRunDay = DAYS_OF_WEEK[longRunDayIdx] ?? 'Sunday';

  // Long ride / brick day preference (default Saturday)
  const longRideDayIdx = athleteState.long_ride_day != null
    ? (athleteState.long_ride_day + 6) % 7
    : DAYS_OF_WEEK.indexOf('Saturday');
  const longRideDay = DAYS_OF_WEEK[longRideDayIdx] ?? 'Saturday';

  const bricksThisWeek = recoveryRebuildWeek1 ? 0 : BRICKS_PER_WEEK[phase];
  // Race week: no brick stress; all load is the event itself
  const effectiveBricks = raceThisWeek ? 0 : bricksThisWeek;

  // ── Determine run distance and bike hours from TSS budget distribution ──
  const dist = block.sportDistribution;
  const runPct   = dist.run      ?? 0.25;
  const bikePct  = dist.bike     ?? 0.45;
  const swimPct  = dist.swim     ?? 0.18;
  const strPct   = dist.strength ?? 0.06;

  const runBudget  = weeklyTSSBudget * runPct;
  const bikeBudget = weeklyTSSBudget * bikePct;
  const swimBudget = weeklyTSSBudget * swimPct;

  // Convert TSS budgets to session durations using average intensity
  // Run: mix of easy (~55 TSS/hr) and hard (~85 TSS/hr) → use 65 avg
  const runTotalMin  = Math.max(60, Math.round((runBudget / 65) * 60));
  // Bike: mix of easy + quality → use 62 avg
  const bikeTotalMin = Math.max(60, Math.round((bikeBudget / 62) * 60));
  // Swim: use 42 avg; scale down when Arc shows few recent swims (athlete_state.swim_volume_multiplier).
  const swimMult = Math.min(1, Math.max(0.35, athleteState.swim_volume_multiplier ?? 1));
  const swimTotalMin = Math.max(
    25,
    Math.round(Math.max(30, Math.round((swimBudget / 42) * 60)) * swimMult),
  );

  // Derive long run miles from typical 9:30/mi easy pace
  let longRunMinutes = isRecovery
    ? Math.min(60, Math.round(runTotalMin * 0.50))
    : phase === 'taper'
      ? Math.min(75, Math.round(runTotalMin * 0.55))
      : Math.min(150, Math.round(runTotalMin * 0.60));
  let longRunMiles = Math.max(4, Math.round(longRunMinutes / 9.5));

  if (raceThisWeek) {
    longRunMinutes = Math.min(longRunMinutes, 45);
    longRunMiles = Math.max(3, Math.min(longRunMiles, 5));
  }

  if (hasTri && !raceThisWeek) {
    const longRunFloor = longRunFloorMiles(primaryGoal.distance, phase);
    longRunMiles = Math.max(longRunMiles, longRunFloor);
    longRunMinutes = Math.round(longRunMiles * 9.5);
  }

  // Long ride hours
  let longRideMinutes = isRecovery
    ? Math.min(75, Math.round(bikeTotalMin * 0.60))
    : phase === 'taper'
      ? Math.min(90, Math.round(bikeTotalMin * 0.55))
      : Math.min(240, Math.round(bikeTotalMin * 0.65));
  let longRideHours = Math.max(0.75, Math.round(longRideMinutes / 15) * 0.25);

  if (raceThisWeek) {
    longRideHours = Math.min(longRideHours, 1.0);
  }
  if (hasTri) {
    const weeklyHours = athleteState.weekly_hours_available;
    const raceBikeDuration = expectedBikeDurationHours(primaryGoal.distance);
    const capFromBudgetAndRace = Math.min(raceBikeDuration * 1.1, weeklyHours * 0.45);
    const longRideCapHours = Math.max(raceBikeDuration * 0.8, capFromBudgetAndRace);
    longRideHours = Math.min(longRideCapHours, longRideHours);
  }

  if (recoveryRebuildWeek1 && !hasTri) {
    // Post-marathon week 1 (run plans only): cap leg load. Tri plans let the TSS budget
    // govern session length — week 1 is already light in base phase.
    longRunMinutes = Math.min(longRunMinutes, 30);
    longRideMinutes = Math.min(longRideMinutes, 60);
    longRunMiles = Math.max(2, Math.min(longRunMiles, Math.round(longRunMinutes / 10)));
    longRideHours = Math.min(1, Math.max(0.5, longRideMinutes / 60));
  }

  // Swim yards (average ~2.0 yd/sec net = 120 yd/min; with rest ~80 yd/min effective)
  let swimYards = Math.max(1200, Math.round(swimTotalMin * 80 / (hasTri ? 1 : 2)));
  if (swimMult < 0.92 && weekNum <= 8) {
    swimYards = Math.min(swimYards, Math.round(2400 + (weekNum - 1) * 80));
  }

  // ── BRICK / LONG RIDE ─────────────────────────────────────────────────────
  // Brick escalation by approach:
  //   base_first  — Z2 bricks throughout; race-simulation only in the final 2 RS weeks.
  //   race_peak   — race-pace bricks activate in Race-Specific (existing `brick` fn behaviour).
  const brickWeekInPhase = Math.max(1, weekNum - block.startWeek + 1);
  const brickPhaseWeeks  = block.endWeek - block.startWeek + 1;
  // For base_first: keep bricks at build intensity until final 2 weeks of Race-Specific
  const effectiveBrickPhase: Phase = (
    triApproach === 'base_first' &&
    phase === 'race_specific' &&
    brickWeekInPhase < Math.max(1, brickPhaseWeeks - 1)
  ) ? 'build'   // Z2 run leg (brick fn uses build → easy Z2 run)
    : phase;

  const longRideSlot = grid.get(longRideDay);
  if (!longRideSlot?.isRest && hasTri && !raceThisWeek) {
    if (effectiveBricks >= 1 && phase !== 'base') {
      const brickRunMi = brickRunTargetMiles(primaryGoal.distance, effectiveBrickPhase);
      const [bkBike, bkRun] = brick(longRideDay, longRideHours, brickRunMi, effectiveBrickPhase, servedGoal);
      longRideSlot!.sessions.push(bkBike, bkRun);
    } else {
      longRideSlot!.sessions.push(longRide(longRideDay, longRideHours, servedGoal));
    }
  }

  // ── LONG RUN ──────────────────────────────────────────────────────────────
  const longRunSlot = grid.get(longRunDay);
  // Avoid placing long run on same day as brick
  const longRunActualDay = longRunSlot?.sessions.length
    ? adjDay(longRunDay, -1)  // shift to Friday if Saturday has brick
    : longRunDay;
  const lrSlot = grid.get(longRunActualDay);
  if (!lrSlot?.isRest && !raceThisWeek) {
    if (phase === 'race_specific' && hasRun) {
      const mpMiles = Math.max(4, Math.round(longRunMiles * 0.60));
      lrSlot!.sessions.push(
        hasTri
          ? racePaceRun(longRunActualDay, mpMiles, primaryGoal.distance as TriRaceDistance, servedGoal)
          : marathonPaceRun(longRunActualDay, mpMiles, servedGoal),
      );
    } else {
      lrSlot!.sessions.push(
        longRun(longRunActualDay, longRunMiles, phase, servedGoal, hasTri ? primaryGoal.distance : null),
      );
    }
  }

  // ── Swim calendar (defaults: easy Mon, quality Thu; avoids long ride/run days) ──
  const swimEasyIdx =
    athleteState.swim_easy_day != null ? (athleteState.swim_easy_day + 6) % 7 : DAYS_OF_WEEK.indexOf('Monday');
  const swimQualityIdx =
    athleteState.swim_quality_day != null
      ? (athleteState.swim_quality_day + 6) % 7
      : DAYS_OF_WEEK.indexOf('Thursday');
  let swimEasyDay = DAYS_OF_WEEK[swimEasyIdx] ?? 'Monday';
  let swimQualityDay = DAYS_OF_WEEK[swimQualityIdx] ?? 'Thursday';
  if (swimEasyDay === swimQualityDay) swimQualityDay = 'Thursday';
  const qualitySwimBlocked = new Set<string>([longRideDay, longRunActualDay, ...restDayNames]);
  if (qualitySwimBlocked.has(swimQualityDay)) {
    for (let step = 1; step <= 6; step++) {
      const cand = adjDay(swimQualityDay, step);
      if (!qualitySwimBlocked.has(cand)) {
        swimQualityDay = cand;
        break;
      }
    }
  }

  const runQualityIdx =
    athleteState.run_quality_day != null
      ? (athleteState.run_quality_day + 6) % 7
      : DAYS_OF_WEEK.indexOf('Wednesday');
  let runQualityDay = DAYS_OF_WEEK[runQualityIdx] ?? 'Wednesday';
  const runEasyIdx =
    athleteState.run_easy_day != null
      ? (athleteState.run_easy_day + 6) % 7
      : DAYS_OF_WEEK.indexOf('Friday');
  let runEasyDay = DAYS_OF_WEEK[runEasyIdx] ?? 'Friday';
  if (runQualityDay === runEasyDay) {
    runEasyDay = adjDay(runEasyDay, 1);
  }

  // ── Bike quality + easy (defaults Tue / Wed; from Arc `preferred_days.quality_bike` / `easy_bike`) ──
  const bikeQualIdxBase =
    athleteState.bike_quality_day != null
      ? (athleteState.bike_quality_day + 6) % 7
      : DAYS_OF_WEEK.indexOf('Tuesday');
  let bikeQualityDay = DAYS_OF_WEEK[bikeQualIdxBase] ?? 'Tuesday';
  const bikeEasyIdxBase =
    athleteState.bike_easy_day != null
      ? (athleteState.bike_easy_day + 6) % 7
      : DAYS_OF_WEEK.indexOf('Wednesday');
  let bikeEasyDay = DAYS_OF_WEEK[bikeEasyIdxBase] ?? 'Wednesday';

  const blockedForBikeQual = new Set<string>([longRideDay, longRunActualDay, ...restDayNames]);
  if (blockedForBikeQual.has(bikeQualityDay)) {
    for (let step = 1; step <= 6; step++) {
      const cand = adjDay(bikeQualityDay, step);
      if (!blockedForBikeQual.has(cand)) {
        bikeQualityDay = cand;
        break;
      }
    }
  }
  if (bikeEasyDay === bikeQualityDay || bikeEasyDay === longRideDay || restDayNames.has(bikeEasyDay)) {
    for (let step = 1; step <= 6; step++) {
      const cand = adjDay(bikeEasyDay, step);
      if (cand !== bikeQualityDay && cand !== longRideDay && !restDayNames.has(cand)) {
        bikeEasyDay = cand;
        break;
      }
    }
  }

  const bikeQualitySlot = grid.get(bikeQualityDay);
  // Recovery weeks: replace bike quality with an easy aerobic ride (~45-60 min)
  // — keep the frequency, drop the intensity. Same pattern below for run/swim.
  if (!recoveryRebuildWeek1 && isRecovery && !bikeQualitySlot?.isRest && hasTri) {
    const recBikeHr = Math.max(0.75, Math.min(1.0, bikeTotalMin * 0.20 / 55));
    bikeQualitySlot!.sessions.push(easyBike(bikeQualityDay, recBikeHr, servedGoal));
  } else if (!recoveryRebuildWeek1 && !isRecovery && !bikeQualitySlot?.isRest && hasTri) {
    const bq = bikeQualityDay;
    if (phase === 'taper') {
      bikeQualitySlot!.sessions.push(bikeOpeners(bq, servedGoal));
    } else {
      bikeQualitySlot!.sessions.push(groupRideQualityBikeSession(bq, phase, servedGoal));
    }
    // Athlete rides with a recurring group on this day → label the just-pushed
    // session so the calendar reads "Group Ride — Threshold" instead of generic.
    // taper bikeOpeners is not relabeled (race week, group rides skipped).
    const label = athleteState.bike_quality_label;
    if (label && phase !== 'taper') {
      const last = bikeQualitySlot!.sessions[bikeQualitySlot!.sessions.length - 1];
      if (last && !/group ride|hammer ride/i.test(last.name)) {
        last.name = `${label} — ${last.name}`;
        last.tags = [...(last.tags ?? []), 'group_ride'];
      }
    }
  }

  // ── Run quality (default Wednesday; from Arc `preferred_days.quality_run`) ──
  const runQualitySlot = grid.get(runQualityDay);
  // Recovery weeks: replace run quality with an easy aerobic run at reduced mileage.
  if (!recoveryRebuildWeek1 && isRecovery && !runQualitySlot?.isRest) {
    const recEasyMi = Math.max(3, Math.round(longRunMiles * 0.40));
    runQualitySlot!.sessions.push(easyRun(runQualityDay, recEasyMi, servedGoal));
  } else if (!recoveryRebuildWeek1 && !isRecovery && !runQualitySlot?.isRest) {
    if (recoveryRebuildWeek2EasyRunOnly) {
      const easyMi = Math.max(4, Math.round(longRunMiles * 0.35));
      runQualitySlot!.sessions.push(easyRun(runQualityDay, easyMi, servedGoal));
    } else if (phase === 'taper') {
      const taperRunMi = Math.max(4, Math.round(longRunMiles * 0.40));
      runQualitySlot!.sessions.push(easyRun(runQualityDay, taperRunMi, servedGoal));
    } else if (triApproach === 'base_first') {
      // base_first: Z3 tempo throughout — no intervals until Race-Specific.
      if (phase === 'race_specific') {
        const rpMiles = Math.max(3, Math.round(longRunMiles * 0.35));
        runQualitySlot!.sessions.push(
          hasTri
            ? racePaceRun(runQualityDay, rpMiles, primaryGoal.distance, servedGoal)
            : marathonPaceRun(runQualityDay, rpMiles, servedGoal),
        );
      } else {
        // Build and Base: tempo (Z3) — builds muscular endurance safely
        const tempoMi = Math.max(3, Math.round(longRunMiles * 0.30));
        runQualitySlot!.sessions.push(tempoRun(runQualityDay, tempoMi, 1.5, servedGoal));
      }
    } else {
      // race_peak: base = short intervals; build = explicit VO2 (tri) or interval ladder (run-only);
      // race_specific = race-pace run (tri) / MP (run).
      if (phase === 'race_specific') {
        const mpMiles = Math.max(3, Math.round(longRunMiles * 0.35));
        runQualitySlot!.sessions.push(
          hasTri
            ? racePaceRun(runQualityDay, mpMiles, primaryGoal.distance, servedGoal)
            : marathonPaceRun(runQualityDay, mpMiles, servedGoal),
        );
      } else if (hasTri && phase === 'build') {
        runQualitySlot!.sessions.push(vo2Run(runQualityDay, servedGoal));
      } else {
        runQualitySlot!.sessions.push(intervalRun(runQualityDay, 6, phase, servedGoal));
      }
    }
  }

  // ── Quality swim day (default Thu; §6.2 — retain swim volume in taper) ───
  // Marathon-primary blocks (swimPct ≈ 0): maintenance easy swim only.
  let qualitySwimPlaced = false;
  const qualitySwimSlot = grid.get(swimQualityDay);
  if (!qualitySwimSlot?.isRest) {
    if (hasTri) {
      if (isRecovery) {
        // Recovery: easy aerobic swim at reduced volume — preserve feel + frequency.
        const recYd = Math.max(1200, Math.round(swimYards * 0.40));
        qualitySwimSlot!.sessions.push(easySwim(swimQualityDay, recYd, servedGoal));
        qualitySwimPlaced = true;
      } else if (recoveryRebuildWeek1) {
        const easyYd = Math.min(2800, Math.max(1500, Math.round(swimYards * 0.32)));
        qualitySwimSlot!.sessions.push(easySwim(swimQualityDay, easyYd, servedGoal));
        qualitySwimPlaced = true;
      } else {
        const tSwimYd = Math.max(1800, Math.round(swimYards * 0.55));
        const maintYd = Math.max(1200, Math.round(swimYards * 0.40));
        const qualitySwim = triApproach === 'base_first'
          ? cssAerobicSwim(swimQualityDay, tSwimYd, servedGoal)
          : thresholdSwim(swimQualityDay, tSwimYd, servedGoal);
        qualitySwimSlot!.sessions.push(
          phase === 'taper' || swimPct === 0 ? easySwim(swimQualityDay, maintYd, servedGoal) : qualitySwim,
        );
        qualitySwimPlaced = true;
      }
    }
  }

  // Run-only: mid-week easy run (fixed Thursday — not tied to swim prefs)
  const thursdayRunSlot = grid.get('Thursday');
  if (!hasTri && !thursdayRunSlot?.isRest) {
    const easyMi = isRecovery
      ? Math.max(2, Math.round(longRunMiles * 0.30))
      : Math.max(4, Math.round(longRunMiles * 0.40));
    thursdayRunSlot!.sessions.push(easyRun('Thursday', easyMi, servedGoal));
  }

  // ── Easy aerobic swim (default Mon) ─────────────────────────────────────────
  // In recovery weeks: place at ~30% of normal yards (frequency preserved, volume cut).
  const easySwimSlot = grid.get(swimEasyDay);
  if (!easySwimSlot?.isRest && hasTri && !recoveryRebuildWeek1) {
    const yardsScale = isRecovery ? 0.30 : 0.40;
    const recSwimYd = Math.max(1000, Math.round(swimYards * yardsScale));
    if (swimEasyDay !== swimQualityDay || !qualitySwimPlaced) {
      easySwimSlot!.sessions.push(easySwim(swimEasyDay, recSwimYd, servedGoal));
    }
  }

  // ── Mid-week easy run (default Friday; from Arc `preferred_days.easy_run`) ─
  // In recovery weeks: shorter shake-out run (~25% of long-run mileage) to keep
  // the running pattern without adding fatigue.
  const runEasySlot = grid.get(runEasyDay);
  if (!runEasySlot?.isRest && !['taper'].includes(phase)) {
    if (isRecovery) {
      const recMi = Math.max(2, Math.round(longRunMiles * 0.25));
      runEasySlot!.sessions.push(easyRun(runEasyDay, recMi, servedGoal));
    } else {
      const easyMi = recoveryRebuildWeek1
        ? Math.min(30, Math.max(3, Math.round(longRunMiles * 0.35)))
        : Math.max(3, Math.round(longRunMiles * 0.30));
      runEasySlot!.sessions.push(easyRun(runEasyDay, easyMi, servedGoal));
    }
  }

  // ── STRENGTH ──────────────────────────────────────────────────────────────
  // Strength frequency by phase:
  //   base: 2× (full hypertrophy programming)
  //   build / race_specific: 1× (one focused neural/strength session — concurrent training cap)
  //   taper / recovery: 1× (1×3 neural priming for taper, light movement-only for post-race recovery)
  // recoveryRebuildWeek1 (post-marathon week 1) suppresses strength entirely — handled below.
  let strFreq = phase === 'base' ? 2 : 1;
  if (recoveryRebuildWeek1) strFreq = 0;

  const capRaw = athleteState.strength_sessions_cap;
  if (capRaw != null && Number.isFinite(capRaw)) {
    const cap = Math.max(0, Math.min(3, Math.round(Number(capRaw))));
    strFreq = Math.min(strFreq, cap);
  }

  if (strFreq >= 1) {
    // Identify brick days in the current grid to pass to the protocol placement
    const brickDaysInGrid = [...grid.values()]
      .filter(s => s.sessions.some(w => w.tags?.includes('brick')))
      .map(s => s.day);

    // Identify HARD endurance days (for AMPK/mTOR 6-h interference warning)
    const hardEnduranceDaysInGrid = [...grid.values()]
      .filter(s => s.sessions.some(w => w.intensity_class === 'HARD' && w.type !== 'strength'))
      .map(s => s.day);

    // Determine limiter sport from goals (the goal with limiter flag, or lowest-priority goal)
    const limiterGoal = goals.find(g => (g as any).limiter === true)
      ?? goals.sort((a, b) => (a.priority === 'A' ? -1 : b.priority === 'A' ? 1 : 0)).slice(-1)[0];
    const limiterSport: 'swim' | 'bike' | 'run' =
      (['swim', 'bike', 'run'].includes(limiterGoal?.sport ?? '') ? limiterGoal!.sport : 'run') as 'swim' | 'bike' | 'run';

    // Blocked days: rest + brick + long ride + long run (actual calendar day)
    const blocked = new Set([...brickDaysInGrid, longRideDay, longRunActualDay, ...restDayNames]);

    const weekInPhase = options?.phaseBlocks?.length
      ? weekInPhaseForTimeline(options.phaseBlocks, weekNum, block)
      : Math.max(1, weekNum - block.startWeek + 1);
    const planTotalWeeks = Math.max(1, options?.totalWeeks ?? 52);

    const prefStrength = (athleteState.strength_preferred_days ?? [])
      .map((d) => d.charAt(0).toUpperCase() + d.slice(1).toLowerCase())
      .filter(Boolean);
    const prefSet = new Set(prefStrength);

    // Slot 1: first non-blocked day starting Monday (honor preferred strength days when possible)
    let candidates1 = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'].filter(d => !blocked.has(d));
    if (prefSet.size > 0) {
      const preferred = candidates1.filter(d => prefSet.has(d));
      if (preferred.length > 0) candidates1 = preferred;
    }
    const strDay = candidates1[0];
    if (strDay) {
      const strSlot = grid.get(strDay);
      if (strSlot) {
        const equipmentType = athleteState.equipment_type ?? 'commercial_gym';
        if (hasTri) {
          // Tri slot 1 (first preferred day, e.g. Monday) = upper body (index 1): lighter load
          // before Wednesday quality bike. Slot 2 (Thursday) = lower body (index 0): AM/PM with
          // quality run — matches the optimizer's Mon-upper / Thu-lower prescription.
          strSlot.sessions.push(triathlonStrength(strDay, phase, servedGoal, {
            weekInPhase,
            weekIndex: weekNum,
            totalWeeks: planTotalWeeks,
            isRecovery,
            limiterSport,
            sessionIndex: 1,
            equipmentType,
            longRideDayName: longRideDay,
            longRunDayName: longRunActualDay,
            strengthProtocolId: athleteState.strength_protocol,
            strengthIntent: athleteState.strength_intent,
          }));
        } else {
          strSlot.sessions.push(runStrength(strDay, phase, servedGoal, {
            weekInPhase,
            weekIndex: weekNum,
            totalWeeks: planTotalWeeks,
            isRecovery,
            equipmentType,
          }));
        }
      }
    }

    // Slot 2 (base phase only): second non-blocked day
    if (strFreq >= 2 && strDay) {
      let candidates2 = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'].filter(d => !blocked.has(d) && d !== strDay);
      if (prefSet.size > 0) {
        const preferred2 = candidates2.filter(d => prefSet.has(d));
        if (preferred2.length > 0) candidates2 = preferred2;
      }
      const strDay2 = candidates2[0];
      if (strDay2) {
        const strSlot2 = grid.get(strDay2);
        if (strSlot2) {
          const equipmentType2 = athleteState.equipment_type ?? 'commercial_gym';
          if (hasTri) {
            // Tri slot 2 (second preferred day, e.g. Thursday) = lower body (index 0): pairs
            // with quality run in the AM/PM performance exception.
            strSlot2.sessions.push(triathlonStrength(strDay2, phase, servedGoal, {
              weekInPhase,
              weekIndex: weekNum,
              totalWeeks: planTotalWeeks,
              isRecovery,
              limiterSport,
              sessionIndex: 0,
              equipmentType: equipmentType2,
              longRideDayName: longRideDay,
              longRunDayName: longRunActualDay,
              strengthProtocolId: athleteState.strength_protocol,
              strengthIntent: athleteState.strength_intent,
            }));
          } else {
            strSlot2.sessions.push(runStrength(strDay2, phase, servedGoal, {
              weekInPhase,
              weekIndex: weekNum,
              totalWeeks: planTotalWeeks,
              isRecovery,
              equipmentType: equipmentType2,
            }));
          }
        }
      }
    }
  }

  // ── Step 3: Secondary sessions — fill remaining TSS budget with easy work ──
  const currentTSS = gridSessions(grid).reduce((s, x) => s + x.tss, 0);
  const remaining  = weeklyTSSBudget - currentTSS;

  // Add a mid-week easy bike for triathlon plans. Never in race weeks.
  // When the athlete has an explicit bike_easy_day preference, always place it if the slot
  // has ≤1 session (TSS gate is waived — the athlete asked for it). For unset/default days,
  // still require remaining TSS > 50 so we don't pad thin weeks with junk miles.
  // Recovery weeks: place a short (~45 min) shake-out spin to preserve frequency.
  const hasExplicitBikeEasyPref = athleteState.bike_easy_day != null;
  if (hasTri && !recoveryRebuildWeek1 && !raceThisWeek) {
    const midRideSlot = grid.get(bikeEasyDay);
    if (midRideSlot && !midRideSlot.isRest) {
      const slotFree = midRideSlot.sessions.length <= 1;
      if (isRecovery && slotFree) {
        midRideSlot.sessions.push(easyBike(bikeEasyDay, 0.75, servedGoal));
      } else if (!isRecovery) {
        const budgetOk = hasExplicitBikeEasyPref || remaining > 50;
        if (slotFree && budgetOk) {
          const baseHours = remaining > 0 ? remaining * 0.50 / 55 : 1.0;
          const midRideHr = Math.max(0.75, Math.min(2.5, baseHours));
          if (baseHours > 2.5) {
            console.warn('[week-builder] easy bike capped from', baseHours.toFixed(2), 'to 2.5');
          }
          midRideSlot.sessions.push(easyBike(bikeEasyDay, midRideHr, servedGoal));
        }
      }
    }
  }

  // ── Race day (chronological tri B + A) — one session; replaces anything else that day
  if (raceThisWeek) {
    const d = raceThisWeek.dayName;
    const slot = grid.get(d);
    if (slot && !slot.isRest) {
      const gRace = goals.find((g) => g.id === raceThisWeek.goalId) ?? primaryGoal;
      const n = (gRace.event_name || '').toLowerCase();
      const projMin = n.includes('santa cruz') ? 320 : 330;
      const rawT = Math.round(estimateSessionTSS('race', 'MODERATE', projMin) * 0.9);
      slot.sessions = [{
        day: d,
        type: 'race',
        name: gRace.event_name,
        description:
          'Race day. Swim 1.2mi → Bike 56mi → Run 13.1mi. No add-on training; execute pacing and fueling.',
        duration: projMin,
        tss: rawT,
        weighted_tss: weightedTSS('race', rawT),
        intensity_class: 'MODERATE',
        steps_preset: [],
        tags: ['tri_race', 'race_day', 'event', 'no_extra_training'],
        zone_targets: 'race',
        serves_goal: gRace.id,
      }];
    }
  }

  // ── Step 4: Hard/Easy enforcement ────────────────────────────────────────
  enforceHardEasy(grid);

  // ── Step 5: 80/20 compliance ──────────────────────────────────────────────
  const week8020TradeOffs = enforce8020(grid, phase);

  const qrLbTradeOffStrings = collectQualityRunLowerBodyTradeOffs(gridSessions(grid));

  // Same-day product matrix: validate what we ship; attempt strength-only auto-fix; always log if still bad.
  // Performance + co-equal strength athletes may combine quality_run AM + lower_body PM (EXPERIENCE_MODIFIER).
  // strength_intent === 'performance' is the co-equal flag (see AthleteState type + EXPERIENCE_MODIFIER_TEXT).
  const isPerformanceCoequal = athleteState.strength_intent === 'performance';
  const sameDayPre = validateWeekGridSameDayMatrix(grid);
  if (!sameDayPre.valid) {
    console.warn('[week-builder] same-day schedule conflicts detected:', sameDayPre.conflicts);
    const res = tryResolveSameDayMatrixConflicts(grid, isPerformanceCoequal);
    if (res.length > 0) {
      console.warn('[week-builder] same-day auto-resolution (strength removal):', res);
    }
    const sameDayPost = validateWeekGridSameDayMatrix(grid);
    if (!sameDayPost.valid) {
      console.warn('[week-builder] same-day schedule conflicts after resolution:', sameDayPost.conflicts);
    }
  }

  // ── Steps 6 & 7: TSS + ramp rate validation handled in validator.ts ───────

  const allSessions = gridSessions(grid);
  const mergedTradeOffs = [
    ...week8020TradeOffs,
    ...qrLbTradeOffStrings,
  ];
  return computeWeekMetrics(allSessions, weekNum, phase, isRecovery, mergedTradeOffs);
}

const CONCENTRATED_LOAD_DAY =
  'Concentrated load day — your Wednesday group ride anchor required pairing the quality run and lower body session on Thursday. Run first, then lift. This is intentional.';

/**
 * Wednesday quality-bike anchors often shift quality_run to Thursday; pairing with lower-body
 * strength uses the performance co-equal exception. Surface that for coach/UI (`week_trade_offs`).
 */
function collectQualityRunLowerBodyTradeOffs(
  sessions: PlannedSession[],
  _bikeQualityDayResolved: string,
): string[] {
  const byDay = new Map<string, PlannedSession[]>();
  for (const s of sessions) {
    const arr = byDay.get(s.day) ?? [];
    arr.push(s);
    byDay.set(s.day, arr);
  }
  for (const daySessions of byDay.values()) {
    const hasQualityRun = daySessions.some(
      (s) => s.type === 'run' && (s.tags?.includes('quality') ?? false),
    );
    const hasLowerBodyStrength = daySessions.some(
      (s) => s.type === 'strength' && (s.tags?.includes('lower_body') ?? false),
    );
    if (hasQualityRun && hasLowerBodyStrength) return [CONCENTRATED_LOAD_DAY];
  }
  return [];
}

// ── Ramp helper (duplicated locally to avoid circular import) ────────────────

function weeklyTSSForRamp(currentCTL: number, targetWeeklyRamp: number): number {
  const alpha = 1 - Math.exp(-1 / 42);
  const dailyDelta = targetWeeklyRamp / 7;
  return Math.round((currentCTL + dailyDelta / alpha) * 7);
}
