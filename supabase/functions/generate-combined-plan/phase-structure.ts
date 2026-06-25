// generate-combined-plan/phase-structure.ts
//
// Determines the multi-event phase timeline.
// §2.3 Priority rules, §6.3 taper overlap, §7.1 phase definitions.

import type { GoalInput, PhaseBlock, Phase, EventRelationship, AthleteState, RaceAnchor } from './types.ts';
import {
  taperWeeks,
  recoveryWeeksPostRace,
  blockWeekMultiplier,
  getBaseDistribution,
} from './science.ts';
import type { Sport } from './types.ts';
import type { PlanGenerationTradeOff } from '../_shared/plan-generation-trade-offs.ts';

// ── Helpers ──────────────────────────────────────────────────────────────────

function weeksUntil(today: Date, target: Date): number {
  return Math.ceil((target.getTime() - today.getTime()) / (7 * 24 * 60 * 60 * 1000));
}

/** Parse YYYY-MM-DD to UTC noon (stable weekday). */
function parseIsoToUtcNoon(iso: string): Date {
  const [y, m, d] = String(iso).split('T')[0].split('-').map(Number);
  if (!y || !m || !d) return new Date(iso);
  return new Date(Date.UTC(y, m - 1, d, 12, 0, 0));
}

/** Monday 00:00 UTC of the calendar week that contains this instant. */
function mondayUtcOfWeekContaining(d: Date): number {
  const t = new Date(d.getTime());
  const y = t.getUTCFullYear();
  const mo = t.getUTCMonth();
  const day = t.getUTCDate();
  const x = new Date(Date.UTC(y, mo, day, 12, 0, 0));
  const monOff = (x.getUTCDay() + 6) % 7;
  x.setUTCDate(x.getUTCDate() - monOff);
  x.setUTCHours(0, 0, 0, 0);
  return x.getTime();
}

/**
 * 1-based plan week: same Monday-indexed week as `startDate` = week 1.
 * Aligns `raceThisWeek` with the generator loop 1…N (not `ceil` weeks from start instant).
 */
export function planWeekForCalendarEvent(startDate: Date, eventDateIso: string): number {
  const t0 = mondayUtcOfWeekContaining(startDate);
  const t1 = mondayUtcOfWeekContaining(parseIsoToUtcNoon(eventDateIso));
  const diffW = Math.floor((t1 - t0) / (7 * 24 * 60 * 60 * 1000)) + 1;
  return Math.max(1, diffW);
}

function addWeeks(date: Date, weeks: number): Date {
  return new Date(date.getTime() + weeks * 7 * 24 * 60 * 60 * 1000);
}

function ceilDiv(a: number, b: number) { return Math.ceil(a / b); }

/** ISO date → weekday name (UTC noon, for stable YYYY-MM-DD parsing). */
export function eventDayNameFromIso(iso: string): string {
  const [y, m, d] = String(iso).split('T')[0].split('-').map(Number);
  if (!y || !m || !d) return 'Sunday';
  const dt = new Date(Date.UTC(y, m - 1, d, 12, 0, 0));
  const names = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  return names[dt.getUTCDay()] ?? 'Sunday';
}

// §6.3  What type of multi-event overlap is this?
export function classifyEventRelationship(gapWeeks: number): EventRelationship['type'] {
  if (gapWeeks > 16) return 'sequential';
  if (gapWeeks > 8)  return 'overlapping';
  if (gapWeeks > 4)  return 'compressed';
  return 'single_peak';
}

// ── Build the full phase timeline from all goals ─────────────────────────────
//
// Returns an ordered array of PhaseBlock objects covering weeks 1…totalWeeks.
// Each block has phase, weekNums, primaryGoalId, isRecovery, tssMultiplier,
// and sportDistribution.
//
// Algorithm follows spec §2.3 Priority Rules and §6.3 Taper Overlap.

