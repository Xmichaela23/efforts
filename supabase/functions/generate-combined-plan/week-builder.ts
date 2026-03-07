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
  longRide, thresholdBike, vo2Bike, sweetSpotBike, easyBike, bikeOpeners,
  thresholdSwim, easySwim,
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
// §3.4 — If Zone 3+ time > 25% of total, downgrade a MODERATE session to EASY.

function enforce8020(grid: WeekGrid, phase: Phase): void {
  const target = PHASE_ZONE_DIST[phase];
  const sessions = gridSessions(grid);
  const totalMin = sessions.reduce((s, x) => s + x.duration, 0);
  if (totalMin === 0) return;

  let hardModeMin = sessions.filter(s => s.intensity_class !== 'EASY').reduce((s, x) => s + x.duration, 0);
  const maxAllowed = totalMin * (1 - target.low);

  if (hardModeMin > maxAllowed) {
    // Find a MODERATE session on a non-rest day and downgrade to EASY
    for (const slot of grid.values()) {
      for (const s of slot.sessions) {
        if (s.intensity_class === 'MODERATE' && hardModeMin > maxAllowed) {
          s.intensity_class = 'EASY';
          s.zone_targets = 'Z2';
          s.description = '[Downgraded to Easy — 80/20 compliance] ' + s.description;
          hardModeMin -= s.duration;
        }
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
    if (s.intensity_class === 'EASY') z12min += s.duration;
    else z3min += s.duration;
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
  const servedGoal = 'shared'; // all sessions serve multiple goals in combined plan

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

  const bricksThisWeek = BRICKS_PER_WEEK[phase];

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
  // Swim: use 42 avg
  const swimTotalMin = Math.max(30, Math.round((swimBudget / 42) * 60));

  // Derive long run miles from typical 9:30/mi easy pace
  const longRunMinutes = isRecovery
    ? Math.min(60, Math.round(runTotalMin * 0.50))
    : phase === 'taper'
      ? Math.min(75, Math.round(runTotalMin * 0.55))
      : Math.min(150, Math.round(runTotalMin * 0.60));
  const longRunMiles = Math.max(4, Math.round(longRunMinutes / 9.5));

  // Long ride hours
  const longRideMinutes = isRecovery
    ? Math.min(75, Math.round(bikeTotalMin * 0.60))
    : phase === 'taper'
      ? Math.min(90, Math.round(bikeTotalMin * 0.55))
      : Math.min(240, Math.round(bikeTotalMin * 0.65));
  const longRideHours = Math.max(0.75, Math.round(longRideMinutes / 15) * 0.25);

  // Swim yards (average ~2.0 yd/sec net = 120 yd/min; with rest ~80 yd/min effective)
  const swimYards = Math.max(1200, Math.round(swimTotalMin * 80 / (hasTri ? 1 : 2)));

  // ── BRICK / LONG RIDE ─────────────────────────────────────────────────────
  const longRideSlot = grid.get(longRideDay);
  if (!longRideSlot?.isRest && hasTri) {
    if (bricksThisWeek >= 1 && phase !== 'base') {
      const brickRunMin = Math.max(15, Math.round(longRunMiles * 0.20) * 10);
      const [bkBike, bkRun] = brick(longRideDay, longRideHours, brickRunMin, phase, servedGoal);
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
  if (!tuesdaySlot?.isRest && hasTri) {
    if (phase === 'taper') {
      tuesdaySlot!.sessions.push(bikeOpeners('Tuesday', servedGoal));
    } else if (phase === 'race_specific') {
      tuesdaySlot!.sessions.push(vo2Bike('Tuesday', Math.max(4, Math.min(6, Math.round(bikeTotalMin / 40))), servedGoal));
    } else if (phase === 'build') {
      const intervals = Math.max(2, Math.min(4, Math.floor(bikeTotalMin / 60)));
      tuesdaySlot!.sessions.push(thresholdBike('Tuesday', intervals, 20, servedGoal));
    } else {
      // Base: sweet spot to introduce intensity gently
      tuesdaySlot!.sessions.push(sweetSpotBike('Tuesday', 2, 15, servedGoal));
    }
  }

  // ── WEDNESDAY: Run quality ────────────────────────────────────────────────
  const wednesdaySlot = grid.get('Wednesday');
  if (!wednesdaySlot?.isRest) {
    if (phase === 'taper') {
      const taperRunMi = Math.max(4, Math.round(longRunMiles * 0.40));
      wednesdaySlot!.sessions.push(easyRun('Wednesday', taperRunMi, servedGoal));
    } else if (phase === 'race_specific') {
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

  // ── THURSDAY: Swim quality + second brick (Race-Specific) ─────────────────
  const thursdaySlot = grid.get('Thursday');
  if (!thursdaySlot?.isRest) {
    if (hasTri) {
      // Second brick in Race-Specific phase
      if (bricksThisWeek >= 2 && phase === 'race_specific') {
        const brickBikeHr = Math.max(0.75, longRideHours * 0.50);
        const [bk2Bike, bk2Run] = brick('Thursday', brickBikeHr, 20, phase, servedGoal);
        thursdaySlot!.sessions.push(bk2Bike, bk2Run);
      } else if (phase !== 'taper') {
        // Mid-week quality swim
        const tSwimYd = Math.max(1800, Math.round(swimYards * 0.55));
        thursdaySlot!.sessions.push(thresholdSwim('Thursday', tSwimYd, servedGoal));
      }
    } else if (!isRecovery) {
      // Run-only plan: easy run or second easy session
      const easyMi = Math.max(4, Math.round(longRunMiles * 0.40));
      thursdaySlot!.sessions.push(easyRun('Thursday', easyMi, servedGoal));
    }
  }

  // ── MONDAY: Easy recovery swim ────────────────────────────────────────────
  const mondaySlot = grid.get('Monday');
  if (!mondaySlot?.isRest && hasTri && !isRecovery) {
    const recSwimYd = Math.max(1200, Math.round(swimYards * 0.40));
    mondaySlot!.sessions.push(easySwim('Monday', recSwimYd, servedGoal));
  }

  // ── FRIDAY: Easy run (cross-sport recovery credit — §4.4) ─────────────────
  const fridaySlot = grid.get('Friday');
  if (!fridaySlot?.isRest && !isRecovery && !['taper', 'recovery'].includes(phase)) {
    const easyMi = Math.max(3, Math.round(longRunMiles * 0.30));
    fridaySlot!.sessions.push(easyRun('Friday', easyMi, servedGoal));
  }

  // ── STRENGTH ──────────────────────────────────────────────────────────────
  const strFreq = phase === 'base' ? 2 : phase === 'taper' || phase === 'recovery' ? 0 : 1;
  const strFn = hasTri ? triathlonStrength : runStrength;

  if (strFreq >= 1) {
    const strDay = ['Monday'].find(d => {
      const sl = grid.get(d);
      return sl && !sl.isRest && sl.sessions.length === 0;
    }) ?? 'Monday';
    const strSlot = grid.get(strDay);
    if (strSlot) strSlot.sessions.push(strFn(strDay, phase, servedGoal));
  }
  if (strFreq >= 2) {
    const strDay2 = ['Friday'].find(d => {
      const sl = grid.get(d);
      return sl && !sl.isRest && sl.sessions.length <= 1;
    }) ?? 'Friday';
    const strSlot2 = grid.get(strDay2);
    if (strSlot2) strSlot2.sessions.push(strFn(strDay2, phase, servedGoal));
  }

  // ── Step 3: Secondary sessions — fill remaining TSS budget with easy work ──
  const currentTSS = gridSessions(grid).reduce((s, x) => s + x.tss, 0);
  const remaining  = weeklyTSSBudget - currentTSS;

  // Add a mid-week easy bike if budget remains and plan is triathlon-focused
  if (remaining > 50 && hasTri && !isRecovery) {
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
