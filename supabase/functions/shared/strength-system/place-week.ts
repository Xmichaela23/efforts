// ============================================================================
// PLACING THE LIFTING WEEK AROUND THE ATHLETE'S ENDURANCE ABSOLUTES.
//
// Michael, 2026-07-25: *"we build around them, that's the whole point — we need strength to build
// around their endurance absolutes, be it a club ride, club run, and their long rides and runs."*
//
// The endurance pins are the SKELETON. A long run is Sunday because that is when they run long; a
// club ride is Wednesday because that is when the club rides. Daylight, weather and other people
// decide those. The four lifting days are solved into what is left.
//
// This inverts the previous composer, where the grid was hardcoded Mon/Tue/Thu/Fri and the long run
// was permitted to be Saturday or Sunday and nothing else.
//
// ── ⛔ WHY THIS IS NOT `_shared/week-optimizer.ts` ────────────────────────────────────────────────
//
// The optimizer is the sole authority on placement for race and combined plans, and the instinct
// (correctly) is not to build a second one. Two facts made that the wrong move here:
//
//   1. **It cannot represent this week.** `WeekOptimizerInputs.preferences.strength_frequency` is
//      typed `1 | 2 | 3` (week-optimizer.ts:159). Strength Focus is FOUR lifting days. Widening that
//      type changes the input contract every race plan flows through.
//   2. **It has no immovable pin.** Every anchor it takes is a preference it may overrule — a club
//      ride day gets relocated with a logged trade-off. An absolute is the opposite of that.
//
// What is NOT duplicated is the LAW. The clearance rules come from
// `_shared/schedule-session-constraints.ts` — the same table the optimizer reads. If a clearance
// changes it changes once and both engines follow. Duplicating those constants here is the mistake
// this comment exists to prevent.
// ============================================================================

import {
  type MatrixSessionKind,
  requiredAdjacencyHours,
} from '../../_shared/schedule-session-constraints.ts';

export type DayName =
  | 'Monday' | 'Tuesday' | 'Wednesday' | 'Thursday' | 'Friday' | 'Saturday' | 'Sunday';

export const DAYS: DayName[] = [
  'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday',
];

/**
 * An endurance session the athlete does not move.
 *
 * `canSplitDay` is the load-bearing field and it must be ASKED, never assumed. See `MIN_STACK_GAP_H`.
 */
export type EndurancePin = {
  day: DayName;
  /** What it does to the legs. Drives the clearance a lifting day needs from it. */
  kind: MatrixSessionKind;
  /** Athlete-facing label, so the plan can name what it placed around. */
  label: string;
  /**
   * ⛔ Can the athlete run this day as AM and PM sessions at least six hours apart?
   *
   * **Undefined is NOT "yes".** A pin is only eligible to carry a lifting session when this is
   * explicitly true — see `MIN_STACK_GAP_H` for why assuming it is the one thing the evidence says
   * makes the athlete weaker.
   */
  canSplitDay?: boolean;
};

/**
 * ⛔ SIX HOURS, AND THE REASON IS THE WHOLE SAFEGUARD.
 *
 * Robineau 2016 (n=58, 7 weeks) is the only trial that tested this directly. **Zero hours between
 * lifting and endurance produced lower strength gains** (half-squat 1RM +16.8% at 0h vs +31.2% at 6h
 * and +25.9% at 24h). So a stacked day is safe *because of the gap* — and a stacked day without one
 * is not a compromise, it is the single worst arm of the only study on the question.
 *
 * ⛔ CORRECTED 2026-07-26 — this comment said "six hours and twenty-four hours performed the same as
 * each other." That is true for the STRENGTH outcome and FALSE for the aerobic one. **VO2peak change
 * was higher at 24h than at both 0h and 6h**, and the authors call 0h — and to a lesser extent
 * twice-daily 6h training — not optimal for neuromuscular AND aerobic improvement.
 * ⛔ SO: 24h IS THE TARGET. 6h IS THE FALLBACK. They are not equivalent.
 * ⚠️ MIN_STACK_GAP_H STAYS AT 6 — it is the floor that makes a stacked day survivable when the
 * athlete cannot split any further, not the arrangement to aim for. A scheduler that treats 6h as
 * equal to 24h will stack by preference and quietly cost the aerobic side.
 * (Schumann 2022 agrees on the strength axis: attenuation p=0.043 same-session, n.s. at ≥3h.)
 *
 * Which is why the intake has to ASK whether the day can be split, rather than infer it from the
 * fact that the athlete accepted a stack. Most people cannot split a weekday. Offering the stack
 * without the gap would be worse than not offering it, because the app would appear to have
 * sanctioned it.
 *
 * (History: an earlier version of this project's docs carried 24h as a hard rule. That was wrong —
 * 24h was Wendler's recommendation before *important* sessions, not Robineau's floor. The tighter
 * number distorted the whole scheduling argument. Do not reinstate it.)
 */