export function buildPhaseTimeline(
  goals: GoalInput[],
  startDate: Date,
  athleteState: AthleteState,
): {
  blocks: PhaseBlock[];
  totalWeeks: number;
  raceAnchors: RaceAnchor[];
  /**
   * D-048 — Phase-structure-level trade-offs surfaced when the plan duration or
   * inter-race window forces the engine to silently skip a phase the protocol
   * would normally include (base, rebuild). Caller (index.ts) merges these into
   * the persisted `generation_trade_offs` so the athlete sees the compromise.
   */
  phaseStructureTradeOffs: PlanGenerationTradeOff[];
} {
  const phaseStructureTradeOffs: PlanGenerationTradeOff[] = [];

  // §8.1: capture the GENUINE user-set priority-A tri goal BEFORE the no-A
  // fallback below mutates sortedGoals[0].priority (shared object refs). The
  // chronology guard must fire only on real user misconfiguration, never the
  // synthetic default.
  const isTriGoal = (g: GoalInput) =>
    ['triathlon', 'tri'].includes(String(g.sport || '').toLowerCase());
  const genuineATriId = goals.find((g) => g.priority === 'A' && isTriGoal(g))?.id ?? null;

  // Sort A-priority goals by date, then B, then C
  const priority = { A: 0, B: 1, C: 2 };
  const sortedGoals = [...goals].sort((a, b) => {
    const pd = priority[a.priority] - priority[b.priority];
    if (pd !== 0) return pd;
    return new Date(a.event_date).getTime() - new Date(b.event_date).getTime();
  });

  const aGoals = sortedGoals.filter(g => g.priority === 'A');
  if (aGoals.length === 0) {
    // Treat highest-priority goal as A if none explicitly set
    if (sortedGoals.length > 0) sortedGoals[0].priority = 'A';
    aGoals.push(sortedGoals[0]);
  }

  // Total plan length. EVENT goals: end in the A-race week (Monday-indexed). NON-RACE goals
  // (D-213 Cut 3): no race to count back from — length comes from target_weeks. The non-race branch
  // fires ONLY for EXPLICIT goal_type capacity/maintenance, so event goals (incl. legacy rows with
  // goal_type undefined) keep the exact same path → byte-identical.
  const lastAGoal = aGoals[aGoals.length - 1];
  const lastAIsNonRace = lastAGoal.goal_type === 'capacity' || lastAGoal.goal_type === 'maintenance';
  const aRaceWeek = lastAIsNonRace
    ? (Number.isFinite(Number(lastAGoal.target_weeks)) ? Number(lastAGoal.target_weeks) : 12)
    : planWeekForCalendarEvent(startDate, lastAGoal.event_date);
  const totalWeeks = Math.min(52, Math.max(4, aRaceWeek));

  const blocks: PhaseBlock[] = [];

  // Chronological tri goals (includes B-priority) — two 70.3s must not use “A-only” timeline
  const chronoTri = sortedGoals
    // D-213 Cut 3: exclude EXPLICIT non-race goals — they have no event_date, so raceAnchors (which
    // derefs event_date below) must never see them. Event goals (incl. goal_type undefined) unaffected.
    .filter(g => ['triathlon', 'tri'].includes(String(g.sport || '').toLowerCase())
      && !(g.goal_type === 'capacity' || g.goal_type === 'maintenance'))
    .sort((a, b) => new Date(a.event_date).getTime() - new Date(b.event_date).getTime());

  // §8.1: the A-race is the genuine user priority-A tri; absent that, the
  // chronologically-last tri is the season goal (prior calendar-order behavior).
  const chronoLastTri = chronoTri[chronoTri.length - 1];
  const aTriId = genuineATriId ?? chronoLastTri?.id ?? null;

  const raceAnchors: RaceAnchor[] = chronoTri.map((g) => {
    const pw = planWeekForCalendarEvent(startDate, g.event_date);
    return {
      goalId: g.id,
      eventName: g.event_name,
      eventDate: g.event_date,
      planWeek: pw,
      dayName: eventDayNameFromIso(g.event_date),
      // §8.1: 'A' = the A-race (genuine user priority-A tri, else season-final
      // tri); every other race is 'B' (secondary / raced-through).
      priority: g.id === aTriId ? 'A' : 'B',
    };
  });

  if (chronoTri.length >= 2) {
    // §8.1 (RACE-WEEK-PROTOCOL): A/B is priority-driven, NOT calendar-order.
    // Chronology guard (decision 2026-05-18): if the GENUINE user priority-A
    // race is not the chronologically-last tri race, hard-fail rather than
    // silently mis-plan (a B-race must not fall after the A-race). When the
    // user set no priority-A tri, the season-final tri is the de-facto A
    // (prior calendar-order behavior — no regression, no guard).
    const genuineATri = genuineATriId
      ? chronoTri.find((g) => g.id === genuineATriId)
      : undefined;
    if (genuineATri && genuineATri.id !== chronoLastTri.id) {
      throw new Error(
        `[race-week §8.1] priority-A race "${genuineATri.event_name}" ` +
          `(${genuineATri.event_date}) is not the chronologically-last race ` +
          `("${chronoLastTri.event_name}", ${chronoLastTri.event_date}); a B-race ` +
          `cannot fall after the A-race. Fix goal priorities or event dates.`,
      );
    }
    const g1 = chronoTri[0];
    const g2 = chronoTri.find((g) => g.id === aTriId) ?? chronoTri[1];
    const w1 = planWeekForCalendarEvent(startDate, g1.event_date);
    const w2 = planWeekForCalendarEvent(startDate, g2.event_date);
    if (w1 >= 1 && w2 > w1) {
      // First race: own macrocycle ending week w1
      buildSingleEventBlocks(g1, 1, w1, blocks, athleteState, phaseStructureTradeOffs);
      // Post-race: easy aerobic only
      const recW = recoveryWeeksPostRace(g1.distance, g1.priority);
      const recStart = w1 + 1;
      const recEnd = w1 + recW;
      insertRecoveryBlock(recStart, recEnd, g1.id, blocks, athleteState);
      // §8.2/§8.5 (RACE-WEEK-PROTOCOL): allocate BACKWARD from the A-race. The
      // A-taper is reserved FIRST at its full distance-driven width and is NEVER
      // compressed; ≥1 rebuild week always exists (§8.5); post-B recovery is
      // distance-fixed. Priority: A-taper > rebuild(≥1) > recovery > the
      // abbreviated base/race_specific remainder absorbs whatever is left.
      const aTaperWks = taperWeeks(g2.distance, g2.priority);
      const windowWks = w2 - recEnd; // weeks between recovery end and the A-race
      // Decision A (2026-05-18): if recovery + ≥1 rebuild + the FULL A-taper
      // cannot fit, hard-fail (symmetric with the §8.1 chronology guard) rather
      // than silently shipping a degraded A-race taper.
      if (windowWks < aTaperWks + 1) {
        throw new Error(
          `[race-week §8.2/§8.5] B-race "${g1.event_name}" (${g1.event_date}) is too close ` +
            `to A-race "${g2.event_name}" (${g2.event_date}): only ${windowWks} week(s) ` +
            `between post-B recovery and the A-race, but a protected A-race needs ≥1 ` +
            `rebuild week + a full ${aTaperWks}-week taper. Move the B-race earlier, drop ` +
            `it, or choose a later A-race date.`,
        );
      }
      const maxRebuild = windowWks - aTaperWks; // weeks left after reserving the A-taper
      const rebuildWks = Math.max(
        1, // §8.5: minimum one rebuild week
        Math.min(rebuildWeeksAfterRace(g1.distance, recW, windowWks), maxRebuild), // §8.2: never eat the A-taper
      );
      const rebuildStart = recEnd + 1;
      const rebuildEnd = recEnd + rebuildWks;
      insertRebuildBlock(rebuildStart, rebuildEnd, g2, blocks, athleteState, recW);
      // Second race: abbreviated base/race_specific + the FULL reserved A-taper.
      const secondStart = rebuildEnd + 1;
      if (secondStart <= w2) {
        buildAbbreviatedBlocks(g2, secondStart, w2, blocks, athleteState);
      }
    } else {
      // Overlapping / degenerate dates: single A timeline
      buildSingleEventBlocks(lastAGoal, 1, totalWeeks, blocks, athleteState, phaseStructureTradeOffs);
    }
  } else if (aGoals.length === 1 || classifyEventRelationship(
    weeksUntil(new Date(aGoals[0].event_date), new Date(aGoals[1]?.event_date ?? aGoals[0].event_date))
  ) === 'sequential') {
    // Single A-race or sequential (> 16 weeks apart): each gets its own full cycle
    // D-213 Cut 3: non-race goals have no event_date — pass the branched `totalWeeks`. Events keep the
    // EXACT original (unclamped planWeekForCalendarEvent) so output is byte-identical even at edge dates.
    buildSingleEventBlocks(
      aGoals[0], 1,
      lastAIsNonRace ? totalWeeks : planWeekForCalendarEvent(startDate, aGoals[0].event_date),
      blocks, athleteState, phaseStructureTradeOffs,
      lastAIsNonRace ? 'retest' : 'taper'); // D-213 Cut 4: non-race terminal = retest, events stay taper
    if (aGoals.length > 1) {
      // After first A-race: recovery + new cycle for the second
      const firstRaceWeek = planWeekForCalendarEvent(startDate, aGoals[0].event_date);
      const recoveryWeeks = recoveryWeeksPostRace(aGoals[0].distance, aGoals[0].priority);
      const secondStart = firstRaceWeek + recoveryWeeks + 1;
      const secondEnd   = planWeekForCalendarEvent(startDate, aGoals[1].event_date);
      if (secondStart <= secondEnd) {
        insertRecoveryBlock(firstRaceWeek + 1, firstRaceWeek + recoveryWeeks, aGoals[0].id, blocks, athleteState);
        buildSingleEventBlocks(aGoals[1], secondStart, secondEnd - secondStart + 1, blocks, athleteState, phaseStructureTradeOffs);
      }
    }
  } else if (aGoals.length >= 2) {
    // Sort A-goals by event date (not by priority) for gap math
    const aChrono = [...aGoals].sort(
      (a, b) => new Date(a.event_date).getTime() - new Date(b.event_date).getTime());
    const firstEnd  = planWeekForCalendarEvent(startDate, aChrono[0].event_date);
    const secondEnd = planWeekForCalendarEvent(startDate, aChrono[1].event_date);
    const gapWeeks  = secondEnd - firstEnd;
    const rel       = classifyEventRelationship(gapWeeks);

    if (rel === 'overlapping') {
      // 8–16 week gap: full cycle to first, recovery, rebuild, abbreviated build, taper to second
      buildSingleEventBlocks(aChrono[0], 1, firstEnd, blocks, athleteState, phaseStructureTradeOffs);
      const recWeeks = recoveryWeeksPostRace(aChrono[0].distance, aChrono[0].priority);
      insertRecoveryBlock(firstEnd + 1, firstEnd + recWeeks, aChrono[0].id, blocks, athleteState);
      const recEndA = firstEnd + recWeeks;
      const windowWks = secondEnd - recEndA;
      const rebuildWks = rebuildWeeksAfterRace(aChrono[0].distance, recWeeks, windowWks);
      if (rebuildWks > 0) {
        insertRebuildBlock(recEndA + 1, recEndA + rebuildWks, aChrono[1], blocks, athleteState, recWeeks);
      } else {
        // D-048 POLISH §1 Bug 2 — surface the silent rebuild skip.
        phaseStructureTradeOffs.push({
          kind: 'constraint_compromise',
          severity: 'notice',
          message_template_id: 'rebuild_skipped_tight_window',
          variables: { first_event: aChrono[0].event_name, second_event: aChrono[1].event_name },
        });
      }
      const buildStart = recEndA + rebuildWks + 1;
      buildAbbreviatedBlocks(aChrono[1], buildStart, secondEnd, blocks, athleteState);
    } else if (rel === 'compressed') {
      // 4–8 week gap: shared peak, separate tapers
      buildSharedPeakBlocks(aChrono[0], aChrono[1], 1, firstEnd, secondEnd, blocks, athleteState);
    } else {
      // Tight schedule: one macrocycle to the *later* race is wrong for the *earlier* race
      if (aChrono[0] && aChrono[1] && firstEnd < secondEnd) {
        buildSingleEventBlocks(aChrono[0], 1, firstEnd, blocks, athleteState, phaseStructureTradeOffs);
        const recW = recoveryWeeksPostRace(aChrono[0].distance, aChrono[0].priority);
        const recStart = firstEnd + 1;
        const recEnd = firstEnd + recW;
        insertRecoveryBlock(recStart, recEnd, aChrono[0].id, blocks, athleteState);
        const windowWks = secondEnd - recEnd;
        const rebuildWks = rebuildWeeksAfterRace(aChrono[0].distance, recW, windowWks);
        if (rebuildWks > 0) {
          insertRebuildBlock(recEnd + 1, recEnd + rebuildWks, aChrono[1], blocks, athleteState, recW);
        } else {
          // D-048 POLISH §1 Bug 2 — surface the silent rebuild skip (tight branch).
          phaseStructureTradeOffs.push({
            kind: 'constraint_compromise',
            severity: 'notice',
            message_template_id: 'rebuild_skipped_tight_window',
            variables: { first_event: aChrono[0].event_name, second_event: aChrono[1].event_name },
          });
        }
        const secondStart = recEnd + rebuildWks + 1;
        if (secondStart <= secondEnd) {
          buildAbbreviatedBlocks(aChrono[1], secondStart, secondEnd, blocks, athleteState);
        }
      } else {
        buildSingleEventBlocks(aChrono[1] ?? aGoals[0], 1, secondEnd, blocks, athleteState, phaseStructureTradeOffs);
      }
    }
  }

  // Ensure we have blocks covering all weeks
  fillGaps(blocks, totalWeeks, lastAGoal, athleteState);

  // §8.1 carriage (Phase 1): tag the block covering each race week with that
  // race's A/B priority. Annotation only — no consumer reads it yet (Phase 3).
  for (const a of raceAnchors) {
    const blk = blocks.find((b) => a.planWeek >= b.startWeek && a.planWeek <= b.endWeek);
    if (blk) blk.race_week = a.priority;
  }

  return {
    blocks: blocks.sort((a, b) => a.startWeek - b.startWeek),
    totalWeeks,
    raceAnchors,
    phaseStructureTradeOffs,
  };
}

