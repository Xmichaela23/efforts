// generate-combined-plan/week-builder.ts
//
// Implements §8 Week Construction Algorithm — all 7 steps.
// This is the core of the engine. All hard/easy constraints, 80/20 enforcement,
// TSS budgeting, ramp rate validation, and brick placement happen here.

import type {
  PlannedSession, GeneratedWeek, Phase, PhaseBlock, GoalInput,
  AthleteState, AthleteMemory,
} from './types.ts';
import type { Sport, Intensity } from './types.ts';
import {
  DAYS_OF_WEEK, DAY_INDEX, BRICKS_PER_WEEK,
  PHASE_ZONE_DIST, hardEasyOk, scaledWeeklyTSS, projectedCTL,
  rampThresholds,
} from './science.ts';
import {
  longRun, easyRun, tempoRun, intervalRun, marathonPaceRun,
  longRide, thresholdBike, vo2Bike, sweetSpotBike, tempoBike, easyBike, bikeOpeners,
  thresholdSwim, cssAerobicSwim, easySwim,
  brick, triathlonStrength, runStrength,
} from './session-factory.ts';

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
function adjDay(day: string, delta: number): string {
  const idx = DAY_INDEX[day];
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
          s.intensity_class = 'MODERATE';
          s.zone_targets = s.zone_targets.replace(/Z4|Z5|intervals/gi, 'Z3');
          s.name = s.name.replace(/Threshold|Intervals|VO2/i, 'Steady-State');
          s.description = '[Downgraded to Moderate — hard/easy rule] ' + s.description;
          s.tags = [...s.tags.filter(t => !['threshold','intervals','vo2max'].includes(t)), 'steady_state'];
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

function enforce8020(grid: WeekGrid, phase: Phase): void {
  const target   = PHASE_ZONE_DIST[phase];
  const sessions = gridSessions(grid);
  const totalMin = sessions.reduce((s, x) => s + x.duration, 0);
  if (totalMin === 0) return;

  let hardMin    = sessions.reduce((s, x) => s + effectiveHardMin(x), 0);
  const maxAllowed = totalMin * (1 - target.low); // e.g. 0.80 target → 20% of total

  if (hardMin <= maxAllowed) return;

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
        const isProtected = s.tags?.some(t => ['brick','long_run','long_ride'].includes(t));
        if (s.type !== sport || s.intensity_class === 'EASY' || isProtected) continue;

        const before = effectiveHardMin(s);
        // Downgrade directly to EASY — the hard/easy day enforcement (Step 4)
        // already handled HARD→MODERATE transitions for consecutive-day violations.
        // This step is purely about the weekly time-in-zone budget.
        s.intensity_class = 'EASY';
        s.zone_targets = 'Z2';
        s.description = `[Adjusted to EASY — 80/20 budget] ` + s.description;
        hardMin -= before; // effectiveHardMin of EASY = 0
      }
    }
  }
}

// ── TSS summary helpers ───────────────────────────────────────────────────────