export const MIN_STACK_GAP_H = 6;

/**
 * Six days of work, one full rest day. Everything about the resolution below is this number.
 *
 * The arithmetic is deliberately the ONLY argument the athlete is given: fixed endurance days plus
 * four separate lifting days is more than seven, and seven is all there is. No contested physiology,
 * nothing a coach can dispute. (An earlier draft justified this with an interference claim that this
 * repo's own citation register had already struck — Schumann 2022 found no interference for maximal
 * strength or size. Arithmetic needs no citation.)
 */
export const MAX_ACTIVE_DAYS = 6;

export type LiftSlot = {
  lift: string;
  isLower: boolean;
  day: DayName;
  /** Present when this lift shares its day with a pinned endurance session. */
  stackedWith?: { label: string; gapHours: number };
};

/** What the intake must resolve before a week can be built. */
export type StackResolution = {
  /** Fixed endurance days + lifting days. */
  activeSessions: number;
  /** How many lifting sessions must share a day to protect one full rest day. 0 = nothing to ask. */
  stacksRequired: number;
  /** Pins the athlete said they can split. Only these can carry a lift. */
  eligiblePins: EndurancePin[];
  /** True when `stacksRequired` exceeds the pins they can actually split. */
  unresolvable: boolean;
};

export type PlacedWeek = {
  slots: LiftSlot[];
  /** Days carrying neither a lift nor a pin — where easy endurance goes. */
  freeDays: DayName[];
  /** Days with nothing at all. */
  restDays: DayName[];
  resolution: StackResolution;
  /**
   * Every clearance that could not be honoured, in plain words. ⛔ NEVER SILENTLY SWALLOWED — a week
   * that had to break a rule must say which one. Quietly producing a worse plan is how a scheduler
   * loses trust, and the athlete's own pins can make a clean week impossible.
   */
  compromises: string[];
};

const dayIndex = (d: DayName): number => DAYS.indexOf(d);

/** Days between two weekdays, wrapping the week — Sunday to Monday is 1, not 6. */
function gapDays(a: DayName, b: DayName): number {
  const raw = Math.abs(dayIndex(a) - dayIndex(b));
  return Math.min(raw, 7 - raw);
}

/**
 * Hours of clearance a LOWER-BODY lifting day needs from a pinned endurance session.
 *
 * Straight from `SCHEDULING-RULES.md` §4.2/§4.3 via the shared kind lists, so a change to the law
 * lands here without an edit:
 *   long ride / long run       → 48h  (glycogen depletion + muscle damage on top of the signalling window)
 *   quality ride / quality run → 24h  (same prime movers loaded at intensity)
 *   easy anything              → 0h   (an easy run stacks with lifting; lift first)
 *
 * ⛔ UPPER-BODY DAYS NEED NONE OF THIS, and that is not a convenience — it is why the stacked lift is
 * always a press or a bench. The constraint is about SHARED PRIME MOVERS. Pressing does not compete
 * with running legs, so an upper day beside a hard run costs nothing, where a squat day costs a lot.
 * The engine is not being generous when it picks the upper lift to stack; it is picking the only one
 * that is free. Say so in the copy — the athlete should know why it is safe.
 */
export function requiredClearanceHours(kind: MatrixSessionKind): number {
  // 2026-07-27: was two `includes` checks against LEG_LONG_KINDS / LEG_QUALITY_KINDS. Those lists
  // are LOWER-BODY-RELATIVE BY ACCIDENT — they only ever answered "how far from a lift", which is
  // the one row of a grid that has seven. This now reads that row OUT of the adjacency table, so
  // there is one authority instead of a list that can drift from it. Same answers, one source.
  return requiredAdjacencyHours('lower_body_strength', kind);
}

function clearanceHours(liftDay: DayName, pin: EndurancePin): number {
  return gapDays(liftDay, pin.day) * 24;
}