// ── Phase builder helpers ─────────────────────────────────────────────────────

function buildSingleEventBlocks(
  goal: GoalInput,
  startWeek: number,
  totalWeeks: number,
  blocks: PhaseBlock[],
  as: AthleteState,
  tradeOffs?: PlanGenerationTradeOff[],
  // D-213 Cut 4: the terminal phase shape. 'taper' (race-season, default — events byte-identical) vs
  // 'retest' (non-race develop-and-retest). 'retest' is a valid Phase since Cut 1 (all Record tables).
  terminalShape: 'taper' | 'retest' = 'taper',
) {
  const taperWks  = taperWeeks(goal.distance, goal.priority);
  const approach  = as.tri_approach ?? 'race_peak';
  const dist      = getBaseDistribution(goal.sport, goal.distance, as.limiter_sport as Sport | undefined, as.swim_intent, as.swim_load_source);

  // Phase ratio constants — mirror the standalone triathlon generator's approach logic.
  // base_first: 15% RS (finish-line durability) — more time in base, shorter sharpening.
  // race_peak:  25% RS (standard) — robust race-specific block to move the ceiling.
  const rsPct   = approach === 'base_first' ? 0.15 : 0.25;
  const buildPct = 0.30; // build is the same; extra time flows into base for base_first

  if (totalWeeks < 4) {
    // Just taper + brief race-specific (too short to apply approach ratios)
    pushBlock(blocks, { phase: 'race_specific', startWeek, endWeek: Math.max(startWeek, startWeek + totalWeeks - taperWks - 1), goal, dist, as });
    pushBlock(blocks, { phase: terminalShape, startWeek: startWeek + totalWeeks - taperWks, endWeek: startWeek + totalWeeks - 1, goal, dist, as }); // D-213 Cut 4: terminal shape (taper | retest)
    // D-048 POLISH §1 Bug 1 — surface the silent base+build skip for very short plans.
    if (tradeOffs) {
      tradeOffs.push({
        kind: 'constraint_compromise',
        severity: 'notice',
        message_template_id: 'base_phase_skipped_short_plan',
        variables: { event_name: goal.event_name, plan_weeks: totalWeeks },
      });
    }
    return;
  }

  // Work backwards from race: taper → race-specific → build → base
  const taperStart = startWeek + totalWeeks - taperWks;
  const rsWeeks    = Math.min(6, Math.max(3, Math.floor(totalWeeks * rsPct)));
  const rsStart    = taperStart - rsWeeks;
  const buildWeeks = Math.min(8, Math.max(4, Math.floor(totalWeeks * buildPct)));
  const buildStart = rsStart - buildWeeks;
  const baseStart  = startWeek;

  if (baseStart < buildStart) {
    pushBlockRange(blocks, 'base', baseStart, buildStart - 1, goal, dist, as);
  } else if (tradeOffs) {
    // D-048 POLISH §1 Bug 1 — base squeezed to 0 weeks (e.g. 9-week 70.3 plan
    // with 2wk taper + 3wk RS + 4wk build = 0 base). Surface the compromise.
    tradeOffs.push({
      kind: 'constraint_compromise',
      severity: 'notice',
      message_template_id: 'base_phase_skipped_short_plan',
      variables: { event_name: goal.event_name, plan_weeks: totalWeeks },
    });
  }
  if (buildStart < rsStart) {
    pushBlockRange(blocks, 'build', buildStart, rsStart - 1, goal, dist, as);
  }
  pushBlockRange(blocks, 'race_specific', rsStart, taperStart - 1, goal, dist, as);
  pushBlockRange(blocks, terminalShape, taperStart, startWeek + totalWeeks - 1, goal, dist, as); // D-213 Cut 4: terminal shape (taper | retest)
}

