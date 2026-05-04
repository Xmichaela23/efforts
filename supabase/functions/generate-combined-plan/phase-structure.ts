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
): { blocks: PhaseBlock[]; totalWeeks: number; raceAnchors: RaceAnchor[] } {

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

  // Total plan length: end in the A-race week (Monday-indexed week = week 1 containing start)
  const lastAGoal = aGoals[aGoals.length - 1];
  const aRaceWeek = planWeekForCalendarEvent(startDate, lastAGoal.event_date);
  const totalWeeks = Math.min(52, Math.max(4, aRaceWeek));

  const blocks: PhaseBlock[] = [];

  // Chronological tri goals (includes B-priority) — two 70.3s must not use “A-only” timeline
  const chronoTri = sortedGoals
    .filter(g => ['triathlon', 'tri'].includes(String(g.sport || '').toLowerCase()))
    .sort((a, b) => new Date(a.event_date).getTime() - new Date(b.event_date).getTime());

  const raceAnchors: RaceAnchor[] = chronoTri.map((g) => {
    const pw = planWeekForCalendarEvent(startDate, g.event_date);
    return {
      goalId: g.id,
      eventName: g.event_name,
      eventDate: g.event_date,
      planWeek: pw,
      dayName: eventDayNameFromIso(g.event_date),
    };
  });

  if (chronoTri.length >= 2) {
    const g1 = chronoTri[0];
    const g2 = chronoTri[1];
    const w1 = planWeekForCalendarEvent(startDate, g1.event_date);
    const w2 = planWeekForCalendarEvent(startDate, g2.event_date);
    if (w1 >= 1 && w2 > w1) {
      // First race: own macrocycle ending week w1
      buildSingleEventBlocks(g1, 1, w1, blocks, athleteState);
      // Post-race: easy aerobic only
      const recW = recoveryWeeksPostRace(g1.distance, g1.priority);
      const recStart = w1 + 1;
      const recEnd = w1 + recW;
      insertRecoveryBlock(recStart, recEnd, g1.id, blocks, athleteState);
      // Second race: build + taper in remaining weeks (no quality after w1 in this plan)
      const secondStart = recEnd + 1;
      if (secondStart <= w2) {
        buildAbbreviatedBlocks(g2, secondStart, w2, blocks, athleteState);
      }
    } else {
      // Overlapping / degenerate dates: single A timeline
      buildSingleEventBlocks(lastAGoal, 1, totalWeeks, blocks, athleteState);
    }
  } else if (aGoals.length === 1 || classifyEventRelationship(
    weeksUntil(new Date(aGoals[0].event_date), new Date(aGoals[1]?.event_date ?? aGoals[0].event_date))
  ) === 'sequential') {
    // Single A-race or sequential (> 16 weeks apart): each gets its own full cycle
    buildSingleEventBlocks(
      aGoals[0], 1, planWeekForCalendarEvent(startDate, aGoals[0].event_date), blocks, athleteState);
    if (aGoals.length > 1) {
      // After first A-race: recovery + new cycle for the second
      const firstRaceWeek = planWeekForCalendarEvent(startDate, aGoals[0].event_date);
      const recoveryWeeks = recoveryWeeksPostRace(aGoals[0].distance, aGoals[0].priority);
      const secondStart = firstRaceWeek + recoveryWeeks + 1;
      const secondEnd   = planWeekForCalendarEvent(startDate, aGoals[1].event_date);
      if (secondStart <= secondEnd) {
        insertRecoveryBlock(firstRaceWeek + 1, firstRaceWeek + recoveryWeeks, aGoals[0].id, blocks, athleteState);
        buildSingleEventBlocks(aGoals[1], secondStart, secondEnd - secondStart + 1, blocks, athleteState);
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
      // 8–16 week gap: full cycle to first, recovery, abbreviated build, taper to second
      buildSingleEventBlocks(aChrono[0], 1, firstEnd, blocks, athleteState);
      const recWeeks = recoveryWeeksPostRace(aChrono[0].distance, aChrono[0].priority);
      insertRecoveryBlock(firstEnd + 1, firstEnd + recWeeks, aChrono[0].id, blocks, athleteState);
      const buildStart = firstEnd + recWeeks + 1;
      buildAbbreviatedBlocks(aChrono[1], buildStart, secondEnd, blocks, athleteState);
    } else if (rel === 'compressed') {
      // 4–8 week gap: shared peak, separate tapers
      buildSharedPeakBlocks(aChrono[0], aChrono[1], 1, firstEnd, secondEnd, blocks, athleteState);
    } else {
      // Tight schedule: one macrocycle to the *later* race is wrong for the *earlier* race
      if (aChrono[0] && aChrono[1] && firstEnd < secondEnd) {
        buildSingleEventBlocks(aChrono[0], 1, firstEnd, blocks, athleteState);
        const recW = recoveryWeeksPostRace(aChrono[0].distance, aChrono[0].priority);
        const recStart = firstEnd + 1;
        const recEnd = firstEnd + recW;
        insertRecoveryBlock(recStart, recEnd, aChrono[0].id, blocks, athleteState);
        const secondStart = recEnd + 1;
        if (secondStart <= secondEnd) {
          buildAbbreviatedBlocks(aChrono[1], secondStart, secondEnd, blocks, athleteState);
        }
      } else {
        buildSingleEventBlocks(aChrono[1] ?? aGoals[0], 1, secondEnd, blocks, athleteState);
      }
    }
  }

  // Ensure we have blocks covering all weeks
  fillGaps(blocks, totalWeeks, lastAGoal, athleteState);

  return { blocks: blocks.sort((a, b) => a.startWeek - b.startWeek), totalWeeks, raceAnchors };
}

// ── Phase builder helpers ─────────────────────────────────────────────────────

function buildSingleEventBlocks(
  goal: GoalInput,
  startWeek: number,
  totalWeeks: number,
  blocks: PhaseBlock[],
  as: AthleteState,
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
    pushBlock(blocks, { phase: 'taper', startWeek: startWeek + totalWeeks - taperWks, endWeek: startWeek + totalWeeks - 1, goal, dist, as });
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
  }
  if (buildStart < rsStart) {
    pushBlockRange(blocks, 'build', buildStart, rsStart - 1, goal, dist, as);
  }
  pushBlockRange(blocks, 'race_specific', rsStart, taperStart - 1, goal, dist, as);
  pushBlockRange(blocks, 'taper', taperStart, startWeek + totalWeeks - 1, goal, dist, as);
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
  // Use as many taper weeks as the distance requires, up to the full available window.
  // Math.floor(totalWeeks * 0.45) would give 0 for a 2-week window (floors 0.9 → 0),
  // leaving week 19 as race_specific and firing VO2max 1 week before an A-race.
  // Correct behavior: if fewer weeks are available than the distance calls for, taper all of them.
  const taperWks = Math.min(taperWeeks(goal.distance, goal.priority), totalWeeks);
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
// Applies 3:1 or 2:1 loading pattern to existing build/base/rs blocks.
export function applyLoadingPattern(blocks: PhaseBlock[], pattern: '3:1' | '2:1'): PhaseBlock[] {
  const blockSize = pattern === '3:1' ? 4 : 3;
  const result: PhaseBlock[] = [];

  let weekInBlock = 1;
  for (const b of blocks.sort((a, x) => a.startWeek - x.startWeek)) {
    if (b.phase === 'taper' || b.phase === 'recovery') {
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
    tssMultiplier: phase === 'taper' ? 0.65 : phase === 'recovery' ? 0.45 : 1.0,
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