/** How badly a LOWER day on this candidate would violate the pins. 0 = clean. */
function lowerDayPenalty(candidate: DayName, pins: EndurancePin[]): number {
  let penalty = 0;
  for (const pin of pins) {
    const required = requiredClearanceHours(pin.kind);
    if (required === 0) continue;
    const actual = clearanceHours(candidate, pin);
    if (actual < required) penalty += (required - actual);
  }
  return penalty;
}

/**
 * THE ARITHMETIC, run before the athlete sees anything.
 *
 * `stacksRequired = (pins + lifting days) − 6`. Two pins and four lifts is six active days, so a rest
 * day already exists and the athlete is never asked. Three pins needs one stack; four needs two. The
 * resolution screen fires only when the maths demands it, and asks for as many stacks as it demands
 * — asking once and calling it done is how someone with four pins ends up with no rest day anyway.
 */
export function resolveStacking(
  pins: EndurancePin[],
  liftCount: number,
): StackResolution {
  const activeSessions = pins.length + liftCount;
  const stacksRequired = Math.max(0, activeSessions - MAX_ACTIVE_DAYS);
  // Only a day the athlete said they can split may carry a lift. Undefined is not consent.
  const eligiblePins = pins.filter((p) => p.canSplitDay === true);
  return {
    activeSessions,
    stacksRequired,
    eligiblePins,
    unresolvable: stacksRequired > eligiblePins.length,
  };
}

/**
 * Solve the lifting week.
 *
 * Order of operations is the design:
 *   1. Pins come out of the candidate pool first. They are absolutes.
 *   2. STACKS are assigned next, and always to UPPER lifts — the only ones that do not share prime
 *      movers with a leg-loaded endurance session.
 *   3. The remaining LOWER days are placed on what is furthest from leg-loaded pins. They are the
 *      constrained ones; placing the free upper days first would strand them.
 *   4. Lower days are also held apart from each other — heavy legs never run back to back.
 *   5. Remaining upper days take what is left, spread as evenly as possible.
 *
 * ⚠️ A lift keeps its day for the whole block. 5/3/1 runs the same lift on the same day every week
 * and the athlete should never have to look up which day squats are on.
 */