// Base recovery distribution. Focus shifts match the SWIM_FOCUS_SHIFTS table so
// focus athletes preserve proportional budget in recovery weeks too.
const RECOVERY_DIST_BASE         = { run: 0.40, bike: 0.30, swim: 0.20, strength: 0.10 } as const;
const RECOVERY_DIST_FOCUS_SPLIT  = { run: 0.38, bike: 0.26, swim: 0.26, strength: 0.10 } as const; // bike -4%, run -2%
const RECOVERY_DIST_FOCUS_PROT_R = { run: 0.40, bike: 0.24, swim: 0.26, strength: 0.10 } as const; // bike -6%, run unchanged
const RECOVERY_DIST_FOCUS_PROT_B = { run: 0.34, bike: 0.30, swim: 0.26, strength: 0.10 } as const; // run -6%, bike unchanged

function recoveryDistribution(as: AthleteState): Record<string, number> {
  if (as.swim_intent !== 'focus') return { ...RECOVERY_DIST_BASE };
  switch (as.swim_load_source) {
    case 'protect_run':  return { ...RECOVERY_DIST_FOCUS_PROT_R };
    case 'protect_bike': return { ...RECOVERY_DIST_FOCUS_PROT_B };
    default:             return { ...RECOVERY_DIST_FOCUS_SPLIT };
  }
}