function computeWeekMetrics(sessions: PlannedSession[], weekNum: number, phase: Phase, isRecovery: boolean): GeneratedWeek {
  const sport_raw_tss: Record<Sport, number> = { run: 0, bike: 0, swim: 0, strength: 0 };
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
): GeneratedWeek {

  const phase = block.phase;
  const isRecovery = block.isRecovery;
  const primaryGoal = goals.find(g => g.id === block.primaryGoalId) ?? goals[0];
  const hasTri = goals.some(g => ['triathlon', 'tri'].includes(g.sport?.toLowerCase()));
  const hasRun = goals.some(g => g.sport?.toLowerCase() === 'run');
  const triApproach = athleteState.tri_approach ?? 'race_peak';
  const servedGoal = 'shared'; // all sessions serve multiple goals in combined plan

  /** Week 1 after a recent marathon / race (from Arc + create-goal `recovery_rebuild`). */
  const recoveryRebuildWeek1 =
    weekNum === 1 &&
    (athleteState.transition_mode === 'recovery_rebuild' || athleteState.structural_load_hint === 'low');

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

  // Long ride hours
  let longRideMinutes = isRecovery
    ? Math.min(75, Math.round(bikeTotalMin * 0.60))
    : phase === 'taper'
      ? Math.min(90, Math.round(bikeTotalMin * 0.55))
      : Math.min(240, Math.round(bikeTotalMin * 0.65));
  let longRideHours = Math.max(0.75, Math.round(longRideMinutes / 15) * 0.25);

  if (recoveryRebuildWeek1) {
    // Post-marathon week 1: cap leg load; swim sessions left as computed (low impact).
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
  if (!longRideSlot?.isRest && hasTri) {
    if (bricksThisWeek >= 1 && phase !== 'base') {
      const brickRunMin = Math.max(15, Math.round(longRunMiles * 0.20) * 10);
      const [bkBike, bkRun] = brick(longRideDay, longRideHours, brickRunMin, effectiveBrickPhase, servedGoal);
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
  if (!lrSlot?.isRest) {
    if (phase === 'race_specific' && hasRun) {
      const mpMiles = Math.max(4, Math.round(longRunMiles * 0.60));
      lrSlot!.sessions.push(marathonPaceRun(longRunActualDay, mpMiles, servedGoal));
    } else {
      lrSlot!.sessions.push(longRun(longRunActualDay, longRunMiles, phase, servedGoal));
    }
  }

  // ── TUESDAY: Bike quality ─────────────────────────────────────────────────
  const tuesdaySlot = grid.get('Tuesday');
  if (!recoveryRebuildWeek1 && !tuesdaySlot?.isRest && hasTri) {
    if (phase === 'taper') {
      tuesdaySlot!.sessions.push(bikeOpeners('Tuesday', servedGoal));
    } else if (triApproach === 'base_first') {
      // base_first: quality time stays in Z3. No threshold or VO2 work.
      if (phase === 'race_specific') {
        tuesdaySlot!.sessions.push(sweetSpotBike('Tuesday', 3, 12, servedGoal)); // 3×12 SS
      } else if (phase === 'build') {
        const intervals = Math.max(2, Math.min(3, Math.floor(bikeTotalMin / 60)));
        tuesdaySlot!.sessions.push(tempoBike('Tuesday', intervals, 20, servedGoal));
      } else {
        // Base: easy aerobic with gentle sweet spot introduction
        tuesdaySlot!.sessions.push(sweetSpotBike('Tuesday', 2, 12, servedGoal));
      }
    } else {
      // race_peak: push the ceiling with threshold and VO2 work
      if (phase === 'race_specific') {
        tuesdaySlot!.sessions.push(vo2Bike('Tuesday', Math.max(4, Math.min(6, Math.round(bikeTotalMin / 40))), servedGoal));
      } else if (phase === 'build') {
        const intervals = Math.max(2, Math.min(4, Math.floor(bikeTotalMin / 60)));
        tuesdaySlot!.sessions.push(thresholdBike('Tuesday', intervals, 20, servedGoal));
      } else {
        // Base: sweet spot to introduce intensity gently
        tuesdaySlot!.sessions.push(sweetSpotBike('Tuesday', 2, 15, servedGoal));
      }
    }
  }

  // ── WEDNESDAY: Run quality ────────────────────────────────────────────────
  const wednesdaySlot = grid.get('Wednesday');
  if (!recoveryRebuildWeek1 && !wednesdaySlot?.isRest) {
    if (phase === 'taper') {
      const taperRunMi = Math.max(4, Math.round(longRunMiles * 0.40));
      wednesdaySlot!.sessions.push(easyRun('Wednesday', taperRunMi, servedGoal));
    } else if (triApproach === 'base_first') {
      // base_first: Z3 tempo throughout — no intervals until Race-Specific.
      if (phase === 'race_specific') {
        const rpMiles = Math.max(3, Math.round(longRunMiles * 0.35));
        wednesdaySlot!.sessions.push(marathonPaceRun('Wednesday', rpMiles, servedGoal)); // race-pace comfort
      } else {
        // Build and Base: tempo (Z3) — builds muscular endurance safely
        const tempoMi = Math.max(3, Math.round(longRunMiles * 0.30));
        wednesdaySlot!.sessions.push(tempoRun('Wednesday', tempoMi, 1.5, servedGoal));
      }
    } else {
      // race_peak: VO2 intervals in build, marathon pace in RS
      if (phase === 'race_specific') {
        const mpMiles = Math.max(3, Math.round(longRunMiles * 0.35));
        wednesdaySlot!.sessions.push(marathonPaceRun('Wednesday', mpMiles, servedGoal));
      } else if (phase === 'build') {
        const tempoMi = Math.max(3, Math.round(longRunMiles * 0.30));
        wednesdaySlot!.sessions.push(tempoRun('Wednesday', tempoMi, 1.5, servedGoal));
      } else {
        // Base: easy intervals to introduce neuromuscular load
        wednesdaySlot!.sessions.push(intervalRun('Wednesday', 6, phase, servedGoal));
      }
    }
  }

  // ── THURSDAY: Swim quality ────────────────────────────────────────────────
  // §6.2: "Retain swim volume longest" — spec explicitly keeps swim even in taper.
  // For marathon-primary blocks (swimPct ≈ 0), add a maintenance easy swim to
  // prevent detraining (§2.2 floor: min 1 swim/week for triathlon athletes).
  //
  // Note: The 2nd brick (race_specific) was removed from Thursday. Spec says
  // "1-2 bricks/week" — we use 1 brick for recreational athletes to keep the
  // 80/20 hard budget achievable (two protected HARD bricks would exceed it).
  let thursdayHasSwim = false;
  const thursdaySlot = grid.get('Thursday');
  if (!thursdaySlot?.isRest) {
    if (hasTri) {
      if (!isRecovery) {
        if (recoveryRebuildWeek1) {
          // Post-marathon week 1: one easy aerobic swim only (no threshold/CSS blocks).
          const easyYd = Math.min(2800, Math.max(1500, Math.round(swimYards * 0.32)));
          thursdaySlot!.sessions.push(easySwim('Thursday', easyYd, servedGoal));
          thursdayHasSwim = true;
        } else {
        // Quality swim in build/race_specific, easy swim in taper (§6.2)
        const tSwimYd = Math.max(1800, Math.round(swimYards * 0.55));
        const maintYd  = Math.max(1200, Math.round(swimYards * 0.40));
        // base_first: CSS aerobic pace (comfortable race speed, not maximal threshold)
        // race_peak:  CSS threshold pace (lactate challenge, 10s rest intervals)
        const qualitySwim = triApproach === 'base_first'
          ? cssAerobicSwim('Thursday', tSwimYd, servedGoal)
          : thresholdSwim('Thursday', tSwimYd, servedGoal);
        thursdaySlot!.sessions.push(
          phase === 'taper' || swimPct === 0
            ? easySwim('Thursday', maintYd, servedGoal)   // maintenance in taper/marathon blocks
            : qualitySwim
        );
        thursdayHasSwim = true;
        }
      }
    } else if (!isRecovery) {
      // Run-only plan: easy run or second easy session
      const easyMi = Math.max(4, Math.round(longRunMiles * 0.40));
      thursdaySlot!.sessions.push(easyRun('Thursday', easyMi, servedGoal));
    }
  }

  // ── MONDAY: Easy recovery swim ────────────────────────────────────────────
  // Skip if Monday is rest day — Thursday swim is the maintenance session.
  const mondaySlot = grid.get('Monday');
  if (!mondaySlot?.isRest && hasTri && !isRecovery && !recoveryRebuildWeek1) {
    const recSwimYd = Math.max(1200, Math.round(swimYards * 0.40));
    mondaySlot!.sessions.push(easySwim('Monday', recSwimYd, servedGoal));
  }

  // ── FRIDAY: Easy run (cross-sport recovery credit — §4.4) ─────────────────
  const fridaySlot = grid.get('Friday');
  if (!fridaySlot?.isRest && !isRecovery && !['taper', 'recovery'].includes(phase)) {
    const easyMi = recoveryRebuildWeek1
      ? Math.min(30, Math.max(3, Math.round(longRunMiles * 0.35)))
      : Math.max(3, Math.round(longRunMiles * 0.30));
    fridaySlot!.sessions.push(easyRun('Friday', easyMi, servedGoal));
  }

  // ── STRENGTH ──────────────────────────────────────────────────────────────
  let strFreq = phase === 'base' ? 2 : phase === 'taper' || phase === 'recovery' ? 0 : 1;
  if (recoveryRebuildWeek1) strFreq = 0;

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

    // Blocked days: rest days + brick days + Sunday (long run)
    const blocked = new Set([...brickDaysInGrid, longRideDay, longRunDay, ...restDayNames]);

    // weekInPhase: how many weeks into this phase are we?
    const weekInPhase = Math.max(1, weekNum - block.startWeek + 1);

    // Slot 1: first non-blocked day starting Monday
    const candidates1 = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'].filter(d => !blocked.has(d));
    const strDay = candidates1[0];
    if (strDay) {
      const strSlot = grid.get(strDay);
      if (strSlot) {
        const equipmentType = athleteState.equipment_type ?? 'commercial_gym';
        if (hasTri) {
          strSlot.sessions.push(triathlonStrength(strDay, phase, servedGoal, { weekInPhase, isRecovery, limiterSport, sessionIndex: 0, equipmentType }));
        } else {
          strSlot.sessions.push(runStrength(strDay, phase, servedGoal, { weekInPhase, isRecovery, equipmentType }));
        }
      }
    }

    // Slot 2 (base phase only): second non-blocked day
    if (strFreq >= 2 && strDay) {
      const candidates2 = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'].filter(d => !blocked.has(d) && d !== strDay);
      const strDay2 = candidates2[0];
      if (strDay2) {
        const strSlot2 = grid.get(strDay2);
        if (strSlot2) {
          const equipmentType2 = athleteState.equipment_type ?? 'commercial_gym';
          if (hasTri) {
            strSlot2.sessions.push(triathlonStrength(strDay2, phase, servedGoal, { weekInPhase, isRecovery, limiterSport, sessionIndex: 1, equipmentType: equipmentType2 }));
          } else {
            strSlot2.sessions.push(runStrength(strDay2, phase, servedGoal, { weekInPhase, isRecovery, equipmentType: equipmentType2 }));
          }
        }
      }
    }
  }

  // ── Step 3: Secondary sessions — fill remaining TSS budget with easy work ──
  const currentTSS = gridSessions(grid).reduce((s, x) => s + x.tss, 0);
  const remaining  = weeklyTSSBudget - currentTSS;

  // Add a mid-week easy bike if budget remains and plan is triathlon-focused
  if (remaining > 50 && hasTri && !isRecovery && !recoveryRebuildWeek1) {
    const midRideSlot = grid.get('Wednesday');
    if (midRideSlot && !midRideSlot.isRest && midRideSlot.sessions.length === 1) {
      const midRideHr = Math.max(0.75, Math.min(1.5, remaining * 0.50 / 55));
      midRideSlot.sessions.push(easyBike('Wednesday', midRideHr, servedGoal));
    }
  }

  // ── Step 4: Hard/Easy enforcement ────────────────────────────────────────
  enforceHardEasy(grid);

  // ── Step 5: 80/20 compliance ──────────────────────────────────────────────
  enforce8020(grid, phase);

  // ── Steps 6 & 7: TSS + ramp rate validation handled in validator.ts ───────

  const allSessions = gridSessions(grid);
  return computeWeekMetrics(allSessions, weekNum, phase, isRecovery);
}

// ── Ramp helper (duplicated locally to avoid circular import) ────────────────

function weeklyTSSForRamp(currentCTL: number, targetWeeklyRamp: number): number {
  const alpha = 1 - Math.exp(-1 / 42);
  const dailyDelta = targetWeeklyRamp / 7;
  return Math.round((currentCTL + dailyDelta / alpha) * 7);
}
