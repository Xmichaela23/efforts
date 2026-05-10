// generate-combined-plan/week-builder.ts
//
// SCHEDULING IS OWNED BY THE OPTIMIZER. This module is responsible for session content —
// intervals, paces, durations, flavor by phase, brick targets, swim templates, TSS budgeting,
// hard/easy enforcement, 80/20 enforcement. It does NOT decide what calendar day a session
// goes on. Day assignments arrive in AthleteState fields populated by the reconciler chain:
//
//   generate-combined-plan/index.ts
//     → reconcile-athlete-state-week-optimizer.ts
//       → _shared/week-optimizer.ts (deriveOptimalWeek + canPlaceWithModifier + sequentialOk)
//
// The reconciler runs for ALL combined-plan invocations (tri and single-sport). It short-circuits
// only when the AthleteState lacks a `long_run_day` anchor — in which case this module's legacy
// strength fallback at the bottom of the strength-placement block picks the first matrix-clean
// weekday and surfaces "no slot" as a trade-off rather than dropping safety guards.
//
// Scheduling rule sources of truth:
//   - Same-day matrix: _shared/schedule-session-constraints.ts (`ROWS`)
//   - Sequential rules (48h floors, after-long, after-quality, lower↔quality_bike): _shared/week-optimizer.ts (`sequentialOk`)
//   - Anchor placement, strength preferred days: _shared/week-optimizer.ts (`deriveOptimalWeek`)
//
// Implements §8 Week Construction Algorithm steps 3-7 (steps 1-2 are anchor placement,
// owned by the optimizer above).

import type {
  PlannedSession, GeneratedWeek, Phase, PhaseBlock, GoalInput,
  AthleteState, AthleteMemory, RaceAnchor,
  ConflictEvent, ConflictType, WeekStateReason,
} from './types.ts';
import type { Sport, Intensity } from './types.ts';
import {
  getSwimSlotTemplates,
  getRecoverySwimTemplate,
  getTwoSlotRecoveryLearnerSwimTemplates,
  shouldMaintainTwoSwimsInRecovery,
  countSwimAnchorSlotsForRecovery,
  countSwimAnchorSlotsForProgramTemplates,
  normalizeSwimProgramDistance,
  swimProgramIntentForAnchorSlots,
  type SwimSlotTemplate,
} from '../_shared/swim-program-templates.ts';
import {
  apply703SlowSwimmerWeeklyFloors,
} from './swim-tri-safety.ts';
import { applyOverdistanceIfApplicable } from './swim-protocol-v21.ts';
import { resolveSwimSlotYardsWithBudget } from './swim-protocol-volumes.ts';
import {
  DAYS_OF_WEEK, DAY_INDEX, BRICKS_PER_WEEK,
  PHASE_ZONE_DIST, hardEasyOk, scaledWeeklyTSS, projectedCTL,
  rampThresholds, estimateSessionTSS, weightedTSS, TSS_PER_HOUR,
  expectedBikeDurationHours, brickRunTargetMiles, longRunFloorMiles,
  PHASE_TSS_RANGES,
  type TriRaceDistance,
} from './science.ts';
import {
  FLOOR_REBUILD_LONG_RUN_SHARE_OF_BUDGET,
  FLOOR_REBUILD_DEEP_LONG_RUN_SHARE_OF_BUDGET,
} from './validate-training-floors.ts';
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
  LEARNER_HEAVY_SWIM_YARDS,
  learnerSwimExperience,
  type SameDayCompatContext,
} from '../_shared/schedule-session-constraints.ts';
import { blockForWeek } from './phase-structure.ts';
import { tryApplyScheduleCollisionsToGrid } from './apply-schedule-collisions.ts';
import { normalizeGoalDistanceToTriCollisionDistance } from '../_shared/resolve-schedule-collisions.ts';

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

/**
 * Performance + co-equal: same-day non-easy bike + run → run AM / bike PM ordering + timings (§8 / AMPK lens).
 */