function insertRecoveryBlock(
  startWeek: number,
  endWeek: number,
  goalId: string,
  blocks: PhaseBlock[],
  as: AthleteState,
) {
  if (startWeek > endWeek) return;
  const sportDistribution = recoveryDistribution(as);
  for (let w = startWeek; w <= endWeek; w++) {
    blocks.push({
      phase: 'recovery',
      startWeek: w,
      endWeek: w,
      primaryGoalId: goalId,
      isRecovery: true,
      tssMultiplier: 0.5,
      sportDistribution,
      // Running count from the race week. Recovery weeks 1, 2, … (week 1 = first week post-race).
      weeksSinceRaceIncludingRebuild: w - startWeek + 1,
    });
  }
}

/**
 * Number of `rebuild` weeks to emit between a B-race recovery and the next goal's run-in.
 *
 * **Why rebuild exists (architectural):** without an explicit `rebuild` phase, the next goal's
 * `base` (or `race_specific` from `buildAbbreviatedBlocks`) starts at `weekInPhase = 1`, which
 * consumers (strength loads, swim ceilings, long-day floors) read as "first week of base" and
 * silently regress loads to base-week-1 values — causing post-race regressions like Push Press
 * dropping from 105lb to 70lb because the prior peak progression context is lost.
 *
 * **Sizing:** B-race rebuild is 1-2 weeks shaped by race distance and recovery weeks already
 * spent; capped by the available window (must leave ≥1 week for race_specific or taper before
 * the next race). Sprint / Olympic recover faster (1 week); 70.3+ benefit from 2 (full ramp).
 * If recovery already absorbed ≥2 weeks (longer races), shave one rebuild week.
 *
 * Returns 0 when there's no room or no benefit (very short windows go straight to abbreviated).
 */
