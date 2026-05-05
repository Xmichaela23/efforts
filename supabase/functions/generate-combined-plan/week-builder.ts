// generate-combined-plan/week-builder.ts
// IMPORTANT: This file implements scheduling logic that is also implemented in
// _shared/week-optimizer.ts. The same-day matrix is shared via
// schedule-session-constraints.ts but sequential rules and placement logic are
// duplicated. Any rule change MUST be applied to both files.
// Strength: `week-builder` no longer places lower-body strength on `run_quality_day` for tri;
// Heavy lower (tri slot 2) also avoids the two calendar days before `longRunActualDay` and before
// any brick day (48h floor vs long-run / brick leg stress). Mirrors `_shared/week-optimizer.ts`
// `sequentialOk` for `lower_body_strength`. Co-equal stacking: see schedule-session-constraints.
// See: supabase/functions/_shared/schedule-session-constraints.ts
//
// Implements §8 Week Construction Algorithm — all 7 steps.
// This is the core of the engine. All hard/easy constraints, 80/20 enforcement,
// TSS budgeting, ramp rate validation, and brick placement happen here.

import type {
  PlannedSession, GeneratedWeek, Phase, PhaseBlock, GoalInput,
  AthleteState, AthleteMemory, RaceAnchor,
  ConflictEvent, ConflictType, WeekStateReason,
} from './types.ts';
import type { Sport, Intensity } from './types.ts';
import {
  getSwimSlotTemplates,
  getRecoverySwimTemplate,
  normalizeSwimProgramDistance,
  type SwimSlotTemplate,
} from '../_shared/swim-program-templates.ts';
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
  groupRideQualityBikeSession, groupRideSession,
  swimSessionFromTemplate,
  openWaterPracticeSwim,
  brick, triathlonStrength, runStrength,
  downgradedEasyAerobicFrom, downgradedHardToModerateFrom,
} from './session-factory.ts';
import {
  arePlannedSessionsCompatible,
  plannedSessionToScheduleSlot,
  type SameDayCompatContext,
} from '../_shared/schedule-session-constraints.ts';
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

function hasConsolidatedQualityRunWithLowerBody(slot: DaySlot): boolean {
  const hasQualityRun = slot.sessions.some(
    (s) => s.type === 'run' && (s.tags?.includes('quality') ?? false),
  );
  const hasLowerBodyStrength = slot.sessions.some(
    (s) => s.type === 'strength' && (s.tags?.includes('lower_body') ?? false),
  );
  return hasQualityRun && hasLowerBodyStrength;
}

// Numerically index days so we can check adjacency
function adjDay(day: string, delta: number): DayOfWeek {
  const idx = DAY_INDEX[day] ?? 0;
  return DAYS_OF_WEEK[(idx + delta + 7) % 7];
}

/** Lower-body barbell day cannot fall in the 48h window before long run or brick (discrete: next two calendar days). */
function heavyLowerBlockedWithin48hOfLongRunOrBrick(
  day: string,
  longRunDay: string,
  brickDays: ReadonlySet<string>,
): boolean {
  const d1 = adjDay(day, 1);
  const d2 = adjDay(day, 2);
  if (longRunDay === d1 || longRunDay === d2) return true;
  if (brickDays.has(d1) || brickDays.has(d2)) return true;
  return false;
}

function conflictDayLo(day: string): string {
  return (day ?? '').toLowerCase();
}

function mkConflictId(weekNum: number, slug: string): string {
  return `w${weekNum}-${slug}`;
}

/**
 * Action strings that mean "accept the engine's placement silently — don't re-emit the conflict."
 * Populated from the resolver's `action` strings for "accept" options.
 */
const PREF_ACCEPT_ACTIONS = new Set<string>([
  'move_to_alternate_day',
  // quality run
  'accept_planner_quality_run_day',
  'accept_planner_adjacent_quality_run',
  'accept_planner_quality_run_stimulus',
  'revert_quality_run_to_preferred_day',
  // swim
  'accept_planner_swim_stimulus',
  'accept_planner_adjacent_swim',
  'soften_swim_main_set',
  // bike
  'accept_planner_bike_stimulus',
  'accept_planner_adjacent_bike',
  'soften_bike_quality_week',
  // third swim
  'accept_planner_third_swim_day',
  'defer_third_swim',
  // strength
  'accept_planner_lower_body_day',
  'accept_planner_adjacent_strength',
  'nudge_strength_day',
  // brick
  'accept_planner_brick_day',
  'accept_planner_brick_layout',
  'nudge_brick_day',
]);

/** Action strings that mean "skip this session entirely this week." */
const PREF_DROP_ACTIONS = new Set<string>([
  'drop_this_week',
  'accept_drop_quality_run',
  'trim_peer_sessions_retry',
  'drop_third_swim_week',
  'accept_drop_third_swim',
]);

/** Action strings that mean "keep the quality run on its preferred day despite the anchor conflict." */
const PREF_KEEP_QUALITY_RUN_ACTIONS = new Set<string>([
  'keep_quality_run_preferred_day',
  'keep_quality_run_thursday',
  'keep_quality_run_same_day',
]);

function uniqReasons(r: WeekStateReason[]): WeekStateReason[] {
  return [...new Set(r)];
}

function inferConflictTypeFromPair(a: PlannedSession, b: PlannedSession): ConflictType {
  const ka = plannedSessionToScheduleSlot(a);
  const kb = plannedSessionToScheduleSlot(b);
  if (a.tags?.includes('brick') || b.tags?.includes('brick')) return 'brick_blocked';
  if (ka === 'lower_body_strength' || kb === 'lower_body_strength') return 'heavy_lower_blocked';
  if (ka === 'quality_run' || kb === 'quality_run') return 'quality_run_blocked';
  if (ka === 'quality_swim' || kb === 'quality_swim') return 'quality_swim_blocked';
  if (ka === 'quality_bike' || kb === 'quality_bike') return 'quality_bike_blocked';
  return 'quality_run_blocked';
}

function blockingReasonsForMatrixPair(a: PlannedSession, b: PlannedSession): WeekStateReason[] {
  const r: WeekStateReason[] = ['no_clean_day'];
  if (a.tags?.includes('brick') || b.tags?.includes('brick')) r.push('anchor_conflict');
  if (a.type === 'bike' || b.type === 'bike') {
    const qb = [a, b].some(
      (s) => s.type === 'bike' && (s.tags?.includes('quality') ?? false),
    );
    if (qb) r.push('anchor_conflict');
  }
  return uniqReasons(r);
}

interface IncompatiblePair {
  day: string;
  a: PlannedSession;
  b: PlannedSession;
}

function collectIncompatibleSessionPairs(
  grid: WeekGrid,
  ctx?: SameDayCompatContext,
): IncompatiblePair[] {
  const pairs: IncompatiblePair[] = [];
  for (const [day, slot] of grid) {
    const sessions = slot.sessions;
    for (let i = 0; i < sessions.length; i++) {
      for (let j = i + 1; j < sessions.length; j++) {
        if (!arePlannedSessionsCompatible(sessions[i], sessions[j], ctx)) {
          pairs.push({ day, a: sessions[i]!, b: sessions[j]! });
        }
      }
    }
  }
  return pairs;
}

// ── Step 4: Global Hard/Easy Enforcement ─────────────────────────────────────
// §4.3 — No two HARD days adjacent, regardless of sport.
// If a HARD session lands next to another HARD day, downgrade the later one's
// intensity to MODERATE and update its tokens.