function applyCoEqualSameDayBikeRunAmpkOrdering(
  grid: Map<string, DaySlot>,
  bikeQualityDay: string,
  runQualityDay: string,
  athleteState: AthleteState,
): void {
  if (bikeQualityDay !== runQualityDay) return;
  const perf =
    String(athleteState.training_intent ?? '').toLowerCase() === 'performance' &&
    String(athleteState.strength_intent ?? '').toLowerCase() === 'performance';
  if (!perf) return;
  const slot = grid.get(bikeQualityDay);
  if (!slot?.sessions.length) return;
  let bikeIdx = -1;
  let runIdx = -1;
  for (let i = 0; i < slot.sessions.length; i++) {
    const w = slot.sessions[i];
    if (w.type === 'bike' && w.intensity_class !== 'EASY' && bikeIdx < 0) bikeIdx = i;
    if (w.type === 'run' && w.intensity_class !== 'EASY' && runIdx < 0) runIdx = i;
  }
  if (bikeIdx < 0 || runIdx < 0) return;
  const bike = { ...slot.sessions[bikeIdx], timing: 'PM' as const };
  const run = { ...slot.sessions[runIdx], timing: 'AM' as const };
  const others = slot.sessions.filter((_, i) => i !== bikeIdx && i !== runIdx);
  slot.sessions = [...others, run, bike];
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
            const kindI = plannedSessionToScheduleSlot(list[i], {
              swimExperienceForMatrix: ctx?.swimExperienceForMatrix,
            });
            const kindJ = plannedSessionToScheduleSlot(list[j], {
              swimExperienceForMatrix: ctx?.swimExperienceForMatrix,
            });
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
                session_kind: plannedSessionToScheduleSlot(rm, {
                  swimExperienceForMatrix: ctx?.swimExperienceForMatrix,
                }),
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
                session_kind: plannedSessionToScheduleSlot(rm, {
                  swimExperienceForMatrix: ctx?.swimExperienceForMatrix,
                }),
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
  options?: {
    totalWeeks?: number;
    raceAnchors?: RaceAnchor[];
    phaseBlocks?: PhaseBlock[];
    /**
     * Second pass after `validate-training-floors` fails: uniformly scaling `tssMultiplier`
     * does not change long-run % of week or WoW ratios — this applies asymmetric caps.
     */
    physiologicalFloorRebuild?: boolean;
    /** Final compressor — tighter LR share + weekly budget after repeated rebuild failures. */
    physiologicalFloorRebuildDeep?: boolean;
  },
): GeneratedWeek {
  console.log('[buildWeek] ===== FUNCTION ENTRY ===== week', weekNum);

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
  const swimVolTradeOffs: string[] = [];
  /** Strength-reduction trade-offs from the legacy placement fallback (no-long-run path). */
  const strengthReducedTradeOffs: string[] = [];

  // ── Conflict-preference helpers ──────────────────────────────────────────
  const conflictPrefs: Record<string, string> = athleteState.conflict_preferences ?? {};
  /** Returns the recorded preference action for this week's conflict slug, or undefined. */
  const getPref = (slug: string): string | undefined => conflictPrefs[mkConflictId(weekNum, slug)];

  // Flags set during conflict detection; consumed at placement sites later.
  let shiftQualityRunToLongRun = false;
  const dropQualityRunThisWeek = false;
  let dropThirdSwimThisWeek = false;

  // Diagnostic: log all day-preference state for every week so we can trace preferred_days flow.
  console.log('[buildWeek] week', weekNum, {
    days_per_week: athleteState.days_per_week,
    rest_days: athleteState.rest_days,
    bike_quality_day_raw: athleteState.bike_quality_day,
    quality_run_day_raw: athleteState.run_quality_day, // sun-first index; undefined => derived in build
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
  /** Post-marathon / full recovery rebuild stops shaping the calendar after week 3 (§cap — was bleeding ~9wk via structural hints). */
  const RECOVERY_REBUILD_CALENDAR_WEEKS = 3;
  const inRecoveryRebuildTransition =
    athleteState.transition_mode === 'recovery_rebuild' &&
    weekNum <= RECOVERY_REBUILD_CALENDAR_WEEKS;

  const recoveryRebuildWeek2EasyRunOnly =
    !hasTri &&
    weekNum === 2 &&
    inRecoveryRebuildTransition;

  // Weekly TSS budget for this week (scaled by phase, CTL, hours, tss multiplier)
  const baseTSS = scaledWeeklyTSS(phase, athleteState.current_ctl, athleteState.weekly_hours_available, block.tssMultiplier);

  // §1.3 ramp rate check: ensure budget doesn't spike CTL dangerously
  const { moderate: moderateRamp } = rampThresholds(athleteState.current_ctl);
  const maxSafeTSS = weeklyTSSForRamp(athleteState.current_ctl, moderateRamp);
  let weeklyTSSBudget = Math.min(baseTSS, maxSafeTSS);
  if (options?.physiologicalFloorRebuild) {
    weeklyTSSBudget = Math.max(
      Math.round(weeklyTSSBudget * 0.91),
      Math.round(Math.min(baseTSS, maxSafeTSS) * 0.55),
    );
    if (options?.physiologicalFloorRebuildDeep) {
      weeklyTSSBudget = Math.max(Math.round(weeklyTSSBudget * 0.88), Math.round(Math.min(baseTSS, maxSafeTSS) * 0.5));
    }
  }

  if (weekNum === 1) {
    const ctl = athleteState.current_ctl;
    const wh = athleteState.weekly_hours_available;
    const ctlFactor = Math.min(1.5, Math.max(0.5, ctl / 60));
    const hourFactor = Math.min(1.5, Math.max(0.5, wh / 10));
    const { min: phaseTssMin, max: phaseTssMax } = PHASE_TSS_RANGES[phase];
    const phaseMid = (phaseTssMin + phaseTssMax) / 2;
    const clampedBeforeMult = Math.max(
      phaseTssMin,
      Math.min(phaseTssMax, phaseMid * ctlFactor * hourFactor),
    );
    console.log('[buildWeek] week 1 load diagnostics', {
      transition_mode: athleteState.transition_mode,
      structural_load_hint: athleteState.structural_load_hint,
      ctlFactor,
      hourFactor,
      current_ctl: ctl,
      weekly_hours_available: wh,
      phase,
      phaseTssRange: { min: phaseTssMin, max: phaseTssMax },
      scaledWeeklyTSS_beforeTssMultiplier: clampedBeforeMult,
      scaledWeeklyTSS_afterTssMultiplier: baseTSS,
      tssMultiplier: block.tssMultiplier,
      rampThresholdModeratePtsPerWeek: moderateRamp,
      maxSafeTSS,
      weeklyTSSBudget_afterRampCap: weeklyTSSBudget,
      physiologicalFloorRebuild: !!options?.physiologicalFloorRebuild,
      physiologicalFloorRebuildDeep: !!options?.physiologicalFloorRebuildDeep,
    });
  }

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
  // brick frequency from that phase — otherwise "recovery" weeks become the hardest weekends.
  // §SESSION-FREQUENCY-DEFAULTS §9: when the reconciler populated session_frequency_defaults,
  // its tier-aware `bricks_per_week_by_phase` is the cap (e.g. 5-7 tier = 0 in all phases;
  // 14+ tier = 2 in race_specific). Take the min of phase-default and tier-cap. When the
  // defaults aren't populated (legacy / no-long-run path), fall back to BRICKS_PER_WEEK[phase].
  const phaseBrickDefault = BRICKS_PER_WEEK[phase];
  const tierBrickCap = athleteState.session_frequency_defaults?.bricks_per_week_by_phase?.[phase];
  const baseBricks = tierBrickCap != null ? Math.min(phaseBrickDefault, tierBrickCap) : phaseBrickDefault;
  const bricksThisWeek = recoveryRebuildWeek1 || isRecovery ? 0 : baseBricks;
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
  const swimMult = Math.min(1, Math.max(0.48, athleteState.swim_volume_multiplier ?? 1));

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

  if (options?.physiologicalFloorRebuild && !raceThisWeek) {
    const floorMi = hasTri ? longRunFloorMiles(primaryGoal.distance, phase) : 3;
    longRunMiles = Math.max(floorMi, Math.round(longRunMiles * 0.86));
    longRunMinutes = Math.round(longRunMiles * 9.5);
    // Tri long-run floors can exceed 30% of weekly raw TSS when the whole week is scaled down
    // for floor rebuild — cap miles vs budget proxy (matches `validateTrainingFloors`).
    const lrIntensity: Intensity = phase === 'race_specific' ? 'MODERATE' : 'EASY';
    const tssPerMin = TSS_PER_HOUR.run[lrIntensity] / 60;
    const lrShareCap = options?.physiologicalFloorRebuildDeep
      ? FLOOR_REBUILD_DEEP_LONG_RUN_SHARE_OF_BUDGET
      : FLOOR_REBUILD_LONG_RUN_SHARE_OF_BUDGET;
    const maxLongRunTss = lrShareCap * Math.max(1, weeklyTSSBudget);
    const maxLongRunMiles = maxLongRunTss / tssPerMin / 9.5;
    longRunMiles = Math.max(2, Math.min(longRunMiles, Math.round(maxLongRunMiles * 10) / 10));
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

  if (weekNum === 1) {
    console.log('[buildWeek] week 1 long session computed', {
      longRunMiles,
      longRunMinutes,
      longRideHours,
      longRideMinutes,
      runTotalMin,
      bikeTotalMin,
      weeklyTSSBudget,
      baseTSS,
      maxSafeTSS,
      recoveryRebuildWeek1,
      isRecovery,
      raceThisWeek: !!raceThisWeek,
      physiologicalFloorRebuild: !!options?.physiologicalFloorRebuild,
    });
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

  // Alternate “long endurance ride only” vs brick on odd week-in-block — base_first only.
  // race_peak / default tri needs weekly bricks in build per §4.12 (was skipping half of build weeks).
  const preferStandaloneBikeEndurance =
    triApproach === 'base_first' &&
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

  // ── Swim calendar (defaults: easy Mon, quality Thu; avoids long ride/run days) ──
  const swimEasyIdx =
    athleteState.swim_easy_day != null ? (athleteState.swim_easy_day + 6) % 7 : DAYS_OF_WEEK.indexOf('Monday');
  const swimQualityIdx =
    athleteState.swim_quality_day != null
      ? (athleteState.swim_quality_day + 6) % 7
      : DAYS_OF_WEEK.indexOf('Thursday');
  // `swimEasyDay` is mutated by the newer-swimmer heavy-aerobic guard below (content-aware,
  // not anchor placement — depends on resolved swim yards). `swimQualityDay` is read-only.
  let swimEasyDay = DAYS_OF_WEEK[swimEasyIdx] ?? 'Monday';
  const swimQualityDay = DAYS_OF_WEEK[swimQualityIdx] ?? 'Thursday';

  const runQualityIdx =
    athleteState.run_quality_day != null
      ? (athleteState.run_quality_day + 6) % 7
      : DAYS_OF_WEEK.indexOf('Wednesday');
  const runQualityDay = DAYS_OF_WEEK[runQualityIdx] ?? 'Wednesday';
  const runEasyIdx =
    athleteState.run_easy_day != null
      ? (athleteState.run_easy_day + 6) % 7
      : DAYS_OF_WEEK.indexOf('Friday');
  let runEasyDay = DAYS_OF_WEEK[runEasyIdx] ?? 'Friday';
  if (runQualityDay === runEasyDay) {
    runEasyDay = adjDay(runEasyDay, 1);
  }

  // Arc wizard: fold mid-week run quality into Sunday long (recovery-first path).
  const runQualityPlacementBlendEligible =
    hasTri &&
    athleteState.run_quality_placement === 'long_run_blend' &&
    !raceThisWeek &&
    !isRecovery &&
    !recoveryRebuildWeek1 &&
    !recoveryRebuildWeek2EasyRunOnly &&
    phase !== 'taper';
  if (runQualityPlacementBlendEligible) {
    shiftQualityRunToLongRun = true;
  }

  // Third swim (`preferred_days.swim[2]` → swim_third_day): fires when swim_intent === 'focus'
  // (athlete-driven floor) OR session_frequency_defaults.swims_per_week >= 3 (hours-driven, per
  // SESSION-FREQUENCY-DEFAULTS §2: 12-14hr and 14+ tiers always get 3 swims regardless of intent).
  const swimIntentFocus = String(athleteState.swim_intent ?? '').toLowerCase() === 'focus';
  const swimsBudget = athleteState.session_frequency_defaults?.swims_per_week ?? 0;
  const wantThirdSwim = swimIntentFocus || swimsBudget >= 3;
  let swimThirdDay: string | null = null;
  if (wantThirdSwim && hasTri) {
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
        const dayTyped = dayName as (typeof DAYS_OF_WEEK)[number];
        const startIdx = Math.max(0, DAYS_OF_WEEK.indexOf(dayTyped));
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
  const trainFitness = athleteState.training_fitness ?? 'intermediate';
  const swimSingleRecovery = hasTri && (isRecovery || recoveryRebuildWeek1);
  const swimTrainingPrefs = primaryGoal.training_prefs ?? null;
  const swimAnchorSlots = countSwimAnchorSlotsForRecovery(
    {
      swim_easy_day: athleteState.swim_easy_day,
      swim_quality_day: athleteState.swim_quality_day,
      swim_third_day: athleteState.swim_third_day,
    },
    swimTrainingPrefs,
  );
  /** Conservative count for 2- vs 3-slot swim programs (focus vs race). See countSwimAnchorSlotsForProgramTemplates. */
  const swimProgramAnchorSlots = countSwimAnchorSlotsForProgramTemplates(
    {
      swim_easy_day: athleteState.swim_easy_day,
      swim_quality_day: athleteState.swim_quality_day,
      swim_third_day: athleteState.swim_third_day,
    },
    swimTrainingPrefs,
  );
  // §SESSION-FREQUENCY-DEFAULTS §2: 12-14hr and 14+ tiers have swims_per_week=3 regardless of
  // swim_intent. The 3-slot focus templates are the right shape for these athletes; when the
  // hours-derived budget calls for 3 swims, treat as 'focus' for template selection even if the
  // athlete declared swim_intent='race'.
  const effectiveSwimIntent =
    swimsBudget >= 3 && swimProgramAnchorSlots >= 3
      ? 'focus'
      : athleteState.swim_intent;
  const swimTemplatesIntent = swimProgramIntentForAnchorSlots(
    effectiveSwimIntent,
    swimProgramAnchorSlots,
  );
  const recoveryLearnerTwoSwimMaintained =
    swimSingleRecovery &&
    shouldMaintainTwoSwimsInRecovery(athleteState.swim_experience, trainFitness, swimAnchorSlots);

  let swimTemplates: SwimSlotTemplate[];
  if (!hasTri) {
    swimTemplates = [];
  } else if (recoveryLearnerTwoSwimMaintained) {
    swimTemplates = getTwoSlotRecoveryLearnerSwimTemplates(swimDistance);
  } else if (swimSingleRecovery) {
    swimTemplates = [getRecoverySwimTemplate()];
  } else {
    swimTemplates = getSwimSlotTemplates(swimTemplatesIntent, phase, swimDistance, weekInBlock, {
      athleteFitness: trainFitness,
      planWeekNumber: weekNum,
    });
    console.log('[buildWeek] swim templates selected', weekNum, {
      swimIntent: swimTemplatesIntent,
      phase,
      swimDistance,
      weekInBlock,
      swimAnchorSlots,
      swimProgramAnchorSlots,
      athlete_swim_intent_raw: athleteState.swim_intent,
      template_types: swimTemplates.map((t) => t.session_type),
      template_target_yards: swimTemplates.map((t) => t.target_yards),
      template_count: swimTemplates.length,
    });
  }
  if (hasTri && swimPct === 0 && !swimSingleRecovery && swimTemplates.length > 0) {
    swimTemplates = swimTemplates.map((t) => ({
      session_type: 'easy',
      drill_emphasis: false,
      target_yards: Math.max(800, Math.round(t.target_yards * 0.35)),
      notes: 'Maintenance aerobic swim — run-primary emphasis, swim kept short.',
    }));
  }
  // Swim yards: protocol v2.1 hybrid — ramp targets × swimMult → per-session floor/ceiling →
  // discretionary shrink toward swim TSS budget → drop lowest-priority slot if floors exceed budget.
  const SWIM_TSS_PER_HR = 55;
  const SWIM_YDS_PER_MIN = 30; // ~1650 yd/hr, mid-range for tri training
  const swimBudgetMinutes = (swimBudget / SWIM_TSS_PER_HR) * 60;
  let swimBudgetYards = swimBudgetMinutes * SWIM_YDS_PER_MIN;

  const preliminarySwimYards = swimTemplates.map((t) => Math.round(t.target_yards * swimMult));
  if (recoveryLearnerTwoSwimMaintained && preliminarySwimYards.length === 2) {
    swimBudgetYards = Math.max(
      swimBudgetYards,
      preliminarySwimYards.reduce((a, b) => a + b, 0) + 400,
    );
  }

  const swimResolved = resolveSwimSlotYardsWithBudget({
    templates: swimTemplates,
    preliminaryYards: preliminarySwimYards,
    swimBudgetYards,
    distance: swimDistance,
    fitness: trainFitness,
    phase,
    weekInPhase: weekInBlock,
    swim_anchor_slot_count: swimAnchorSlots,
    ...(athleteState.structural_load_hint === 'low' &&
      inRecoveryRebuildTransition &&
      !recoveryLearnerTwoSwimMaintained
      ? { recoveryFloorScale: 0.7 as const }
      : {}),
  });
  swimTemplates = swimResolved.templates;
  swimVolTradeOffs.push(...swimResolved.tradeOffs);

  if (hasTri && swimTemplates.length > 0) {
    console.log('[buildWeek] swim anchors vs templates', weekNum, {
      swim_anchor_slots_recovery: swimAnchorSlots,
      swim_anchor_slots_program: swimProgramAnchorSlots,
      athlete_swim_intent: athleteState.swim_intent,
      resolved_templates_intent: swimTemplatesIntent,
      template_session_types: swimTemplates.map((t) => t.session_type),
    });
  }

  const swimSlotYards703 = apply703SlowSwimmerWeeklyFloors({
    templates: swimTemplates,
    slotYards: swimResolved.yards,
    primaryGoal,
    athleteState,
    phase,
    weekInPhase: weekInBlock,
    hasTri,
    swimSingleRecovery,
    swimPct,
    raceThisWeek: Boolean(raceThisWeek),
    isRecovery,
    recoveryRebuildWeek1,
  });
  const swimSlotYardsFinal = swimSlotYards703.map((y, i) => {
    const t = swimTemplates[i];
    if (!t || t.session_type !== 'endurance') return y;
    return applyOverdistanceIfApplicable(y, {
      raceDistance: swimDistance,
      athleteFitness: trainFitness,
      phase,
      weekInPhase: weekInBlock,
      sessionType: 'endurance',
    });
  });
  const swimFromTplOpts = (template: SwimSlotTemplate, yards: number) => ({
    swimRaceDistanceKey: swimDistance,
    athleteFitness: trainFitness,
    swimThresholdPace: athleteState.swim_threshold_pace ?? null,
    enduranceOverdistanceNote:
      template.session_type === 'endurance' &&
      yards >= 4500 &&
      swimDistance === 'full' &&
      trainFitness === 'advanced',
  });
  // ── Bike quality + easy (defaults Tue / Wed; from Arc `preferred_days.quality_bike` / `easy_bike`) ──
  const bikeQualIdxBase =
    athleteState.bike_quality_day != null
      ? (athleteState.bike_quality_day + 6) % 7
      : DAYS_OF_WEEK.indexOf('Tuesday');
  const bikeQualityDay = DAYS_OF_WEEK[bikeQualIdxBase] ?? 'Tuesday';
  const bikeEasyIdxBase =
    athleteState.bike_easy_day != null
      ? (athleteState.bike_easy_day + 6) % 7
      : DAYS_OF_WEEK.indexOf('Wednesday');
  const bikeEasyDay = DAYS_OF_WEEK[bikeEasyIdxBase] ?? 'Wednesday';

  const bikeQualitySlot = grid.get(bikeQualityDay);
  if (!bikeQualitySlot?.isRest && hasTri) {
    if (recoveryRebuildWeek1) {
      const recBikeHr = Math.max(0.75, Math.min(1.0, bikeTotalMin * 0.15 / 55));
      const grLabel = groupRideAnchorDisplayLabel(athleteState);
      if (grLabel) {
        const capHr = Math.min(recBikeHr, resolveGroupRideHours(phase, athleteState));
        bikeQualitySlot!.sessions.push(
          groupRideSession(
            bikeQualityDay,
            capHr,
            phase,
            servedGoal,
            grLabel,
            athleteState.group_ride_route_url,
            athleteState.group_ride_route_snapshot,
            athleteState.plan_units === 'metric' ? 'metric' : 'imperial',
          ),
        );
      } else {
        bikeQualitySlot!.sessions.push(easyBike(bikeQualityDay, recBikeHr, servedGoal));
      }
    } else if (isRecovery) {
      const recBikeHr = Math.max(0.75, Math.min(1.0, bikeTotalMin * 0.20 / 55));
      const grLabel = groupRideAnchorDisplayLabel(athleteState);
      if (grLabel) {
        const capHr = Math.min(recBikeHr, resolveGroupRideHours(phase, athleteState));
        bikeQualitySlot!.sessions.push(
          groupRideSession(
            bikeQualityDay,
            capHr,
            phase,
            servedGoal,
            grLabel,
            athleteState.group_ride_route_url,
            athleteState.group_ride_route_snapshot,
            athleteState.plan_units === 'metric' ? 'metric' : 'imperial',
          ),
        );
      } else {
        bikeQualitySlot!.sessions.push(easyBike(bikeQualityDay, recBikeHr, servedGoal));
      }
    } else {
      const bq = bikeQualityDay;
      if (phase === 'taper') {
        bikeQualitySlot!.sessions.push(bikeOpeners(bq, servedGoal));
      } else {
        const grLabel = groupRideAnchorDisplayLabel(athleteState);
        // Anchor-driven override: when quality-bike day is a recurring group ride,
        // describe it honestly as a group ride (no structured interval prescription).
        if (grLabel) {
          const groupRideHours = resolveGroupRideHours(phase, athleteState);
          bikeQualitySlot!.sessions.push(
            groupRideSession(
              bq,
              groupRideHours,
              phase,
              servedGoal,
              grLabel,
              athleteState.group_ride_route_url,
              athleteState.group_ride_route_snapshot,
              athleteState.plan_units === 'metric' ? 'metric' : 'imperial',
            ),
          );
        } else {
          bikeQualitySlot!.sessions.push(groupRideQualityBikeSession(bq, phase, servedGoal));
        }
      }
    }
  }

  console.log('[buildWeek] anchor weekdays resolved', weekNum, {
    bike_quality_day: bikeQualityDay,
    bike_easy_day: bikeEasyDay,
    quality_run_day: runQualityDay,
    swim_easy_day: swimEasyDay,
    swim_quality_day: swimQualityDay,
    long_run_actual_day: longRunActualDay,
  });

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
        const rpBlendFrac = phase === 'race_specific' ? 0.65 : phase === 'build' ? 0.48 : 0.47;
        const rpMiles = Math.max(4, Math.round(longRunMiles * rpBlendFrac));
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

  applyCoEqualSameDayBikeRunAmpkOrdering(grid, bikeQualityDay, runQualityDay, athleteState);

  // Newer swimmers: long aerobic swims exceed completion "easy" pairing vs quality_run — separate days.
  if (
    hasTri &&
    learnerSwimExperience(athleteState.swim_experience) &&
    swimTemplates.length >= 2 &&
    swimEasyDay === runQualityDay &&
    !shiftQualityRunToLongRun &&
    !dropQualityRunThisWeek
  ) {
    const yEasy =
      swimSlotYardsFinal[1] ??
      swimResolved.yards[1] ??
      Math.round(swimTemplates[1]!.target_yards * swimMult);
    if (yEasy > LEARNER_HEAVY_SWIM_YARDS) {
      const beforeEasy = swimEasyDay;
      const blockedEasy = new Set<string>([
        longRideDay,
        longRunActualDay,
        ...restDayNames,
        runQualityDay,
        swimQualityDay,
      ]);
      const startEasy = Math.max(0, DAYS_OF_WEEK.indexOf(swimEasyDay));
      for (let s = 1; s < 7; s++) {
        const d = DAYS_OF_WEEK[(startEasy + s) % 7]!;
        if (!blockedEasy.has(d)) {
          swimEasyDay = d;
          break;
        }
      }
      if (swimEasyDay !== beforeEasy) {
        conflictEvents.push({
          conflict_id: mkConflictId(weekNum, 'learner-heavy-swim-off-quality-run'),
          conflict_type: 'quality_swim_blocked',
          blocked_intent: {
            session_kind: 'easy_swim',
            preferred_day: conflictDayLo(beforeEasy),
          },
          blocking_reasons: uniqReasons(['anchor_conflict']),
          anchors_involved: [runQualityDay],
          applied_resolution: {
            type: 'moved',
            to_day: conflictDayLo(swimEasyDay),
            note: `Moved heavy aerobic swim off ${beforeEasy} — newer swimmer volume stacks like quality work vs mid-week quality run.`,
          },
        });
      }
    }
  }

  // ── Tri swims (program templates × swim_volume_multiplier) ────────────────
  let qualitySwimPlaced = false;
  const qualitySwimSlot = grid.get(swimQualityDay);
  if (hasTri && swimTemplates.length > 0) {
    const t0 = swimTemplates[0]!;
    const y0 = swimSlotYardsFinal[0] ?? swimResolved.yards[0] ?? Math.round(t0.target_yards * swimMult);
    if (!qualitySwimSlot?.isRest && qualitySwimSlot!.sessions.length < 2) {
      qualitySwimSlot!.sessions.push(
        swimSessionFromTemplate(t0, y0, swimQualityDay, weekNum, phase, servedGoal, 0, athleteState.swim_equipment, swimFromTplOpts(t0, y0)),
      );
      qualitySwimPlaced = true;
    } else {
      const fallSlot = grid.get(swimEasyDay);
      if (!fallSlot?.isRest) {
        fallSlot!.sessions.push(
          swimSessionFromTemplate(t0, y0, swimEasyDay, weekNum, phase, servedGoal, 4, athleteState.swim_equipment, swimFromTplOpts(t0, y0)),
        );
        qualitySwimPlaced = true;
      }
    }
  }

  // §SESSION-FREQUENCY-DEFAULTS §2: budgets for easy_run / easy_bike (gates both the tri
  // and run-only easy-session paths below). Defaults to 3 (existing behavior preserved
  // when reconciler hasn't populated session_frequency_defaults).
  const runsBudget = athleteState.session_frequency_defaults?.runs_per_week ?? 3;
  // Run-only: mid-week easy run (fixed Thursday — not tied to swim prefs)
  const thursdayRunSlot = grid.get('Thursday');
  if (runsBudget >= 3 && !hasTri && !thursdayRunSlot?.isRest) {
    const easyMi = isRecovery
      ? Math.max(2, Math.round(longRunMiles * 0.30))
      : Math.max(4, Math.round(longRunMiles * 0.40));
    thursdayRunSlot!.sessions.push(easyRun('Thursday', easyMi, servedGoal));
  }

  // ── Second swim slot (easy / technique / race-specific aerobic from template) ─
  const easySwimSlot = grid.get(swimEasyDay);
  if (!easySwimSlot?.isRest && hasTri && swimTemplates.length >= 2) {
    const t1 = swimTemplates[1]!;
    const y1 = swimSlotYardsFinal[1] ?? swimResolved.yards[1] ?? Math.round(t1.target_yards * swimMult);
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
          : swimSessionFromTemplate(t1, y1, swimEasyDay, weekNum, phase, servedGoal, 4, athleteState.swim_equipment, swimFromTplOpts(t1, y1)),
      );
    }
  }

  // ── Third swim (focus program template slot 2) ─────────────────────────────
  if (swimThirdDay && hasTri && !recoveryRebuildWeek1 && swimTemplates.length >= 3) {
    const thirdSwimSlot = grid.get(swimThirdDay);
    if (!thirdSwimSlot?.isRest && thirdSwimSlot!.sessions.length < 2) {
      const t2 = swimTemplates[2]!;
      const y2 = swimSlotYardsFinal[2] ?? swimResolved.yards[2] ?? Math.round(t2.target_yards * swimMult);
      thirdSwimSlot!.sessions.push(
        swimSessionFromTemplate(t2, y2, swimThirdDay, weekNum, phase, servedGoal, 5, athleteState.swim_equipment, swimFromTplOpts(t2, y2)),
      );
    }
  }

  // ── Mid-week easy run (default Friday; from Arc `preferred_days.easy_run`) ─
  // §SESSION-FREQUENCY-DEFAULTS §2: when runs_per_week < 3, easy_run is dropped
  // (long_run + quality_run only). `runsBudget` declared earlier (above run-only path).
  const runEasySlot = grid.get(runEasyDay);
  if (runsBudget >= 3 && !runEasySlot?.isRest && !['taper'].includes(phase)) {
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
  // Loading-pattern deload weeks (`isRecovery`) still used phase `build` / `race_specific` with
  // performance intent → strFreq was 2, but `createWeekSessions` often returns one deload template;
  // both slots then mapped to the same session (duplicate Mon/Tue). One strength day in deload.
  if (isRecovery && hasTri) strFreq = Math.min(strFreq, 1);
  if (recoveryRebuildWeek1) strFreq = 0;

  const capRaw = athleteState.strength_sessions_cap;
  if (capRaw != null && Number.isFinite(capRaw)) {
    const cap = Math.max(0, Math.min(3, Math.round(Number(capRaw))));
    strFreq = Math.min(strFreq, cap);
  }

  if (strFreq >= 1) {
    // Optimizer-derived strength slots (the only path when reconciler ran). Drops the legacy
    // hasTri gate — non-tri plans now also reconcile (Task 7) and use these slots, with the
    // session-content function (`triathlonStrength` vs `runStrength`) chosen by goal mix.
    const useOptimizerStrength =
      Array.isArray(athleteState.strength_optimizer_slots) &&
      athleteState.strength_optimizer_slots.length > 0;

    if (useOptimizerStrength) {
      const limiterGoalOpt = goals.find((g) => (g as any).limiter === true)
        ?? goals.sort((a, b) => (a.priority === 'A' ? -1 : b.priority === 'A' ? 1 : 0)).slice(-1)[0];
      const limiterSportOpt: 'swim' | 'bike' | 'run' =
        (['swim', 'bike', 'run'].includes(limiterGoalOpt?.sport ?? '')
          ? limiterGoalOpt!.sport
          : 'run') as 'swim' | 'bike' | 'run';
      const weekInPhaseOpt = options?.phaseBlocks?.length
        ? weekInPhaseForTimeline(options.phaseBlocks, weekNum, block)
        : Math.max(1, weekNum - block.startWeek + 1);
      const planTotalWeeksOpt = Math.max(1, options?.totalWeeks ?? 52);
      const equipmentTypeOpt = athleteState.equipment_type ?? 'commercial_gym';
      const hasCableOpt =
        athleteState.has_cable_machine ??
        (equipmentTypeOpt === 'commercial_gym' && !athleteState.equipment_type?.includes('home'));
      const hasGhdOpt = athleteState.has_ghd ?? false;
      const slotsOrdered =
        strFreq === 1 &&
        athleteState.strength_optimizer_slots!.length >= 2
          ? [...athleteState.strength_optimizer_slots!].sort((a, b) => a.session_index - b.session_index)
          : athleteState.strength_optimizer_slots!;
      const slotsPlanned = slotsOrdered.slice(0, strFreq);
      for (const slot of slotsPlanned) {
        const strSlotOpt = grid.get(slot.weekday);
        if (!strSlotOpt || strSlotOpt.isRest || strSlotOpt.sessions.length >= 2) continue;
        if (hasTri) {
          strSlotOpt.sessions.push(
            triathlonStrength(slot.weekday, phase, servedGoal, {
              weekInPhase: weekInPhaseOpt,
              weekIndex: weekNum,
              totalWeeks: planTotalWeeksOpt,
              isRecovery,
              limiterSport: limiterSportOpt,
              sessionIndex: slot.session_index,
              equipmentType: equipmentTypeOpt,
              hasCable: hasCableOpt,
              hasGhd: hasGhdOpt,
              longRideDayName: longRideDay,
              longRunDayName: longRunActualDay,
              qualityBikeDayName: bikeQualityDay,
              qualityRunDayName: runQualityDay,
              strengthProtocolId: athleteState.strength_protocol,
              strengthIntent: athleteState.strength_intent,
              equipmentTier: athleteState.equipment_tier,
              performanceNumbers: athleteState.performance_numbers,
            }),
          );
        } else {
          strSlotOpt.sessions.push(
            runStrength(slot.weekday, phase, servedGoal, {
              weekInPhase: weekInPhaseOpt,
              weekIndex: weekNum,
              totalWeeks: planTotalWeeksOpt,
              isRecovery,
              equipmentType: equipmentTypeOpt,
              longRunDayName: longRunActualDay,
              qualityRunDayName: runQualityDay,
            }),
          );
        }
      }
    } else {
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

    // Legacy fallback path (reconciler bailed because long_run is missing) — pick the first
    // matrix-clean weekday. Preferred-day handling and 48h/density guards live in the optimizer
    // (§4.4 / §4.15); this branch only runs when the optimizer couldn't anchor the week.
    const candidates1 = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'].filter(d => !blocked.has(d));
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
            qualityBikeDayName: bikeQualityDay,
            qualityRunDayName: runQualityDay,
            strengthProtocolId: athleteState.strength_protocol,
            strengthIntent: athleteState.strength_intent,
            equipmentTier: athleteState.equipment_tier,
            performanceNumbers: athleteState.performance_numbers,
          }));
        } else {
          strSlot.sessions.push(runStrength(strDay, phase, servedGoal, {
            weekInPhase,
            weekIndex: weekNum,
            totalWeeks: planTotalWeeks,
            isRecovery,
            equipmentType,
            longRunDayName: longRunActualDay,
            qualityRunDayName: runQualityDay,
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

      // Single-pass pool. The optimizer (when reconciled) owns 48h + density guards via
      // _shared/schedule-session-constraints.ts sequentialOk; this fallback path runs only
      // when reconciliation was skipped (no long_run anchor) and therefore has nothing to
      // be 48h from.
      const pool2 = weekdayOrder.filter(baseLowerDay);
      const strDay2 = pool2[0];
      if (!strDay2) {
        // §6.3: no slot found → don't place; surface as trade-off (do not drop guards and
        // place anyway — that produced silent junk training in the prior implementation).
        strengthReducedTradeOffs.push(
          `Strength frequency reduced from ${strFreq}× to 1× — no compatible Mon–Fri slot for lower-body session 2 in this week.`,
        );
      }
      if (strDay2) {
        const strSlot2 = grid.get(strDay2);
        if (strSlot2 && strSlot2.sessions.length < 2) {
          const equipmentType2 = athleteState.equipment_type ?? 'commercial_gym';
          // Must compute here: slot-1 block scopes hasCable/hasGhd inside its own `if` — using them here was a ReferenceError.
          const hasCable2 =
            athleteState.has_cable_machine ??
            (equipmentType2 === 'commercial_gym' && !athleteState.equipment_type?.includes('home'));
          const hasGhd2 = athleteState.has_ghd ?? false;
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
              hasCable: hasCable2,
              hasGhd: hasGhd2,
              longRideDayName: longRideDay,
              longRunDayName: longRunActualDay,
              qualityBikeDayName: bikeQualityDay,
              qualityRunDayName: runQualityDay,
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
              longRunDayName: longRunActualDay,
              qualityRunDayName: runQualityDay,
            }));
          }
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
  // §SESSION-FREQUENCY-DEFAULTS §2: when bikes_per_week < 3, easy_bike is dropped entirely
  // (long_ride + quality_bike only). Reads from session_frequency_defaults populated by reconciler.
  const bikesBudget = athleteState.session_frequency_defaults?.bikes_per_week ?? 3;
  const hasExplicitBikeEasyPref = athleteState.bike_easy_day != null;
  if (bikesBudget >= 3 && hasTri && !raceThisWeek) {
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

  const qrLbTradeOffStrings = collectQualityRunLowerBodyTradeOffs(gridSessions(grid), bikeQualityDay);

  // Same-day product matrix: validate what we ship; attempt strength-only auto-fix; always log if still bad.
  // Performance + co-equal strength athletes may combine quality_run AM + lower_body PM (EXPERIENCE_MODIFIER).
  // strength_intent === 'performance' is the co-equal flag (see AthleteState type + EXPERIENCE_MODIFIER_TEXT).
  const isPerformanceCoequal = performanceStrength;
  // §4.11: matrix-validator gate for QR + QS same-day. Intent-based; does not include the
  // optimizer's next-day-long check because the validator runs on already-placed sessions and
  // never sees a same-day combo the optimizer rejected.
  const allowQrQsForMatrix =
    String(athleteState.training_intent ?? '').toLowerCase() === 'performance' ||
    String(athleteState.strength_intent ?? '').toLowerCase() === 'performance';
  const sameDayCompatCtx: SameDayCompatContext = {
    allowQualityRunQualitySwimSameDay: allowQrQsForMatrix,
    strictStandaloneQualityRun:
      hasTri && athleteState.run_quality_placement === 'standalone_midweek',
    swimExperienceForMatrix: athleteState.swim_experience,
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
          session_kind: plannedSessionToScheduleSlot(p.a, {
            swimExperienceForMatrix: sameDayCompatCtx.swimExperienceForMatrix,
          }),
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
            session_kind: plannedSessionToScheduleSlot(p.a, {
              swimExperienceForMatrix: sameDayCompatCtx.swimExperienceForMatrix,
            }),
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

  // ── Coarse pillar collision pass (optimizer doctrine); mutates session days in grid ──
  const mergedTradeOffs = [
    ...swimVolTradeOffs,
    ...week8020TradeOffs,
    ...qrLbTradeOffStrings,
    ...strengthReducedTradeOffs,
  ];
  tryApplyScheduleCollisionsToGrid(grid, {
    weekNum,
    conflictEvents,
    weekTradeOffs: mergedTradeOffs,
    triDistance: normalizeGoalDistanceToTriCollisionDistance(primaryGoal?.distance),
  });

  // ── Steps 6 & 7: TSS + ramp rate validation handled in validator.ts ───────

  const allSessions = gridSessions(grid);
  return computeWeekMetrics(allSessions, weekNum, phase, isRecovery, mergedTradeOffs, conflictEvents);
}

const CONCENTRATED_LOAD_DAY =
  'Concentrated load day — lower-body strength landed the same day as your mid-week quality run (run before lifting when stacked). Intentional pairing around anchors / co-equal spacing.';

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

/** Match reconciler: treat pinned quality bike as group ride when label or duration/route hints exist. */
function groupRideAnchorDisplayLabel(athleteState: AthleteState): string | null {
  const trimmed = String(athleteState.bike_quality_label ?? '').trim();
  if (trimmed) return trimmed;
  const hasDur =
    athleteState.bike_quality_route_estimated_hours != null ||
    athleteState.bike_quality_route_estimated_minutes != null ||
    athleteState.bike_quality_group_ride_hours != null ||
    athleteState.bike_quality_group_ride_minutes != null ||
    Boolean(String(athleteState.group_ride_route_url ?? '').trim());
  return hasDur ? 'Group Ride' : null;
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