function rebuildWeeksAfterRace(
  raceDistance: string,
  recoveryWeeksConsumed: number,
  windowWeeks: number,
): number {
  if (windowWeeks < 2) return 0;
  const d = String(raceDistance || '').toLowerCase();
  const desired =
    d === 'sprint' || d === 'olympic' || d === '5k' || d === '10k' ? 1 : 2;
  // Longer recovery already restored fitness — shave rebuild proportionally (but keep ≥1 week
  // when desired > 0).
  const adjusted = Math.max(1, desired - Math.max(0, recoveryWeeksConsumed - 1));
  // Always preserve at least one week for race_specific or taper.
  return Math.max(0, Math.min(adjusted, windowWeeks - 1));
}

/**
 * Insert `rebuild` weeks for the upcoming goal between a recovery block and the next macrocycle.
 * Mirrors `insertRecoveryBlock` shape — one row per week (ADR 0002). Each rebuild row carries:
 *   - `phase: 'rebuild'`, `primaryGoalId: <next goal>`, `isRecovery: false`
 *   - `tssMultiplier: 0.85` (matches `longRunFloorMiles` / `longRideFloorHours` rebuild multiplier
 *     so anchor sessions don't get inflated relative to the floor)
 *   - `weeksSinceRaceIncludingRebuild` continuing the recovery count
 *   - `weekInPhase` is computed at runtime by `weekInPhaseForTimeline` (returns 1, 2 within the
 *     consecutive rebuild block — drives the strength +5%/week ramp without touching counter math)
 */
function insertRebuildBlock(
  startWeek: number,
  endWeek: number,
  nextGoal: GoalInput,
  blocks: PhaseBlock[],
  as: AthleteState,
  recoveryWeeksConsumed: number,
) {
  if (startWeek > endWeek) return;
  // Sport distribution shifts toward the next goal so the ramp is sport-correct (e.g., a tri
  // rebuild after a half-marathon B-race uses tri distribution, not run-only).
  const dist = getBaseDistribution(
    nextGoal.sport,
    nextGoal.distance,
    as.limiter_sport as Sport | undefined,
    as.swim_intent,
    as.swim_load_source,
  );
  for (let w = startWeek; w <= endWeek; w++) {
    blocks.push({
      phase: 'rebuild',
      startWeek: w,
      endWeek: w,
      primaryGoalId: nextGoal.id,
      isRecovery: false,
      tssMultiplier: 0.85,
      sportDistribution: dist,
      // Continue the count so a consumer reading this field sees a monotonically increasing
      // "weeks past the race" tag across recovery → rebuild.
      weeksSinceRaceIncludingRebuild: recoveryWeeksConsumed + (w - startWeek + 1),
    });
  }
}