export function placeLiftingWeek(
  lifts: Array<{ lift: string; isLower: boolean }>,
  pins: EndurancePin[],
): PlacedWeek {
  const compromises: string[] = [];
  const resolution = resolveStacking(pins, lifts.length);
  const pinnedDays = new Set(pins.map((p) => p.day));

  // ── 2. Stacks: upper lifts onto splittable pinned days ───────────────────────────────────────
  const upperLifts = lifts.filter((l) => !l.isLower);
  const lowerLifts = lifts.filter((l) => l.isLower);
  const stackCount = Math.min(resolution.stacksRequired, resolution.eligiblePins.length, upperLifts.length);
  // Cheapest first: the lightest pin carries the lift. A quality session is a smaller day than a long
  // one, so stacking onto it costs the athlete less than stacking onto their long run.
  const stackTargets = [...resolution.eligiblePins]
    .sort((a, b) => requiredClearanceHours(a.kind) - requiredClearanceHours(b.kind))
    .slice(0, stackCount);

  const stackedByLift = new Map<string, EndurancePin>();
  stackTargets.forEach((pin, i) => {
    const lift = upperLifts[i];
    if (lift) stackedByLift.set(lift.lift, pin);
  });

  if (resolution.unresolvable) {
    // ⛔ The honest arithmetic choice, not an error and not an override button. The athlete owns it.
    compromises.push(
      `${pins.length} fixed endurance days and ${lifts.length} lifting days is ${resolution.activeSessions} active days. ` +
      `Protecting one full rest day needs ${resolution.stacksRequired} stacked day${resolution.stacksRequired === 1 ? '' : 's'}, ` +
      `and ${resolution.eligiblePins.length} of the fixed days can be split into AM and PM at least ${MIN_STACK_GAP_H}h apart. ` +
      `Either one lifting day comes out, or the week runs with no full rest day.`,
    );
  }

  // Days still open for a lift that is NOT stacked.
  let candidates = DAYS.filter((d) => !pinnedDays.has(d));
  const unstackedCount = lifts.length - stackedByLift.size;
  if (candidates.length < unstackedCount) {
    compromises.push(
      `${pins.length} fixed endurance days leaves ${candidates.length} open for ${unstackedCount} unstacked lifting days.`,
    );
    candidates = DAYS.slice();
  }

  // ── 3 + 4. Lower days: cleanest first, then held apart from each other ───────────────────────
  const lowerDays: DayName[] = [];
  for (const _ of lowerLifts) {
    const ranked = candidates
      .filter((d) => !lowerDays.includes(d))
      .map((d) => ({
        day: d,
        penalty: lowerDayPenalty(d, pins) + lowerDays.reduce(
          // Two heavy leg days back to back is its own problem, independent of any endurance session.
          (acc, other) => acc + Math.max(0, 48 - gapDays(d, other) * 24),
          0,
        ),
        /**
         * ⛔ MORE THAN THE MINIMUM IS BETTER, AND THE PENALTY ALONE CANNOT SAY SO.
         *
         * `max(0, 48 - gap)` goes to zero at 48h and stays there — so 48h and 72h TIE, and the
         * `dayIndex` tiebreak below then picks the earlier day. With no pins that produced lower
         * days on Monday and Wednesday: legal, minimum, and worse than the hardcoded grid it
         * replaced, which gave Tuesday/Friday at 72h.
         *
         * The solver was not wrong — it was obedient. It was told "at least 48" and it delivered
         * exactly 48. Wanting daylight past the floor has to be said out loud.
         *
         * Ranked AFTER `penalty`, so this never buys spread by breaking a real clearance: it only
         * decides between arrangements the rules already accept. Same shape as the upper-day
         * placement below, which has always maximised spread.
         */
        spread: lowerDays.length === 0
          ? 0
          : Math.min(...lowerDays.map((other) => gapDays(d, other))),
      }))
      .sort((a, b) => a.penalty - b.penalty || b.spread - a.spread || dayIndex(a.day) - dayIndex(b.day));
    if (ranked.length === 0) break;
    lowerDays.push(ranked[0].day);
  }

  for (const day of lowerDays) {
    for (const pin of pins) {
      const required = requiredClearanceHours(pin.kind);
      if (required === 0) continue;
      const actual = clearanceHours(day, pin);
      if (actual < required) {
        compromises.push(
          `${day}'s heavy lower-body work sits ${actual}h from ${pin.label} (${pin.day}); the clearance for that is ${required}h.`,
        );
      }
    }
  }

  // ── 5. Remaining upper days ──────────────────────────────────────────────────────────────────
  const remaining = candidates.filter((d) => !lowerDays.includes(d));
  const upperDays: DayName[] = [];
  const unstackedUpper = upperLifts.filter((l) => !stackedByLift.has(l.lift));
  for (const _ of unstackedUpper) {
    const ranked = remaining
      .filter((d) => !upperDays.includes(d))
      .map((d) => ({
        day: d,
        spread: Math.min(...[...lowerDays, ...upperDays].map((o) => gapDays(d, o)), 7),
      }))
      .sort((a, b) => b.spread - a.spread || dayIndex(a.day) - dayIndex(b.day));
    if (ranked.length === 0) break;
    upperDays.push(ranked[0].day);
  }

  const lowerQueue = [...lowerDays].sort((a, b) => dayIndex(a) - dayIndex(b));
  const upperQueue = [...upperDays].sort((a, b) => dayIndex(a) - dayIndex(b));
  const slots: LiftSlot[] = lifts.map((l) => {
    const stacked = stackedByLift.get(l.lift);
    if (stacked) {
      return {
        lift: l.lift,
        isLower: l.isLower,
        day: stacked.day,
        stackedWith: { label: stacked.label, gapHours: MIN_STACK_GAP_H },
      };
    }
    return {
      lift: l.lift,
      isLower: l.isLower,
      day: (l.isLower ? lowerQueue.shift() : upperQueue.shift()) ?? DAYS[0],
    };
  });

  const used = new Set<DayName>([...slots.map((s) => s.day), ...pinnedDays]);
  const restDays = DAYS.filter((d) => !used.has(d));
  const freeDays = DAYS.filter((d) => !slots.some((s) => s.day === d) && !pinnedDays.has(d));

  if (restDays.length === 0 && !resolution.unresolvable) {
    compromises.push('Every day carries work — no full rest day survived once the fixed sessions and the lifting days were placed.');
  }

  return {
    slots: slots.sort((a, b) => dayIndex(a.day) - dayIndex(b.day)),
    freeDays,
    restDays,
    resolution,
    compromises,
  };
}