function enforceHardEasy(grid: WeekGrid, allowConsolidatedHardException: boolean): void {
  for (const day of DAYS_OF_WEEK) {
    const prev = adjDay(day, -1);
    const prevIntensity = dayIntensity(grid.get(prev)!);
    const slot = grid.get(day)!;
    if (prevIntensity === 'HARD' && dayIntensity(slot) === 'HARD') {
      // Performance consolidated hard day (quality_run + lower_body AM/PM) is an
      // intentional exception used by the combined planner when anchored bikes
      // compress quality placement. Preserve the planned run interval structure.
      if (allowConsolidatedHardException && hasConsolidatedQualityRunWithLowerBody(slot)) continue;
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

// ── Same-day matrix (10×10 + race_event) — post placement ---------------------------------
// One source of truth: `_shared/schedule-session-constraints.ts` (used by AL prompts + engine).

interface SameDayValidationResult {
  valid: boolean;
  conflicts: string[];
}

function validateWeekGridSameDayMatrix(
  grid: WeekGrid,
  ctx?: SameDayCompatContext,
): SameDayValidationResult {
  const pairs = collectIncompatibleSessionPairs(grid, ctx);
  return {
    valid: pairs.length === 0,
    conflicts: pairs.map(
      (p) => `${p.day}: "${p.a.name}" [${p.a.type}] + "${p.b.name}" [${p.b.type}]`,
    ),
  };
}

/**
 * Prefer dropping strength on a clashing day (movable) before returning the grid.
 * Exception: quality_run + lower_body_strength on the same day is allowed for
 * performance + co-equal strength athletes (AM/PM consolidated hard day per EXPERIENCE_MODIFIER).
 */
function tryResolveSameDayMatrixConflicts(
  grid: WeekGrid,
  weekNum: number,
  conflictEvents: ConflictEvent[],
  isPerformanceCoequal = false,
  ctx?: SameDayCompatContext,
): string[] {
  const actions: string[] = [];
  for (let pass = 0; pass < 32; pass++) {
    if (validateWeekGridSameDayMatrix(grid, ctx).valid) break;
    let removed = false;
    outer: for (const [day, slot] of grid) {
      const list = slot.sessions;
      for (let i = 0; i < list.length; i++) {
        for (let j = i + 1; j < list.length; j++) {
          if (arePlannedSessionsCompatible(list[i], list[j], ctx)) continue;
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
            const other = list[j]!;
            const [rm] = list.splice(i, 1);
            actions.push(`removed strength on ${day}: ${rm.name}`);
            conflictEvents.push({
              conflict_id: mkConflictId(weekNum, `matrix-drop-${day}-${actions.length}`),
              conflict_type: inferConflictTypeFromPair(rm, other),
              blocked_intent: {
                session_kind: plannedSessionToScheduleSlot(rm),
                preferred_day: conflictDayLo(day),
                intensity_class: rm.intensity_class,
              },
              blocking_reasons: ['no_clean_day'],
              anchors_involved: [],
              applied_resolution: {
                type: 'dropped',
                note: `Removed "${rm.name}" from ${day} to satisfy same-day matrix with "${other.name}".`,
              },
            });
            removed = true;
            break outer;
          }
          if (list[j].type === 'strength') {
            const other = list[i]!;
            const [rm] = list.splice(j, 1);
            actions.push(`removed strength on ${day}: ${rm.name}`);
            conflictEvents.push({
              conflict_id: mkConflictId(weekNum, `matrix-drop-${day}-${actions.length}`),
              conflict_type: inferConflictTypeFromPair(rm, other),
              blocked_intent: {
                session_kind: plannedSessionToScheduleSlot(rm),
                preferred_day: conflictDayLo(day),
                intensity_class: rm.intensity_class,
              },
              blocking_reasons: ['no_clean_day'],
              anchors_involved: [],
              applied_resolution: {
                type: 'dropped',
                note: `Removed "${rm.name}" from ${day} to satisfy same-day matrix with "${other.name}".`,
              },
            });
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
  conflictEvents?: ConflictEvent[],
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
    ...(conflictEvents && conflictEvents.length > 0 ? { conflict_events: conflictEvents } : {}),
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
  const weekInBlock = Math.max(1, weekNum - block.startWeek + 1);
  const prevWeekBlock =
    weekNum >= 2 && options?.phaseBlocks?.length
      ? blockForWeek(options.phaseBlocks, weekNum - 1)
      : null;
  /** First week back after a calendar recovery block or a 3:1 / 2:1 deload week — ease run/bike stress. */
  const returnFromRecoveryDeload =
    !!prevWeekBlock && (prevWeekBlock.phase === 'recovery' || prevWeekBlock.isRecovery);
  /** Any tri race falls in the next plan week — avoid Sunday race-pace long run stacking. */
  const triRaceNextPlanWeek = raceAnchors.some((a) => a.planWeek === weekNum + 1);
  /** Weeks until the nearest upcoming anchored race (0 = race this week). Large post-race or if none ahead. */
  const weeksToRaceDeltas = raceAnchors.map((a) => a.planWeek - weekNum).filter((w) => w >= 0);
  const weeksToRace = weeksToRaceDeltas.length === 0 ? 999 : Math.min(...weeksToRaceDeltas);

  const primaryGoal = goals.find(g => g.id === block.primaryGoalId) ?? goals[0];
  const hasTri = goals.some(g => ['triathlon', 'tri'].includes(g.sport?.toLowerCase()));
  const triApproach = athleteState.tri_approach ?? 'race_peak';
  const servedGoal = 'shared'; // all sessions serve multiple goals in combined plan
  const conflictEvents: ConflictEvent[] = [];

  // ── Conflict-preference helpers ──────────────────────────────────────────
  const conflictPrefs: Record<string, string> = athleteState.conflict_preferences ?? {};
  /** Returns the recorded preference action for this week's conflict slug, or undefined. */
  const getPref = (slug: string): string | undefined => conflictPrefs[mkConflictId(weekNum, slug)];

  // Flags set during conflict detection; consumed at placement sites later.
  let shiftQualityRunToLongRun = false;
  let dropQualityRunThisWeek = false;
  let dropThirdSwimThisWeek = false;

  // Diagnostic: log all day-preference state for every week so we can trace preferred_days flow.
  console.log('[buildWeek] week', weekNum, {
    days_per_week: athleteState.days_per_week,
    rest_days: athleteState.rest_days,
    bikeQualityDay: athleteState.bike_quality_day,
    runQualityDay: athleteState.run_quality_day,
    longRideDay: athleteState.long_ride_day,
    longRunDay: athleteState.long_run_day,
    strengthPreferredDays: athleteState.strength_preferred_days,
    swim_easy_day: athleteState.swim_easy_day,
    swim_quality_day: athleteState.swim_quality_day,
    swim_third_day: athleteState.swim_third_day,
    swim_intent: athleteState.swim_intent,
    transition_mode: athleteState.transition_mode,
    structural_load_hint: athleteState.structural_load_hint,
    triApproach,
    phase: block.phase,
    isRecovery: block.isRecovery,
  });

  // recoveryRebuildWeek1: full post-race only (`structural_load_hint === 'low'`).
  // Suppresses quality sessions, bricks, and strength — easy aerobic swim/bike/run still placed below.
  const recoveryRebuildWeek1 = weekNum === 1 && athleteState.structural_load_hint === 'low';

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

  // Loading-pattern recovery weeks keep the mesocycle phase (build / RS) but must not inherit
  // brick frequency from that phase — otherwise “recovery” weeks become the hardest weekends.
  const bricksThisWeek =
    recoveryRebuildWeek1 || isRecovery ? 0 : BRICKS_PER_WEEK[phase];
  // Race week: no brick stress; all load is the event itself
  const effectiveBricks = raceThisWeek ? 0 : bricksThisWeek;

  // ── Determine run distance and bike hours from TSS budget distribution ──
  const dist = block.sportDistribution;
  const runPct  = dist.run      ?? 0.25;
  const bikePct = dist.bike     ?? 0.45;
  const swimPct = dist.swim     ?? 0.18;
  // strPct reserved for future strength TSS accounting — not yet wired into session sizing.

  const runBudget  = weeklyTSSBudget * runPct;
  const bikeBudget = weeklyTSSBudget * bikePct;
  // Swim TSS budget — used as a soft ceiling on template yards (55 TSS/hr estimate).
  const swimBudget = weeklyTSSBudget * swimPct;

  // Convert TSS budgets to session durations using average intensity
  // Run: mix of easy (~55 TSS/hr) and hard (~85 TSS/hr) → use 65 avg
  const runTotalMin  = Math.max(60, Math.round((runBudget / 65) * 60));
  // Bike: mix of easy + quality → use 62 avg
  const bikeTotalMin = Math.max(60, Math.round((bikeBudget / 62) * 60));
  /** Downscales template `target_yards` when Arc shows limited recent swim exposure. */
  const swimMult = Math.min(1, Math.max(0.35, athleteState.swim_volume_multiplier ?? 1));

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

  if (hasTri && !raceThisWeek && !isRecovery) {
    const longRunFloor = longRunFloorMiles(primaryGoal.distance, phase);
    longRunMiles = Math.max(longRunMiles, longRunFloor);
    longRunMinutes = Math.round(longRunMiles * 9.5);
  }

  if (isRecovery && hasTri && !raceThisWeek) {
    longRunMiles = Math.min(longRunMiles, 8);
    longRunMinutes = Math.round(longRunMiles * 9.5);
  }

  if (returnFromRecoveryDeload && hasTri && !raceThisWeek) {
    longRunMiles = Math.min(longRunMiles, 9);
    longRunMinutes = Math.round(longRunMiles * 9.5);
  }

  // Final week before A-race (taper): cap Sunday long-run miles so volume drops with neurologic freshness.
  if (phase === 'taper' && hasTri && !raceThisWeek) {
    longRunMiles = Math.min(longRunMiles, 5);
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
    const raceBikeDuration = athleteState.projected_bike_hours ?? expectedBikeDurationHours(primaryGoal.distance);
    const capFromBudgetAndRace = Math.min(raceBikeDuration * 1.1, weeklyHours * 0.45);
    const longRideCapHours = Math.max(raceBikeDuration * 0.8, capFromBudgetAndRace);
    longRideHours = Math.min(longRideCapHours, longRideHours);
  }

  if (returnFromRecoveryDeload && hasTri && !raceThisWeek) {
    longRideHours = Math.max(1, Math.round(longRideHours * 0.85 * 4) / 4);
    longRideMinutes = Math.round(longRideHours * 60);
  }

  if (recoveryRebuildWeek1 && !hasTri) {
    // Post-marathon week 1 (run-primary): aggressive leg caps.
    longRunMinutes = Math.min(longRunMinutes, 30);
    longRideMinutes = Math.min(longRideMinutes, 60);
    longRunMiles = Math.max(2, Math.min(longRunMiles, Math.round(longRunMinutes / 10)));
    longRideHours = Math.min(1, Math.max(0.5, longRideMinutes / 60));
  }

  if (recoveryRebuildWeek1 && hasTri && !raceThisWeek) {
    // Post-marathon week 1 (combined tri): softer caps than run-primary — respect leg stress
    // without stripping swim/bike touch frequency.
    longRunMinutes = Math.min(longRunMinutes, 50);
    longRunMiles = Math.max(2, Math.min(longRunMiles, Math.round(longRunMinutes / 9.5)));
    longRideMinutes = Math.min(longRideMinutes, 90);
    longRideHours = Math.max(0.75, Math.round(longRideMinutes / 15) * 0.25);
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

  const preferStandaloneBikeEndurance =
    phase === 'build' &&
    hasTri &&
    !isRecovery &&
    !returnFromRecoveryDeload &&
    weekInBlock % 2 === 1;

  const longRideSlot = grid.get(longRideDay);
  /** True when Saturday (long ride day) schedules a bike+run brick — matches inner `useBrick` predicate. */
  const useBrickThisWeek =
    hasTri &&
    !raceThisWeek &&
    !longRideSlot?.isRest &&
    effectiveBricks >= 1 &&
    phase !== 'base' &&
    !preferStandaloneBikeEndurance;

  if (!longRideSlot?.isRest && hasTri && !raceThisWeek) {
    let rideHoursForSat = longRideHours;
    if (preferStandaloneBikeEndurance) {
      rideHoursForSat = Math.max(rideHoursForSat, Math.min(3.5, athleteState.weekly_hours_available * 0.38));
    }
    const brickPhaseForSession =
      returnFromRecoveryDeload && phase === 'race_specific' ? 'build' : effectiveBrickPhase;
    const useBrick =
      effectiveBricks >= 1 && phase !== 'base' && !preferStandaloneBikeEndurance;
    if (useBrick) {
      const brickRunMi = brickRunTargetMiles(primaryGoal.distance, brickPhaseForSession);
      const [bkBike, bkRun] = brick(longRideDay, rideHoursForSat, brickRunMi, brickPhaseForSession, servedGoal);
      longRideSlot!.sessions.push(bkBike, bkRun);
    } else {
      longRideSlot!.sessions.push(longRide(longRideDay, rideHoursForSat, servedGoal));
    }
  }

  // ── LONG RUN ──────────────────────────────────────────────────────────────
  const longRunSlot = grid.get(longRunDay);
  // Avoid placing long run on same day as brick
  const longRunActualDay = longRunSlot?.sessions.length
    ? adjDay(longRunDay, -1)  // shift to Friday if Saturday has brick
    : longRunDay;
  const lrSlot = grid.get(longRunActualDay);
  /** Hard Sunday long-run block (structured race-pace segment) — off in recovery, loading-pattern deload, week before any tri race, or final 3 weeks before A-race (Z2 long only; triRaceNextPlanWeek-style gate). */
  const useStructuredRacePaceLong =
    phase === 'race_specific' &&
    !isRecovery &&
    !triRaceNextPlanWeek &&
    weeksToRace > 3;
  /** When RS calendar phase but we want Z2 aerobic copy only (deload / pre-race week / recovery). */
  const longRunSessionPhase: Phase =
    phase === 'race_specific' && !useStructuredRacePaceLong ? 'build' : phase;
  if (!lrSlot?.isRest && !raceThisWeek) {
    if (useStructuredRacePaceLong) {
      const mpMiles = Math.max(4, Math.round(longRunMiles * 0.60));
      lrSlot!.sessions.push(
        hasTri
          ? racePaceRun(longRunActualDay, mpMiles, primaryGoal.distance as TriRaceDistance, servedGoal)
          : marathonPaceRun(longRunActualDay, mpMiles, servedGoal),
      );
    } else {
      lrSlot!.sessions.push(
        longRun(longRunActualDay, longRunMiles, longRunSessionPhase, servedGoal, hasTri ? primaryGoal.distance : null),
      );
    }
  }

  /** Brick-tagged days already on the grid (used for quality-run / swim blocking). */
  const brickDaysSetForQr = new Set(
    [...grid.values()]
      .filter((s) => s.sessions.some((w) => w.tags?.includes('brick')))
      .map((s) => s.day),
  );

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
  const swimQualityBeforeLongAnchor = swimQualityDay;
  if (qualitySwimBlocked.has(swimQualityDay)) {
    for (let step = 1; step <= 6; step++) {
      const cand = adjDay(swimQualityDay, step);
      if (!qualitySwimBlocked.has(cand)) {
        swimQualityDay = cand;
        break;
      }
    }
  }
  if (swimQualityDay !== swimQualityBeforeLongAnchor) {
    const swLongPref = getPref('swim-quality-long-anchor');
    if (!PREF_ACCEPT_ACTIONS.has(swLongPref ?? '') && !PREF_DROP_ACTIONS.has(swLongPref ?? '')) {
      const reasons: WeekStateReason[] = uniqReasons([
        'anchor_conflict',
        ...(isRecovery ? (['recovery_week'] as const) : []),
      ]);
      const swimAnchorHits: string[] = [];
      if (longRideDay === swimQualityBeforeLongAnchor) swimAnchorHits.push(longRideDay);
      if (longRunActualDay === swimQualityBeforeLongAnchor) swimAnchorHits.push(longRunActualDay);
      if (restDayNames.has(swimQualityBeforeLongAnchor)) swimAnchorHits.push('Rest day');
      conflictEvents.push({
        conflict_id: mkConflictId(weekNum, 'swim-quality-long-anchor'),
        conflict_type: 'quality_swim_blocked',
        blocked_intent: { session_kind: 'quality_swim', preferred_day: conflictDayLo(swimQualityBeforeLongAnchor) },
        blocking_reasons: reasons,
        anchors_involved: swimAnchorHits,
        applied_resolution: {
          type: 'moved',
          to_day: conflictDayLo(swimQualityDay),
          note: `Quality swim moved from ${swimQualityBeforeLongAnchor} to ${swimQualityDay} (long ride / long run / rest anchors).`,
        },
      });
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

  /** Same gate as `SameDayCompatContext.allowQualityRunQualitySwimSameDay` — keep in sync. */
  const allowQualityRunSwimSameDay =
    String(athleteState.training_intent ?? '').toLowerCase() === 'performance' ||
    String(athleteState.strength_intent ?? '').toLowerCase() === 'performance';

  // Completion / support: never place quality swim on the same calendar day as quality run
  // unless performance escape hatch — matrix would reject and tryResolve cannot relocate swim/run.
  const swimQualityBeforeRunSwimMatrix = swimQualityDay;
  if (!allowQualityRunSwimSameDay && swimQualityDay === runQualityDay) {
    const swimBumpBlocked = new Set<string>([...qualitySwimBlocked, runQualityDay, swimEasyDay]);
    const startIdx = Math.max(0, DAYS_OF_WEEK.indexOf(swimQualityDay));
    for (let s = 0; s < 7; s++) {
      const d = DAYS_OF_WEEK[(startIdx + s) % 7]!;
      if (!swimBumpBlocked.has(d) && d !== runQualityDay) {
        swimQualityDay = d;
        break;
      }
    }
  }
  if (swimQualityDay !== swimQualityBeforeRunSwimMatrix) {
    const swRunMatrixPref = getPref('swim-quality-run-matrix');
    if (!PREF_ACCEPT_ACTIONS.has(swRunMatrixPref ?? '') && !PREF_DROP_ACTIONS.has(swRunMatrixPref ?? '')) {
      conflictEvents.push({
        conflict_id: mkConflictId(weekNum, 'swim-quality-run-matrix'),
        conflict_type: 'quality_swim_blocked',
        blocked_intent: {
          session_kind: 'quality_swim',
          preferred_day: conflictDayLo(swimQualityBeforeRunSwimMatrix),
        },
        blocking_reasons: uniqReasons(['consecutive_cross_discipline', 'anchor_conflict']),
        anchors_involved: [runQualityDay],
        applied_resolution: {
          type: 'moved',
          to_day: conflictDayLo(swimQualityDay),
          note: `Quality swim moved off ${swimQualityBeforeRunSwimMatrix} so quality run can stay on ${runQualityDay} (completion/support matrix).`,
        },
      });
    }
  }

  // Third swim (`preferred_days.swim[2]` → swim_third_day): only when swim_intent === 'focus'.
  const swimIntentFocus = String(athleteState.swim_intent ?? '').toLowerCase() === 'focus';
  let swimThirdDay: string | null = null;
  if (swimIntentFocus && hasTri) {
    const thirdHardBlocked = new Set<string>([
      longRideDay,
      longRunActualDay,
      ...restDayNames,
      swimEasyDay,
      swimQualityDay,
    ]);
    let swimThirdPreferred: string | null = null;
    const resolveSwimThirdDay = (): string | null => {
      const bumpFrom = (dayName: string): string | null => {
        if (!thirdHardBlocked.has(dayName)) return dayName;
        const startIdx = Math.max(0, DAYS_OF_WEEK.indexOf(dayName));
        for (let step = 1; step <= 6; step++) {
          const cand = DAYS_OF_WEEK[(startIdx + step) % 7]!;
          if (!thirdHardBlocked.has(cand)) return cand;
        }
        return null;
      };
      if (athleteState.swim_third_day != null) {
        const idx = (athleteState.swim_third_day + 6) % 7;
        const preferred = DAYS_OF_WEEK[idx];
        if (preferred) {
          swimThirdPreferred = preferred;
          const resolved = bumpFrom(preferred);
          if (resolved) return resolved;
        }
      }
      swimThirdPreferred = swimThirdPreferred ?? 'Wednesday';
      const startIdx = DAYS_OF_WEEK.indexOf('Wednesday');
      for (let s = 0; s < 7; s++) {
        const d = DAYS_OF_WEEK[(startIdx + s) % 7]!;
        if (!thirdHardBlocked.has(d)) return d;
      }
      return null;
    };
    swimThirdDay = resolveSwimThirdDay();
    if (swimThirdPreferred && swimThirdDay && swimThirdDay !== swimThirdPreferred) {
      const thirdSwimPref = getPref('third-swim');
      if (PREF_DROP_ACTIONS.has(thirdSwimPref ?? '')) {
        dropThirdSwimThisWeek = true;
        swimThirdDay = null;
      } else if (!PREF_ACCEPT_ACTIONS.has(thirdSwimPref ?? '')) {
        conflictEvents.push({
          conflict_id: mkConflictId(weekNum, 'third-swim'),
          conflict_type: 'third_swim_blocked',
          blocked_intent: { session_kind: 'third_swim', preferred_day: conflictDayLo(swimThirdPreferred) },
          blocking_reasons: uniqReasons(['anchor_conflict', 'no_clean_day']),
          anchors_involved: [swimThirdPreferred],
          applied_resolution: {
            type: 'moved',
            to_day: conflictDayLo(swimThirdDay),
            note: `Third swim moved from ${swimThirdPreferred} to ${swimThirdDay} (swim / long-day / rest spacing).`,
          },
        });
      }
    }
  }

  const swimDistance = normalizeSwimProgramDistance(primaryGoal.distance);
  const swimSingleRecovery = hasTri && (isRecovery || recoveryRebuildWeek1);
  let swimTemplates: SwimSlotTemplate[] = !hasTri
    ? []
    : swimSingleRecovery
      ? [getRecoverySwimTemplate()]
      : getSwimSlotTemplates(athleteState.swim_intent ?? 'race', phase, swimDistance, weekInBlock);
  if (hasTri && swimPct === 0 && !swimSingleRecovery && swimTemplates.length > 0) {
    swimTemplates = swimTemplates.map((t) => ({
      session_type: 'easy',
      drill_emphasis: false,
      target_yards: Math.max(800, Math.round(t.target_yards * 0.35)),
      notes: 'Maintenance aerobic swim — run-primary emphasis, swim kept short.',
    }));
  }
  // Apply swimMult then enforce swimBudget as a soft ceiling across all slots.
  // 55 TSS/hr ÷ (1 yd/min ≈ 60 yd/hr at easy pace) → ~0.917 TSS/100yd, but we
  // model it in time: swimBudget (TSS) → minutes at 55 TSS/hr → yards at 30 yd/min.
  // Soft ceiling: if total raw yards exceed budget-implied yards, scale all slots
  // down proportionally. Minimums (easyLike 800 yd, quality 1000 yd) are still applied.
  const SWIM_TSS_PER_HR = 55;
  const SWIM_YDS_PER_MIN = 30; // ~1650 yd/hr, mid-range for tri training
  const swimBudgetMinutes = (swimBudget / SWIM_TSS_PER_HR) * 60;
  const swimBudgetYards   = swimBudgetMinutes * SWIM_YDS_PER_MIN;

  const rawSlotYards = swimTemplates.map((t) => Math.round(t.target_yards * swimMult));
  const totalRawYards = rawSlotYards.reduce((s, y) => s + y, 0);
  const budgetScale = totalRawYards > 0 && totalRawYards > swimBudgetYards
    ? swimBudgetYards / totalRawYards
    : 1;

  const scaledTemplateYards = (t: SwimSlotTemplate, slotIdx: number): number => {
    const budgetCapped = rawSlotYards[slotIdx]! * budgetScale;
    const easyLike = t.session_type === 'easy' || t.session_type === 'technique_aerobic';
    return Math.max(easyLike ? 800 : 1000, Math.round(budgetCapped));
  };

  // ── Bike quality + easy (defaults Tue / Wed; from Arc `preferred_days.quality_bike` / `easy_bike`) ──
  const bikeQualIdxBase =
    athleteState.bike_quality_day != null
      ? (athleteState.bike_quality_day + 6) % 7
      : DAYS_OF_WEEK.indexOf('Tuesday');
  let bikeQualityDay = DAYS_OF_WEEK[bikeQualIdxBase] ?? 'Tuesday';
  const bikeQualityPreferredDay = bikeQualityDay;
  const bikeEasyIdxBase =
    athleteState.bike_easy_day != null
      ? (athleteState.bike_easy_day + 6) % 7
      : DAYS_OF_WEEK.indexOf('Wednesday');
  let bikeEasyDay = DAYS_OF_WEEK[bikeEasyIdxBase] ?? 'Wednesday';

  // If quality-bike day is explicitly pinned but easy-bike day is not, bias easy bike
  // to the day before quality (e.g. Wed quality → Tue easy) to preserve the expected
  // tri rhythm and avoid drifting to Thu when defaults collide.
  if (athleteState.bike_quality_day != null && athleteState.bike_easy_day == null) {
    bikeEasyDay = adjDay(bikeQualityDay, -1);
  }

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
  if (bikeQualityDay !== bikeQualityPreferredDay) {
    const bikeAnchorPref = getPref('bike-quality-anchor');
    if (!PREF_ACCEPT_ACTIONS.has(bikeAnchorPref ?? '') && !PREF_DROP_ACTIONS.has(bikeAnchorPref ?? '')) {
      const bikeAnchorHits: string[] = [];
      if (longRideDay === bikeQualityPreferredDay) bikeAnchorHits.push(longRideDay);
      if (longRunActualDay === bikeQualityPreferredDay) bikeAnchorHits.push(longRunActualDay);
      if (restDayNames.has(bikeQualityPreferredDay)) bikeAnchorHits.push('Rest day');
      conflictEvents.push({
        conflict_id: mkConflictId(weekNum, 'bike-quality-anchor'),
        conflict_type: 'quality_bike_blocked',
        blocked_intent: { session_kind: 'quality_bike', preferred_day: conflictDayLo(bikeQualityPreferredDay) },
        blocking_reasons: uniqReasons(['anchor_conflict', ...(isRecovery ? (['recovery_week'] as const) : [])]),
        anchors_involved: bikeAnchorHits.length > 0 ? bikeAnchorHits : [longRideDay, longRunActualDay],
        applied_resolution: {
          type: 'moved',
          to_day: conflictDayLo(bikeQualityDay),
          note: `Quality bike moved from ${bikeQualityPreferredDay} to ${bikeQualityDay} (long ride / long run / rest collision).`,
        },
      });
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

  // ── Quality run vs next-day quality bike (sequential HARD geometry) ───────
  // Mirrors `_shared/week-optimizer.ts`: avoid placing HARD quality_run on the calendar
  // day immediately after anchored quality_bike (cross-discipline back-to-back HARD).
  if (
    hasTri &&
    !raceThisWeek &&
    !isRecovery &&
    !recoveryRebuildWeek1 &&
    !recoveryRebuildWeek2EasyRunOnly &&
    phase !== 'taper'
  ) {
    const preferredRunQ = runQualityDay;
    const dayAfterBike = adjDay(bikeQualityDay, 1);
    if (preferredRunQ === dayAfterBike) {
      const qrPref = getPref('quality-run-after-bike');

      if (PREF_KEEP_QUALITY_RUN_ACTIONS.has(qrPref ?? '')) {
        // Athlete accepted the back-to-back — keep preferred day as-is, no conflict emitted.

      } else if (qrPref === 'shift_quality_to_long_run') {
        // Drop mid-week quality run; long run will carry race-pace quality work.
        shiftQualityRunToLongRun = true;

      } else if (PREF_DROP_ACTIONS.has(qrPref ?? '')) {
        dropQualityRunThisWeek = true;

      } else {
        // Default path (no preference or a silent-accept preference):
        // compute the best alternate day, optionally bump, optionally emit.
        const blockedQr = new Set<string>([
          longRideDay,
          longRunActualDay,
          ...restDayNames,
          ...brickDaysSetForQr,
          bikeQualityDay,
          adjDay(bikeQualityDay, -1),
          adjDay(bikeQualityDay, 1),
        ]);
        if (!allowQualityRunSwimSameDay) blockedQr.add(swimQualityDay);

        const prio: string[] = [];
        prio.push(adjDay(bikeQualityDay, 2));
        prio.push(adjDay(bikeQualityDay, -1));
        for (const d of DAYS_OF_WEEK) {
          if (!prio.includes(d)) prio.push(d);
        }

        const anchorLabel = (athleteState.bike_quality_label ?? '').trim() || 'Group ride';
        let movedTo: string | null = null;
        for (const cand of prio) {
          if (blockedQr.has(cand)) continue;
          if (adjDay(bikeQualityDay, 1) === cand) continue;
          movedTo = cand;
          break;
        }

        // Silent-accept: engine's chosen day is accepted; no conflict event.
        const silentAccept = PREF_ACCEPT_ACTIONS.has(qrPref ?? '');

        if (movedTo != null && movedTo !== preferredRunQ) {
          runQualityDay = movedTo;
          if (!silentAccept) {
            conflictEvents.push({
              conflict_id: mkConflictId(weekNum, 'quality-run-after-bike'),
              conflict_type: 'quality_run_blocked',
              blocked_intent: {
                session_kind: 'quality_run',
                preferred_day: conflictDayLo(preferredRunQ),
                intensity_class: 'HARD',
              },
              blocking_reasons: uniqReasons(['anchor_conflict', 'consecutive_cross_discipline']),
              anchors_involved: [anchorLabel],
              applied_resolution: {
                type: 'moved',
                to_day: conflictDayLo(movedTo),
                note: `Moved quality run off ${preferredRunQ} to avoid HARD the day after ${bikeQualityDay} (${anchorLabel}).`,
              },
            });
          }
        } else if (movedTo == null && !silentAccept) {
          conflictEvents.push({
            conflict_id: mkConflictId(weekNum, 'quality-run-after-bike'),
            conflict_type: 'quality_run_blocked',
            blocked_intent: {
              session_kind: 'quality_run',
              preferred_day: conflictDayLo(preferredRunQ),
              intensity_class: 'HARD',
            },
            blocking_reasons: uniqReasons(['anchor_conflict', 'consecutive_cross_discipline', 'no_clean_day']),
            anchors_involved: [anchorLabel],
            applied_resolution: {
              type: 'none',
              note:
                'Quality run stayed adjacent to anchored quality bike; no cleaner weekday in this scan (hard/easy pass may still moderate intensity).',
            },
          });
        }
      }
    }
  }

  const bikeQualitySlot = grid.get(bikeQualityDay);
  if (!bikeQualitySlot?.isRest && hasTri) {
    if (recoveryRebuildWeek1) {
      const recBikeHr = Math.max(0.75, Math.min(1.0, bikeTotalMin * 0.15 / 55));
      bikeQualitySlot!.sessions.push(easyBike(bikeQualityDay, recBikeHr, servedGoal));
    } else if (isRecovery) {
      const recBikeHr = Math.max(0.75, Math.min(1.0, bikeTotalMin * 0.20 / 55));
      bikeQualitySlot!.sessions.push(easyBike(bikeQualityDay, recBikeHr, servedGoal));
    } else {
      const bq = bikeQualityDay;
      if (phase === 'taper') {
        bikeQualitySlot!.sessions.push(bikeOpeners(bq, servedGoal));
      } else {
        const label = athleteState.bike_quality_label;
        // Anchor-driven override: when quality-bike day is a recurring group ride,
        // describe it honestly as a group ride (no structured interval prescription).
        if (label) {
          const groupRideHours = resolveGroupRideHours(phase, athleteState);
          bikeQualitySlot!.sessions.push(
            groupRideSession(bq, groupRideHours, phase, servedGoal, label),
          );
        } else {
          bikeQualitySlot!.sessions.push(groupRideQualityBikeSession(bq, phase, servedGoal));
        }
      }
    }
  }

  // ── Run quality (default Wednesday; from Arc `preferred_days.quality_run`) ──
  const runQualitySlot = grid.get(runQualityDay);
  if (shiftQualityRunToLongRun) {
    // Athlete chose to let the long run carry race-pace quality work instead of a mid-week session.
    // Upgrade the already-placed long run to a race-pace variant (if it is not already one).
    const lrSlotForQuality = grid.get(longRunActualDay);
    if (lrSlotForQuality && !raceThisWeek) {
      const lrRunIdx = lrSlotForQuality.sessions.findIndex((s) => s.type === 'run');
      const lrUseStructuredRacePace =
        phase === 'race_specific' && !isRecovery && !triRaceNextPlanWeek && weeksToRace > 3;
      if (lrRunIdx >= 0 && !lrUseStructuredRacePace) {
        const rpMiles = Math.max(4, Math.round(longRunMiles * 0.65));
        lrSlotForQuality.sessions[lrRunIdx] = hasTri
          ? racePaceRun(longRunActualDay, rpMiles, primaryGoal.distance as TriRaceDistance, servedGoal)
          : marathonPaceRun(longRunActualDay, rpMiles, servedGoal);
      }
    }
    // Quality run slot left empty — no mid-week session placed.
  } else if (!dropQualityRunThisWeek && !runQualitySlot?.isRest) {
    if (recoveryRebuildWeek1) {
      const easyMi = Math.max(3, Math.round(longRunMiles * 0.25));
      runQualitySlot!.sessions.push(easyRun(runQualityDay, easyMi, servedGoal));
    } else if (isRecovery) {
      const recEasyMi = Math.max(3, Math.round(longRunMiles * 0.40));
      runQualitySlot!.sessions.push(easyRun(runQualityDay, recEasyMi, servedGoal));
    } else {
      if (recoveryRebuildWeek2EasyRunOnly) {
        const easyMi = Math.max(4, Math.round(longRunMiles * 0.35));
        runQualitySlot!.sessions.push(easyRun(runQualityDay, easyMi, servedGoal));
      } else if (phase === 'taper') {
        const taperRunMi = Math.max(4, Math.round(longRunMiles * 0.40));
        runQualitySlot!.sessions.push(easyRun(runQualityDay, taperRunMi, servedGoal));
      } else if (hasTri && weeksToRace <= 3 && useBrickThisWeek) {
        // Late-race brick week: brick carries race-sim; mid-week run = threshold maintenance only.
        const tempoMi = Math.max(3, Math.round(longRunMiles * 0.30));
        runQualitySlot!.sessions.push(tempoRun(runQualityDay, tempoMi, 1.5, servedGoal));
      } else if (triApproach === 'base_first') {
        // base_first: Base uses controlled interval progression; Build uses tempo;
        // Race-specific uses race-pace specificity.
        if (phase === 'race_specific') {
          const rpMiles = Math.max(3, Math.round(longRunMiles * 0.35));
          runQualitySlot!.sessions.push(
            hasTri
              ? racePaceRun(runQualityDay, rpMiles, primaryGoal.distance, servedGoal)
              : marathonPaceRun(runQualityDay, rpMiles, servedGoal),
          );
        } else if (phase === 'base') {
          const progressedBaseReps = Math.min(8, 4 + Math.floor((weekInBlock - 1) / 2));
          runQualitySlot!.sessions.push(intervalRun(runQualityDay, progressedBaseReps, phase, servedGoal));
        } else {
          // Build: tempo (Z3) — builds muscular endurance safely
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
          const progressedBaseReps = Math.min(8, 4 + Math.floor((weekInBlock - 1) / 2));
          runQualitySlot!.sessions.push(intervalRun(runQualityDay, progressedBaseReps, phase, servedGoal));
        }
      }
    }
  } // end else if (!dropQualityRunThisWeek && !runQualitySlot?.isRest)

  // ── Tri swims (program templates × swim_volume_multiplier) ────────────────
  let qualitySwimPlaced = false;
  const qualitySwimSlot = grid.get(swimQualityDay);
  if (hasTri && swimTemplates.length > 0) {
    const t0 = swimTemplates[0]!;
    const y0 = scaledTemplateYards(t0, 0);
    if (!qualitySwimSlot?.isRest && qualitySwimSlot!.sessions.length < 2) {
      qualitySwimSlot!.sessions.push(
        swimSessionFromTemplate(t0, y0, swimQualityDay, weekNum, phase, servedGoal, 0),
      );
      qualitySwimPlaced = true;
    } else {
      const fallSlot = grid.get(swimEasyDay);
      if (!fallSlot?.isRest) {
        fallSlot!.sessions.push(
          swimSessionFromTemplate(t0, y0, swimEasyDay, weekNum, phase, servedGoal, 4),
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

  // ── Second swim slot (easy / technique / race-specific aerobic from template) ─
  const easySwimSlot = grid.get(swimEasyDay);
  if (!easySwimSlot?.isRest && hasTri && swimTemplates.length >= 2) {
    const t1 = swimTemplates[1]!;
    const y1 = scaledTemplateYards(t1, 1);
    if ((swimEasyDay !== swimQualityDay || !qualitySwimPlaced) && easySwimSlot!.sessions.length < 2) {
      const useOpenWater =
        t1.session_type === 'easy' &&
        hasTri &&
        !isRecovery &&
        !recoveryRebuildWeek1 &&
        (phase === 'race_specific' || (phase === 'taper' && !raceThisWeek)) &&
        weekInBlock % 2 === 0;
      const owMin = Math.max(32, Math.min(50, Math.round(y1 / 42)));
      easySwimSlot!.sessions.push(
        useOpenWater
          ? openWaterPracticeSwim(swimEasyDay, owMin, servedGoal)
          : swimSessionFromTemplate(t1, y1, swimEasyDay, weekNum, phase, servedGoal, 4),
      );
    }
  }

  // ── Third swim (focus program template slot 2) ─────────────────────────────
  if (swimThirdDay && hasTri && !recoveryRebuildWeek1 && swimTemplates.length >= 3) {
    const thirdSwimSlot = grid.get(swimThirdDay);
    if (!thirdSwimSlot?.isRest && thirdSwimSlot!.sessions.length < 2) {
      const t2 = swimTemplates[2]!;
      const y2 = scaledTemplateYards(t2, 2);
      thirdSwimSlot!.sessions.push(
        swimSessionFromTemplate(t2, y2, swimThirdDay, weekNum, phase, servedGoal, 5),
      );
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
  //   base: 2× (upper + lower template slots)
  //   build / race_specific: 1× default (concurrent training cap); 2× when
  //     strength_intent === 'performance' (co-equal tri / heavy barbell track)
  //   taper / recovery: 1×
  // recoveryRebuildWeek1 (post-marathon week 1) suppresses strength entirely — handled below.
  const performanceStrength =
    String(athleteState.strength_intent ?? '').trim().toLowerCase() === 'performance';
  let strFreq: number;
  if (phase === 'base') {
    strFreq = 2;
  } else if (phase === 'build' || phase === 'race_specific') {
    strFreq = performanceStrength ? 2 : 1;
  } else {
    strFreq = 1;
  }
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
    const brickDaysSet = new Set(brickDaysInGrid);

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
      if (strSlot && strSlot.sessions.length < 2) {
        const equipmentType = athleteState.equipment_type ?? 'commercial_gym';
        const hasCable = athleteState.has_cable_machine ?? (equipmentType === 'commercial_gym' && !athleteState.equipment_type?.includes('home'));
        const hasGhd = athleteState.has_ghd ?? false;
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
            hasCable,
            hasGhd,
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

    // Slot 2: second non-blocked day when strFreq is 2 (base, or build/RS + performance intent)
    if (strFreq >= 2 && strDay) {
      const weekdayOrder = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'] as const;
      // Performance/co-equal strength: lower body pairs AM/PM with quality_run (Thursday).
      // Support strength: avoid quality_run day to prevent stacking two high-demand sessions.
      const allowLowerOnQualityRunDay = athleteState.strength_intent === 'performance';
      const baseLowerDay = (d: string) =>
        !blocked.has(d) && d !== strDay && (!hasTri || allowLowerOnQualityRunDay || d !== runQualityDay);
      const passesHeavyLowerGuard = (d: string) =>
        !heavyLowerBlockedWithin48hOfLongRunOrBrick(d, longRunActualDay, brickDaysSet);

      let pool2 = weekdayOrder.filter((d) => baseLowerDay(d) && passesHeavyLowerGuard(d));
      if (prefSet.size > 0) {
        const preferred2 = pool2.filter((d) => prefSet.has(d));
        if (preferred2.length > 0) pool2 = preferred2;
      }
      let lowerPrefBypassUsed = false;
      if (pool2.length === 0) {
        pool2 = weekdayOrder.filter((d) => baseLowerDay(d) && passesHeavyLowerGuard(d));
        if (pool2.length > 0) {
          lowerPrefBypassUsed = prefSet.size > 0;
          console.warn(
            '[week-builder] lower-body strength: no preferred weekday satisfies 48h vs long run/brick; using next available.',
          );
        }
      }
      let lower48hGuardDropped = false;
      if (pool2.length === 0) {
        pool2 = weekdayOrder.filter((d) => baseLowerDay(d));
        if (prefSet.size > 0) {
          const preferredRelaxed = pool2.filter((d) => prefSet.has(d));
          if (preferredRelaxed.length > 0) pool2 = preferredRelaxed;
        }
        if (pool2.length > 0) {
          lower48hGuardDropped = true;
          console.warn(
            '[week-builder] lower-body strength: 48h vs long run/brick not satisfiable Mon–Fri with current anchors; placed without guard.',
          );
        }
      }
      const strDay2 = pool2[0];
      if (strDay2 && hasTri && (lowerPrefBypassUsed || lower48hGuardDropped)) {
        const heavyLowerPref = getPref(`heavy-lower-${strDay2}`);
        if (!PREF_ACCEPT_ACTIONS.has(heavyLowerPref ?? '') && !PREF_DROP_ACTIONS.has(heavyLowerPref ?? '')) {
          const reasons: WeekStateReason[] = [];
          if (lowerPrefBypassUsed) reasons.push('anchor_conflict');
          if (lower48hGuardDropped) {
            reasons.push('pre_long_run_48h', 'pre_brick_48h', 'no_clean_day');
          }
          conflictEvents.push({
            conflict_id: mkConflictId(weekNum, `heavy-lower-${strDay2}`),
            conflict_type: 'heavy_lower_blocked',
            blocked_intent: { session_kind: 'lower_body_strength', intensity_class: 'HARD' },
            blocking_reasons: uniqReasons(reasons),
            anchors_involved: [...brickDaysInGrid, longRunActualDay],
            applied_resolution: {
              type: 'moved',
              to_day: conflictDayLo(strDay2),
              note: lower48hGuardDropped
                ? `Lower-body strength placed on ${strDay2} without the 48h long-run/brick clearance row (Mon–Fri density).`
                : `Lower-body strength on ${strDay2} — preferred strength days skipped while keeping the 48h guard.`,
            },
          });
        }
      }
      if (strDay2) {
        const strSlot2 = grid.get(strDay2);
        if (strSlot2 && strSlot2.sessions.length < 2) {
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
              hasCable,
              hasGhd,
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
  if (hasTri && !raceThisWeek) {
    const midRideSlot = grid.get(bikeEasyDay);
    if (midRideSlot && !midRideSlot.isRest) {
      const slotFree = midRideSlot.sessions.length < 2;
      if ((recoveryRebuildWeek1 || isRecovery) && slotFree) {
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
  // Consolidated hard day (quality run + lower body same day) removed — splits stress across days
  // and reduces injury risk (hard intervals + heavy lower-body same PM is a poor default).
  const allowConsolidatedHardException = false;
  enforceHardEasy(grid, allowConsolidatedHardException);

  // ── Step 5: 80/20 compliance ──────────────────────────────────────────────
  const week8020TradeOffs = enforce8020(grid, phase);

  const qrLbTradeOffStrings = collectQualityRunLowerBodyTradeOffs(gridSessions(grid));

  // Same-day product matrix: validate what we ship; attempt strength-only auto-fix; always log if still bad.
  // Performance + co-equal strength athletes may combine quality_run AM + lower_body PM (EXPERIENCE_MODIFIER).
  // strength_intent === 'performance' is the co-equal flag (see AthleteState type + EXPERIENCE_MODIFIER_TEXT).
  const isPerformanceCoequal = performanceStrength;
  const sameDayCompatCtx: SameDayCompatContext = {
    allowQualityRunQualitySwimSameDay: allowQualityRunSwimSameDay,
  };
  const sameDayPre = validateWeekGridSameDayMatrix(grid, sameDayCompatCtx);
  if (!sameDayPre.valid) {
    console.warn('[week-builder] same-day schedule conflicts detected:', sameDayPre.conflicts);
    let matrixPreSeq = 0;
    for (const p of collectIncompatibleSessionPairs(grid, sameDayCompatCtx)) {
      matrixPreSeq++;
      conflictEvents.push({
        conflict_id: mkConflictId(weekNum, `matrix-pre-${matrixPreSeq}`),
        conflict_type: inferConflictTypeFromPair(p.a, p.b),
        blocked_intent: {
          session_kind: plannedSessionToScheduleSlot(p.a),
          preferred_day: conflictDayLo(p.day),
          intensity_class: p.a.intensity_class,
        },
        blocking_reasons: blockingReasonsForMatrixPair(p.a, p.b),
        anchors_involved: [],
        applied_resolution: {
          type: 'none',
          note: `Same-day matrix clash on ${p.day}: "${p.a.name}" vs "${p.b.name}".`,
        },
      });
    }
    const res = tryResolveSameDayMatrixConflicts(
      grid,
      weekNum,
      conflictEvents,
      isPerformanceCoequal,
      sameDayCompatCtx,
    );
    if (res.length > 0) {
      console.warn('[week-builder] same-day auto-resolution (strength removal):', res);
    }
    const sameDayPost = validateWeekGridSameDayMatrix(grid, sameDayCompatCtx);
    if (!sameDayPost.valid) {
      console.warn('[week-builder] same-day schedule conflicts after resolution:', sameDayPost.conflicts);
      let matrixPostSeq = 0;
      for (const p of collectIncompatibleSessionPairs(grid, sameDayCompatCtx)) {
        matrixPostSeq++;
        conflictEvents.push({
          conflict_id: mkConflictId(weekNum, `matrix-post-${matrixPostSeq}`),
          conflict_type: inferConflictTypeFromPair(p.a, p.b),
          blocked_intent: {
            session_kind: plannedSessionToScheduleSlot(p.a),
            preferred_day: conflictDayLo(p.day),
            intensity_class: p.a.intensity_class,
          },
          blocking_reasons: blockingReasonsForMatrixPair(p.a, p.b),
          anchors_involved: [],
          applied_resolution: {
            type: 'none',
            note: `Same-day matrix still clashes on ${p.day} after strength auto-removal: "${p.a.name}" vs "${p.b.name}".`,
          },
        });
      }
    }
  }

  // ── Steps 6 & 7: TSS + ramp rate validation handled in validator.ts ───────

  const allSessions = gridSessions(grid);
  const mergedTradeOffs = [
    ...week8020TradeOffs,
    ...qrLbTradeOffStrings,
  ];
  return computeWeekMetrics(allSessions, weekNum, phase, isRecovery, mergedTradeOffs, conflictEvents);
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

function resolveGroupRideHours(
  _phase: Phase,
  athleteState: AthleteState,
): number {
  const routeEstimatedHours =
    typeof athleteState.bike_quality_route_estimated_hours === 'number'
      ? athleteState.bike_quality_route_estimated_hours
      : null;
  if (routeEstimatedHours && Number.isFinite(routeEstimatedHours) && routeEstimatedHours > 0) {
    return Math.max(1.0, Math.min(4.0, routeEstimatedHours));
  }
  const routeEstimatedMinutes =
    typeof athleteState.bike_quality_route_estimated_minutes === 'number'
      ? athleteState.bike_quality_route_estimated_minutes
      : null;
  if (routeEstimatedMinutes && Number.isFinite(routeEstimatedMinutes) && routeEstimatedMinutes > 0) {
    return Math.max(1.0, Math.min(4.0, routeEstimatedMinutes / 60));
  }
  const explicitHours =
    typeof athleteState.bike_quality_group_ride_hours === 'number'
      ? athleteState.bike_quality_group_ride_hours
      : null;
  if (explicitHours && Number.isFinite(explicitHours) && explicitHours > 0) {
    return Math.max(1.5, Math.min(4.0, explicitHours));
  }
  const explicitMinutes =
    typeof athleteState.bike_quality_group_ride_minutes === 'number'
      ? athleteState.bike_quality_group_ride_minutes
      : null;
  if (explicitMinutes && Number.isFinite(explicitMinutes) && explicitMinutes > 0) {
    return Math.max(1.5, Math.min(4.0, explicitMinutes / 60));
  }
  // Defaults for anchored hard group rides when no route estimate is available.
  return 1.5;
}

/**
 * Assessment week sessions — three 45-minute discipline time trials placed on
 * Monday (swim CSS test), Wednesday (bike FTP test), and Friday (run 12-min TT).
 *
 * These are returned as `PlannedSession` objects with `steps_preset: []`.
 * materialize-plan skips token expansion on empty presets and renders the
 * session as instructions-only (the description text is the full protocol).
 *
 * Called when `athleteState.assessment_week_preference === 'assessment_first'`.
 * The caller shifts all existing plan weeks +1 and inserts these as week 1.
 */
export function buildAssessmentWeekSessions(
  disciplines: ('swim' | 'bike' | 'run')[] = ['swim', 'bike', 'run'],
): PlannedSession[] {
  const hasSw = disciplines.includes('swim');
  const hasBk = disciplines.includes('bike');
  const hasRn = disciplines.includes('run');
  const isRunOnly = hasRn && !hasSw && !hasBk;

  // Day assignments:
  //   Full tri (swim+bike+run): Mon / Wed / Fri
  //   Two disciplines:          Mon / Wed
  //   Run only:                 Wednesday (midweek; don't leave a lonely Friday)
  const swimDay = 'Monday';
  const bikeDay = hasSw ? 'Wednesday' : 'Monday';
  const runDay  = (hasSw || hasBk) ? (hasSw && hasBk ? 'Friday' : 'Wednesday') : 'Wednesday';

  const sessions: PlannedSession[] = [];

  if (hasSw) {
    sessions.push({
      day: swimDay,
      type: 'swim',
      name: 'Swim Baseline — CSS Test',
      description:
        'Critical Swim Speed (CSS) assessment. ' +
        'Warm up 400 yd easy freestyle, rest 3 min. ' +
        'Swim 400 yd all-out — time it. Rest 3 min. ' +
        'Swim 200 yd all-out — time it. ' +
        'Cool down 200 yd easy. ' +
        'Record both times: your coach uses them to set your threshold swim pace for the entire plan.',
      duration: 45,
      tss: 65,
      weighted_tss: 65,
      intensity_class: 'HARD',
      steps_preset: [],
      tags: ['assessment', 'css_test', 'time_trial'],
      serves_goal: 'shared',
      zone_targets: 'maximal effort on each test set',
    });
  }

  if (hasBk) {
    sessions.push({
      day: bikeDay,
      type: 'bike',
      name: 'Bike Baseline — 20-Minute FTP Test',
      description:
        '20-minute FTP assessment. ' +
        'Warm up 10 min easy spin building to moderate effort, then 2 × 1 min hard / 1 min easy. ' +
        'Ride 20 min all-out as evenly paced as possible — this is not a sprint. ' +
        'Cool down 5 min easy. ' +
        'Record average power (or average heart rate if no power meter). ' +
        'Your FTP ≈ average power × 0.95. ' +
        'Your coach uses this to set all bike training zones for the plan.',
      duration: 45,
      tss: 70,
      weighted_tss: 70,
      intensity_class: 'HARD',
      steps_preset: [],
      tags: ['assessment', 'ftp_test', 'time_trial'],
      serves_goal: 'shared',
      zone_targets: 'maximal sustainable effort for 20 min',
    });
  }

  if (hasRn) {
    sessions.push({
      day: runDay,
      type: 'run',
      name: 'Run Baseline — 12-Minute Time Trial',
      description:
        'Running threshold assessment. ' +
        'Warm up 15 min easy (conversational pace), then 4 × 30 sec strides with 30 sec walk recovery. ' +
        'Run 12 min all-out on a flat surface — start evenly, not a sprint. ' +
        'Cool down 10 min easy walk/jog. ' +
        'Record distance covered (or average pace). ' +
        'Your coach uses this to set your run zones and easy/threshold paces for the entire plan.',
      duration: 45,
      tss: 70,
      weighted_tss: Math.round(70 * 1.3),
      intensity_class: 'HARD',
      steps_preset: [],
      tags: ['assessment', 'run_test', 'time_trial'],
      serves_goal: 'shared',
      zone_targets: 'maximal sustainable effort for 12 min',
    });
  }

  return sessions;
}