function buildAbbreviatedBlocks(
  goal: GoalInput,
  startWeek: number,
  endWeek: number,
  blocks: PhaseBlock[],
  as: AthleteState,
) {
  // Post–B-race A-race segment: no heavy `build` (threshold/VO2 peaks). Base + race-specific + taper only.
  const totalWeeks = endWeek - startWeek + 1;
  if (totalWeeks < 1) return;
  const dist = getBaseDistribution(goal.sport, goal.distance, as.limiter_sport as Sport | undefined, as.swim_intent, as.swim_load_source);
  // §8.2 (RACE-WEEK-PROTOCOL): the A-taper is the FULL distance-driven width and is
  // never compressed. The two-tri handoff reserves it (and hard-fails if recovery +
  // ≥1 rebuild + this taper cannot fit). If a window shorter than the taper ever
  // reaches here (the sequential-A callers), the `preTaperEnd < startWeek`
  // early-return below makes the WHOLE window a taper — base/race_specific absorb,
  // never the taper. (Behaviorally identical to the prior Math.min(): when
  // totalWeeks ≥ taperWeeks both give taperWeeks; when shorter both hit the
  // early-return. The Math.min was redundant with that guard.)
  const taperWks = taperWeeks(goal.distance, goal.priority);
  const taperStartWeek = endWeek - taperWks + 1;
  const preTaperEnd = taperStartWeek - 1;
  if (preTaperEnd < startWeek) {
    pushBlockRange(blocks, 'taper', startWeek, endWeek, goal, dist, as);
    return;
  }
  const preTaperWeeks = preTaperEnd - startWeek + 1;
  const rsWks = Math.min(3, Math.max(1, Math.floor(preTaperWeeks * 0.4)));
  const rsStartWeek = preTaperEnd - rsWks + 1;
  if (startWeek < rsStartWeek) {
    pushBlockRange(blocks, 'base', startWeek, rsStartWeek - 1, goal, dist, as);
  }
  if (rsStartWeek <= preTaperEnd) {
    pushBlockRange(blocks, 'race_specific', rsStartWeek, preTaperEnd, goal, dist, as);
  }
  pushBlockRange(blocks, 'taper', taperStartWeek, endWeek, goal, dist, as);
}

function buildSharedPeakBlocks(
  g1: GoalInput, g2: GoalInput,
  startWeek: number, g1Week: number, g2Week: number,
  blocks: PhaseBlock[], as: AthleteState,
) {
  const taper1 = taperWeeks(g1.distance, g1.priority);
  const taper2 = taperWeeks(g2.distance, g2.priority);
  const dist1  = getBaseDistribution(g1.sport, g1.distance, as.limiter_sport as Sport | undefined, as.swim_intent, as.swim_load_source);

  const rsStart = Math.max(startWeek, g1Week - taper1 - 4);
  if (startWeek < rsStart) pushBlockRange(blocks, 'base',  startWeek, rsStart - 1, g1, dist1, as);
  pushBlockRange(blocks, 'build',         rsStart,      g1Week - taper1 - 1, g1, dist1, as);
  pushBlockRange(blocks, 'race_specific', g1Week - taper1, g1Week - taper1 - 1 + taper1, g1, dist1, as);
  pushBlockRange(blocks, 'taper',         g1Week - taper1, g1Week - 1, g1, dist1, as);
  insertRecoveryBlock(g1Week + 1, g1Week + 1, g1.id, blocks, as); // 1-week recovery
  const dist2 = getBaseDistribution(g2.sport, g2.distance, as.limiter_sport as Sport | undefined, as.swim_intent, as.swim_load_source);
  pushBlockRange(blocks, 'build', g1Week + 2, g2Week - taper2 - 1, g2, dist2, as);
  pushBlockRange(blocks, 'taper', g2Week - taper2, g2Week - 1, g2, dist2, as);
}

// ── Mesocycle recovery-week insertion ────────────────────────────────────────
// Applies 3:1 / 2:1 / 1:1 loading pattern to existing build/base/rs blocks.
//
// D-061 / Item 1 — '1:1' added to support `training_intent: 'first_race'`
// (every-2nd-week recovery for conservative ramps). Helper
// `loadingPatternForIntent` derives the pattern from training_intent when set,
// overriding the athlete's `loading_pattern` field. See generate-combined-plan/index.ts.
export function applyLoadingPattern(blocks: PhaseBlock[], pattern: '3:1' | '2:1' | '1:1'): PhaseBlock[] {
  const blockSize = pattern === '3:1' ? 4 : pattern === '2:1' ? 3 : 2;
  const result: PhaseBlock[] = [];

  let weekInBlock = 1;
  for (const b of blocks.sort((a, x) => a.startWeek - x.startWeek)) {
    // Rebuild has its own internal ramp (strength reads weekInPhase for +5%/wk; long-day floors
    // read phase=rebuild for the 0.85 multiplier). Do not impose a 3:1/2:1 deload on top.
    if (b.phase === 'taper' || b.phase === 'recovery' || b.phase === 'rebuild') {
      result.push(b);
      weekInBlock = 1;
      continue;
    }
    const mult = blockWeekMultiplier(weekInBlock, pattern);
    const isRecovery = weekInBlock === blockSize;
    result.push({ ...b, tssMultiplier: mult, isRecovery: isRecovery || b.isRecovery });
    weekInBlock = weekInBlock >= blockSize ? 1 : weekInBlock + 1;
  }
  return result;
}

/**
 * D-061 / Item 1 — Loading-pattern selection from `training_intent`.
 *
 * Wires the wizard's three-way training_intent choice into the engine's
 * recovery cadence so the wizard promise matches engine reality (closes
 * the D-055 wizard-vs-engine differentiation gap for the recovery axis).
 *
 * Rules:
 *   performance → keep athlete's chosen loading_pattern (default '3:1'),
 *                 every-4th-week recovery
 *   completion  → force '2:1' — every-3rd-week recovery (matches the
 *                 legacy tri-generator's intent==='completion' path)
 *   first_race  → force '1:1' — every-2nd-week recovery (matches the
 *                 legacy tri-generator's intent==='first_race' path;
 *                 conservative ramp)
 *   comeback    → same as first_race ('1:1' — conservative ramp)
 *
 * The override is intent-driven, not athlete-pin-driven, so a `first_race`
 * athlete who pinned `loading_pattern: '3:1'` still gets the conservative
 * '1:1' cadence appropriate to their intent. This matches D-055's
 * wizard-copy-to-engine-reality alignment for `tri_approach`.
 */
export function loadingPatternForIntent(
  trainingIntent: string | null | undefined,
  athletePattern: '3:1' | '2:1' | '1:1' | null | undefined,
): '3:1' | '2:1' | '1:1' {
  const intent = String(trainingIntent ?? '').toLowerCase();
  if (intent === 'completion') return '2:1';
  if (intent === 'first_race' || intent === 'comeback') return '1:1';
  // performance (and any unknown intent) → athlete's pattern or default 3:1
  return athletePattern ?? '3:1';
}

// ── Utility pushers ───────────────────────────────────────────────────────────

function pushBlock(
  blocks: PhaseBlock[],
  args: { phase: Phase; startWeek: number; endWeek: number; goal: GoalInput; dist: Record<Sport, number>; as: AthleteState },
) {
  const { phase, startWeek, endWeek, goal, dist } = args;
  if (startWeek > endWeek) return;
  blocks.push({
    phase,
    startWeek,
    endWeek,
    primaryGoalId: goal.id,
    isRecovery: false,
    tssMultiplier:
      phase === 'taper' ? 0.65 :
      phase === 'recovery' ? 0.45 :
      phase === 'rebuild' ? 0.85 :
      1.0,
    sportDistribution: dist,
  });
}

function pushBlockRange(
  blocks: PhaseBlock[],
  phase: Phase,
  startWeek: number,
  endWeek: number,
  goal: GoalInput,
  dist: Record<Sport, number>,
  as: AthleteState,
) {
  if (startWeek > endWeek) return;
  for (let w = startWeek; w <= endWeek; w++) {
    const isRecovery = phase === 'recovery';
    const tssM = phase === 'taper' ? Math.max(0.45, 1.0 - (w - startWeek) * 0.10)
               : phase === 'recovery' ? 0.45
               : phase === 'rebuild' ? 0.85
               : 1.0;
    blocks.push({
      phase,
      startWeek: w,
      endWeek: w,
      primaryGoalId: goal.id,
      isRecovery,
      tssMultiplier: tssM,
      sportDistribution: dist,
    });
  }
}

// Fill any week gaps with base-phase blocks.
function fillGaps(blocks: PhaseBlock[], totalWeeks: number, primaryGoal: GoalInput, as: AthleteState) {
  const covered = new Set<number>();
  for (const b of blocks) {
    for (let w = b.startWeek; w <= b.endWeek; w++) covered.add(w);
  }
  const dist = getBaseDistribution(primaryGoal.sport, primaryGoal.distance, as.limiter_sport as Sport | undefined, as.swim_intent, as.swim_load_source);
  for (let w = 1; w <= totalWeeks; w++) {
    if (!covered.has(w)) {
      blocks.push({ phase: 'base', startWeek: w, endWeek: w, primaryGoalId: primaryGoal.id, isRecovery: false, tssMultiplier: 1.0, sportDistribution: dist });
    }
  }
}

// Get the PhaseBlock for a specific week number.
export function blockForWeek(blocks: PhaseBlock[], weekNum: number): PhaseBlock {
  return blocks.find(b => b.startWeek <= weekNum && b.endWeek >= weekNum)
    ?? blocks.find(b => b.startWeek === weekNum)
    ?? blocks[blocks.length - 1];
}
