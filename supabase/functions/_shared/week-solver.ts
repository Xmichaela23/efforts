// ============================================================================
// THE WEEK SOLVER — docs/SPEC-week-solver.md
//
// Enumerate → filter by hard rules → score → return the best, or REFUSE.
//
// ⛔ THE REFUSAL IS BUILT FIRST, AND ON PURPOSE. Michael, 2026-07-27:
//   *"The fourth fate is what gets deferred and never lands, because the solver appears to work
//    without it right up until a week is over-constrained — and then it does what all three §5.2b
//    modules did, because subtracting is what a solver with no way to say no does."*
// So `solve()` could return `unsolvable` before it could return a good week. Every module in §5.2b
// that silently dropped a session had no way to say no; this one has one before it has anything else.
//
// ⛔ THREE PRINCIPLES THIS FILE IS ACCOUNTABLE TO, all grep-able rather than vigilance-dependent:
//   §0c  CURRENCY — the law is hours between two NAMED SESSIONS. This file never builds a set of
//        forbidden weekdays. Filtering asks `requiredAdjacencyHours(kindA, kindB)` per candidate day,
//        per session kind, against what is actually placed.
//   §5.2b SILENT SUBTRACTION — a session is never removed. Not to make a week fit, not as a last
//        resort, not anywhere. Over-constrained returns named options and then a typed refusal.
//   §4.1a UNOWNED STRICTNESS — a constraint stricter than the law is admissible only when it names
//        the methodology it belongs to and carries its reason. See `MethodologyConstraint`.
//
// ⛔ DAY CONVENTION: MONDAY-FIRST, ZERO-INDEXED (§0b). 0 = Monday … 6 = Sunday. Sun-first storage
// converts at the boundary, once, on the way in. Never inside this file.
// ============================================================================

import {
  type MatrixSessionKind,
  requiredAdjacencyHours,
  adjacencyPenaltyReason,
  SAME_DAY_COMPATIBLE,
  stackNeedsRecoveryGap,
} from './schedule-session-constraints.ts';

// ── Days (§0b) ──────────────────────────────────────────────────────────────

export const SOLVER_DAYS = [
  'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday',
] as const;

export type SolverDay = (typeof SOLVER_DAYS)[number];

/** Days between two weekdays, wrapping the week. Sunday→Monday is 1, not 6. */
export function gapDays(a: number, b: number): number {
  const raw = Math.abs(a - b);
  return Math.min(raw, 7 - raw);
}

const gapHours = (a: number, b: number): number => gapDays(a, b) * 24;

// ── Inputs ──────────────────────────────────────────────────────────────────

/**
 * An endurance session the athlete does not move. HARD constraint (§0a 1-3).
 *
 * ⛔ Immovable means immovable. The solver never relocates one to make a week fit, and never
 * silently returns a different day than the one given — that is the defect the `base-generator`
 * tripwire tests exist to catch (§6b-1 X1).
 */
export type Anchor = {
  day: SolverDay;
  kind: MatrixSessionKind;
  /** Athlete-facing label, so a refusal can name what bound it. */
  label: string;
};

export type Lift = {
  name: string;
  isLower: boolean;
};

/**
 * A constraint STRICTER than the law, admitted only under §4.1a.
 *
 * ⛔ BOTH FIELDS ARE REQUIRED AND THAT IS THE POINT. `getDanielsStrategy`'s polarisation rule is
 * legitimate — the law permits `upper_body_strength × quality_run` and Daniels declines that
 * permission deliberately. `buildEasyDays` applying the same exclusion to Higdon is identical code
 * with no owner and no reason, and it is a bug. The type is what tells them apart.
 */
export type MethodologyConstraint = {
  /** Which methodology this belongs to. Unowned strictness is §0c's error wearing a template. */
  owner: string;
  /** Why. Goes into the compromise line if it binds. */
  reason: string;
  /** Days this methodology declines to use for strength, and it must say which sessions. */
  forbidsKindOnDay: (kind: MatrixSessionKind, day: SolverDay) => boolean;
};

export type SolverInput = {
  anchors: Anchor[];
  lifts: Lift[];
  /**
   * ⛔ §4.2 — PREFERRED DAYS ARE SCORED, NOT HARD, AND ANCHORS OUTRANK THEM.
   *
   * Found by the `week-optimizer` inventory (§6b-5): that module has
   * `biasOrderForPreferredDay` — the athlete's stated day is tried FIRST but may be overruled with a
   * logged trade-off — and this solver had **no preferred-day term at all**, so a stated preference
   * was worth exactly nothing. The spec had the section; the code did not.
   *
   * Keyed by lift name. Absent → no preference, which costs nothing.
   */
  preferredDays?: Record<string, SolverDay>;
  /** §0a.1 — days per week is an OUTPUT. This is the ceiling on active days, not a target. */
  maxActiveDays?: number;
  methodology?: MethodologyConstraint;
};

// ── The four fates (§5.2, §5.2a) ────────────────────────────────────────────

/**
 * ⛔ THE REFUSAL VOCABULARY, inherited from the deleted `SCHEDULE_GRIDLOCK_*` codes (§5.2a).
 * A typed code naming WHICH constraint bound — not a message, not a null, not an empty array.
 */
export type SolverRefusalCode =
  | 'SOLVER_GRIDLOCK_ANCHOR_COLLISION'  // two anchors want one day, or an anchor pair is illegal
  | 'SOLVER_GRIDLOCK_LOWER_BODY'        // no day clears heavy legs of the anchors
  | 'SOLVER_GRIDLOCK_NO_ROOM';          // the sessions asked for do not fit in seven days

export type PlacedLift = {
  lift: string;
  isLower: boolean;
  day: SolverDay;
  /**
   * Set when this lift shares its day with an anchor.
   *
   * ⛔ `order` WAS MISSING UNTIL THE REVERSE INVENTORY. §4.1 says a stacked day is ONE BUCKET,
   * ORDERED — and the solver emitted the pairing without ever saying which comes first. Eddens is
   * the whole reason the stack is safe: resistance BEFORE endurance, +6.91% lower-body dynamic
   * strength, in exactly the "must train concurrently with minimal relief" case this is. A stack
   * with no stated order is the finding discarded at the output boundary.
   */
  stackedWith?: { label: string; gapHours: number; order: 'lift_first' };
};

export type SolvedWeek = {
  lifts: PlacedLift[];
  activeDays: SolverDay[];
  restDays: SolverDay[];
};

/**
 * ⛔ THE DISCRIMINATOR, AND IT IS NOT DECORATION.
 *
 * `compromises` and `notes` share one channel by the time they reach the plan, and the distinction
 * — status reports RULE COMPLIANCE, notes report what the shape COST — lived only in the `status`
 * field. Anything downstream reading "the channel is non-empty" as "this week is compromised"
 * collapses the two straight back, which is §0f inverted: the output carries the information and the
 * reader cannot tell which kind it is holding. So each entry says what it is.
 */
export type NoteKind =
  /** A rule was broken. This is what makes a week `compromised`. */
  | 'breach'
  /** No rule was broken. The week's shape cost something and the athlete should know. */
  | 'cost';

export type SolverNote = { kind: NoteKind; text: string };

export type SolverResult =
  | { status: 'solved'; week: SolvedWeek; compromises: []; notes: SolverNote[] }
  | { status: 'compromised'; week: SolvedWeek; compromises: string[]; notes: SolverNote[] }
  | {
      status: 'unsolvable';
      code: SolverRefusalCode;
      /** The anchors that bound it, named. §5.2: "NAME THE ANCHORS AS THE BINDING CONSTRAINT." */
      bindingAnchors: Anchor[];
      /** What would make a week possible. ⛔ NEVER "drop a session" (§5.2b). */
      options: string[];
      message: string;
    };

// ── Relaxation (§5.2) — exactly two, in order ───────────────────────────────

/**
 * ⛔ THE MENU IS TWO OPTIONS AND THE ORDER IS THE SPEC'S (§5.2).
 * Dropping a session is NOT on it and never will be — see §5.2b. Three shipped modules subtracted
 * silently; each one did it outside a menu, which is why the menu alone was not enough.
 */
type Relaxation = 'strict' | 'no_rest_day' | 'clearance_as_penalty';

const RELAXATION_ORDER: Relaxation[] = ['strict', 'no_rest_day', 'clearance_as_penalty'];

export const MAX_ACTIVE_DAYS_DEFAULT = 6;

// ── The core: is this candidate day legal for this lift? ────────────────────

type Placement = { kind: MatrixSessionKind; dayIndex: number; label: string };

/**
 * ⛔ THIS FUNCTION IS §0c IN CODE. It takes a CANDIDATE DAY and a SESSION KIND and asks the law
 * about that specific pair against what is specifically placed. It does not, and must not, compute
 * a set of unavailable weekdays — that translation is what discarded "which session" and "how much"
 * three separate times in `placement/`.
 *
 * Returns null when legal, or the breach (for `clearance_as_penalty` to price).
 */
function adjacencyBreach(
  kind: MatrixSessionKind,
  dayIndex: number,
  placed: Placement[],
): { against: Placement; required: number; actual: number } | null {
  for (const p of placed) {
    if (p.dayIndex === dayIndex) continue; // same-day is the matrix's question, not adjacency's
    const required = requiredAdjacencyHours(kind, p.kind);
    if (required === 0) continue;
    const actual = gapHours(dayIndex, p.dayIndex);
    if (actual < required) return { against: p, required, actual };
  }
  return null;
}

/** Same-day legality: the matrix, and nothing else. */
function sameDayLegal(kind: MatrixSessionKind, dayIndex: number, placed: Placement[]): boolean {
  for (const p of placed) {
    if (p.dayIndex !== dayIndex) continue;
    if (SAME_DAY_COMPATIBLE[p.kind]?.[kind] !== true) return false;
  }
  return true;
}

// ── Score (§5) ──────────────────────────────────────────────────────────────

/**
 * Lower is better. ⛔ DETERMINISTIC BY CONSTRUCTION (§5.1): the returned key is compared
 * lexicographically, and its last element is the day-index vector in a fixed lift order, so two
 * distinct weeks can never tie. No `Math.random`, no enumeration-order dependence.
 */
function scoreKey(
  assignment: number[],
  lifts: Lift[],
  anchors: Placement[],
  breachMagnitude: number,
  restDayCount: number,
  stackCost: number,
  longHostedStacks: number,
  canonicalAssignment: number[],
  preferred?: Record<string, SolverDay>,
): number[] {
  // 1. ⛔ ONE FULL REST DAY, PROTECTED — not "rest days maximised". Corrected during the build.
  //    The first draft scored `-restDayCount`, and the test sweep caught it immediately: with upper
  //    lifts now legal on both long days, the cheapest way to "maximise rest" is to STACK
  //    EVERYTHING, so the classic two-anchor week came back as four active days and three rest days.
  //    That is not a better week, it is a week that spent four of the athlete's days to buy days off
  //    they never asked for. A stack is SPENT, not earned. §5 line 1 means the week must fight to
  //    lose its one rest day — it does not mean accumulate more.
  const restShortfall = Math.max(0, 1 - restDayCount);

  // 2. ⛔ STACK COST COMES FROM THE PAIR, NOT FROM A COUNTER. Corrected during the build.
  //    A flat `stackCount` prices an easy ride on a lift day the same as a squat beside a long
  //    ride, and those are not the same thing: pressing shares no prime movers with riding, so
  //    that stack is the cheapest addition in the system — a deliberate finding, not an accident
  //    of the matrix. `stackNeedsRecoveryGap` is the law's own answer to "do these two compete",
  //    so the score asks it per stacked pair instead of counting.
  //    ⚠️ HOW MANY stacks is not scored at all — it is GATED by arithmetic in the leaf, exactly as
  //    `place-week.resolveStacking` does it. Scoring the count was what let the solver stack
  //    everything to manufacture rest days it was never asked for.
  const stackPenalty = stackCost;

  // 2b. ⛔ WHICH DAY HOSTS THE STACK IS A DECISION, NOT A TIE-BREAK. Added after a probe showed the
  //     solver was choosing the host by DAY INDEX: with the long ride on Tuesday and the hard run on
  //     Friday it stacked onto Tuesday, and with both late it stacked onto the earlier one. The
  //     answer looked doctrinally right in the common Sat/Sun/Wed week purely because Wednesday has
  //     a smaller index than Saturday. **Doctrine arriving by accident is doctrine that will move
  //     the moment an athlete picks different days.**
  //
  //     The rule, MINED FROM `place-week` (which has had it in production and had it right):
  //     stack onto the SMALLEST day. A long session is already the longest day of the week, and
  //     adding a lift to it spends duration the day does not have; a hard-but-short session leaves
  //     room. This is a BUDGET consideration (§3 — a ceiling, never an adjacency input), so it sits
  //     below every clearance term and above the tie-break, which is exactly where a preference goes.
  //
  //     ⚠️ It also happens to be consolidation: grouping the lift onto an already-hard SHORT day
  //     keeps the easy days genuinely easy, rather than turning the long day into a bigger one.
  const stackHostPenalty = longHostedStacks;

  // 3. ⛔ BREACHES ARE MEASURED, NOT COUNTED. Mined from `place-week:196` — `penalty +=
  //    (required - actual)` — which is the THIRD piece of arithmetic that file had right and this
  //    solver first reinvented worse. Counting breaches prices a week that is 24h short exactly the
  //    same as one that is 48h short, so the solver had no reason to prefer the smaller violation
  //    when it had to violate something. The size of the miss is the whole information.
  const breachPenalty = breachMagnitude;

  // 4. ⛔ SPREAD IS THE TIGHTEST PAIR, NOT THE SUM OF PAIRS. Mined from `place-week:344`, which
  //    ranks on `Math.min(...)` — the closest other heavy day — not on a total. This solver summed,
  //    and summing hides the thing that matters: three heavy days at 24/24/96 sum better than
  //    48/48/48 while containing a back-to-back pair. With exactly two lower days the two agree,
  //    which is why it survived the first sweeps unnoticed. It bites at three.
  const lowerIdx = assignment.filter((_, i) => lifts[i].isLower);
  let tightestLower = 7;
  for (let i = 0; i < lowerIdx.length; i++) {
    for (let j = i + 1; j < lowerIdx.length; j++) {
      tightestLower = Math.min(tightestLower, gapDays(lowerIdx[i], lowerIdx[j]));
    }
  }
  const spreadPenalty = lowerIdx.length > 1 ? -tightestLower : 0;

  // 4b. ⛔ UPPER-DAY SPREAD IS GONE — DELETED 2026-08-05, MICHAEL'S CALL. DO NOT REINSTATE IT.
  //
  // It was `upperToNearestLiftPenalty` (once `upperSpreadPenalty`): `-min(gapDays)` from each upper
  // day to the NEAREST LIFT OF ANY KIND. The name promised press spacing and the metric could not
  // see it — measured, it returned −1 for four legal arrangements whose press gaps were 1, 2, 3 and
  // 3 (§0e: a check whose metric cannot move is not a check). Q-214 renamed it for exactly that
  // reason and left it in place.
  //
  // ⛔ WITH `pressAdjacencyShortfall` BUILT, THE THING IT WAS A BAD PROXY FOR IS NOW MEASURED
  // DIRECTLY, and what remained was a term that pins an upper lift away from LOWER lifts — the same
  // mistake `upperLowerShortfall` made (see 4c) and the same one the book contradicts: Wendler's
  // week alternates upper and lower on back-to-back days on purpose.
  //
  // ⚠️ IT WAS NOT DEAD, WHICH IS WHY THIS IS A DECISION AND NOT A CLEANUP. Swept over 128 solver
  // scenarios — every session kind on every day, every long-run × quality-run pair, both block
  // shapes. **Zero change at four lifting days; 36 of 43 changed at three**, and every one of those
  // changed toward the book: unpinned, the 3-day week goes from Mon Deadlift · Thu Squat · Sat
  // presses (lower, lower, upper) to Mon Deadlift · Tue presses · Thu Squat — alternating, with the
  // heavy legs still 3 days apart because `spreadPenalty` holds that on its own.
  //
  // ⛔ SO THE LIFT-SPACING TERMS ARE NOW EXACTLY TWO, AND EACH SAYS WHAT IT MEASURES:
  //     `spreadPenalty`            heavy legs vs heavy legs
  //     `pressAdjacencyShortfall`  press vs press
  // Nothing prices upper-against-lower any more, deliberately. If a future session wants that back,
  // read the p.11 week first — it is the arrangement such a term scores worst.

  // 4. §5.0a + §2.2 — anchors landing on consecutive days is a real cost, and it is the athlete's
  //    own two picks that caused it. Scored, never corrected: anchors are hard (§2.3).
  //
  //    ⛔ THE PAIR MATTERS, NOT JUST THE ADJACENCY. Found by the reverse inventory: this counted
  //    every adjacent anchor pair as +1, so a hard run beside the long run — which §2.2 calls
  //    **THE REAL CONFLICT**, both eccentric — priced identically to an easy swim beside a long
  //    ride, which costs nothing. §5 line 4 ("quality on clean legs — the hard day not preceded by
  //    an eccentric anchor") had no term at all. The law already knows which pairs are expensive:
  //    `adjacencyPenaltyReason` is exactly that list, and it was only ever consulted for
  //    anchor→LIFT pairs, never anchor→anchor.
  let shapePenalty = 0;
  for (let i = 0; i < anchors.length; i++) {
    for (let j = i + 1; j < anchors.length; j++) {
      if (gapDays(anchors[i].dayIndex, anchors[j].dayIndex) !== 1) continue;
      shapePenalty += 1;
      // Which one is "before" depends on the calendar order of the two days.
      const [first, second] = anchors[i].dayIndex === (anchors[j].dayIndex + 1) % 7
        ? [anchors[j], anchors[i]] : [anchors[i], anchors[j]];
      if (adjacencyPenaltyReason(first.kind, second.kind)) shapePenalty += 3;
    }
  }

  // 4c. ⛔ UPPER↔LOWER SPACING IS GONE — REMOVED 2026-08-05, MICHAEL'S CALL. DO NOT REINSTATE IT.
  //
  // It was `upperLowerShortfall`: every upper↔lower pair scored `max(0, 3 - gapDays)`, a preferred
  // 3-day floor mined from `week-optimizer:1638` (`findStrengthPair(3)` then `(2)`).
  //
  // ⛔ **IT CONTRADICTS THE BOOK IT WAS MEANT TO SERVE.** Wendler's basic week (2nd ed. p.11,
  // verified in the PDF) is Press · Deadlift · Bench · Squat — it ALTERNATES upper and lower on
  // back-to-back days, deliberately. A term that pushes every press 3+ days from every leg day
  // scores the book's own week as worse than a clustered one.
  //
  // ⛔ AND IT CAUSED THE CLUSTERING IT LOOKED LIKE IT PREVENTED. With four lifts on seven days,
  // shoving each press away from each leg day shoves the two presses INTO EACH OTHER — the 24h-apart
  // pressing days Q-212 and Q-214 both chased. It spent press spacing, which matters, to buy
  // separation between an upper and a lower lift, which barely clash: different tissue, and on this
  // plan the endurance is maintenance.
  //
  // ⚠️ THE MODEL THIS PLAN ACTUALLY RUNS ON is concurrent/hybrid consolidation (Viada): hard days
  // hard, easy days easy, priority session first when two share a day. Strength is the goal and
  // endurance is held, not developed — so upper↔lower calendar distance is not what protects the
  // goal. Heavy legs vs heavy legs is (`spreadPenalty`); press vs press is
  // (`pressAdjacencyShortfall`). Both are kept. Both match the book.
  //
  // ⛔ THIS SUPERSEDES Q-214's RANKING NOTE, which placed `pressAdjacencyShortfall` deliberately
  // BELOW this term so it acted as a tie-break rather than an override. **That relationship no
  // longer exists** — there is nothing above press spacing for it to yield to. Q-214 is
  // back-annotated; its reasoning is still correct for the world it was written in.

  // 4c-ii. ⛔ PRESS-TO-PRESS SPACING — Q-214, decided 2026-07-28, built 2026-08-05.
  //
  // **This is the term Q-214 says does not exist.** The old `upperToNearestLiftPenalty` measured
  // upper → nearest lift OF ANY KIND and returned −1 for four arrangements whose press gaps were 1,
  // 2, 3 and 3 — it structurally could not see press↔press (§0e: a check whose metric cannot move).
  // The lower region has had `spreadPenalty` comparing lower↔lower since the beginning; the upper
  // region had nothing. This is the missing half, and the proxy it replaced is now deleted (4b).
  //
  // ⛔ THE CLUSTERING THIS WAS BUILT AGAINST came from `upperLowerShortfall`, which pushed every
  // press ≥3 days from every leg day and so shoved the two presses into each other — the solver
  // returned Mon Squat · Thu Deadlift · Fri Bench · Sat OHP on an empty week: legs, legs, press,
  // press, 24h apart. That term is now deleted (4c), which removes the CAUSE; this term remains as
  // the direct statement of the property, so nothing has to infer it from a side effect again.
  //
  // ⛔ THE FLOOR IS 3 AND IT IS THE BOOK'S, NOT A PICKED NUMBER. Wendler's basic week (2nd ed. p.11)
  // is Press · Deadlift · Bench · Squat — it ALTERNATES, and in all three of his suggested day sets
  // (Mon/Tue/Thu/Fri · Sun/Mon/Wed/Fri · Sun/Mon/Wed/Thu) the two pressing days land 3 days apart.
  // Same shape as `upperLowerShortfall`'s floor, which is deliberate: a pure spread term maximises
  // without knowing where "good enough" is and would trade a real clearance for separation it did
  // not need. This prices only the SHORTFALL below three.
  //
  // ⚠️ IT WAS A TIE-BREAK AND IT IS NOW THE PRIMARY LIFT-SPACING TERM (2026-08-05). Q-214 ranked it
  // deliberately BELOW `upperLowerShortfall` so it could only break ties — *"that's the tie-break
  // behaviour I wanted, not an override."* **That term has since been deleted** (see 4c), so nothing
  // above it competes for lift placement any more. The ranking note in Q-214 is superseded; the term
  // itself is unchanged and its reasoning below still stands.
  //
  // ⚠️ AND IT IS SCORED, NEVER HARD. The law affirmatively permits it —
  // `upper_body_strength × upper_body_strength = 0h` — so this is a preference ABOVE the law (§4.1a),
  // which is exactly why it is a penalty and not a prune.
  let pressAdjacencyShortfall = 0;
  for (let i = 0; i < assignment.length; i++) {
    for (let j = i + 1; j < assignment.length; j++) {
      if (lifts[i].isLower || lifts[j].isLower) continue; // upper↔upper only — this is the whole point
      pressAdjacencyShortfall += Math.max(0, 3 - gapDays(assignment[i], assignment[j]));
    }
  }

  // 4d. §4.2 — the athlete's stated day, honoured when it costs nothing and overruled when it does.
  let preferredMissPenalty = 0;
  for (let i = 0; i < assignment.length; i++) {
    const want = preferred?.[lifts[i].name];
    if (want && SOLVER_DAYS.indexOf(want) !== assignment[i]) preferredMissPenalty += 1;
  }

  // 5. directional penalties the law prices but does not forbid
  let orderPenalty = 0;
  for (let i = 0; i < assignment.length; i++) {
    const kind: MatrixSessionKind = lifts[i].isLower ? 'lower_body_strength' : 'upper_body_strength';
    for (const a of anchors) {
      const before = (a.dayIndex + 1) % 7 === assignment[i];
      if (before && adjacencyPenaltyReason(a.kind, kind)) orderPenalty += 1;
    }
  }

  // ⛔ THE TIE-BREAK VECTOR IS IN CANONICAL LIFT ORDER, NOT INPUT ORDER (§5.1). Using the input
  // order would let the CALLER's array ordering leak into the answer: the same athlete, same
  // anchors, same lifts listed differently would score differently and re-materialize to a
  // different week. Canonical order is (lower before upper, then name) — a property of the lifts
  // themselves, not of how they arrived.
  // ⛔ ORDER CORRECTED 2026-07-27. `stackHostPenalty` used to sit BELOW `upperLowerShortfall` (a
  // term since deleted — see 4c), and
  // the consequence showed up on a week an athlete would really ask for: Thursday long run of 108
  // minutes, receiving an overhead press, because the 3-day upper↔lower floor outranked the
  // smallest-day rule. Smallest-day was mined from `place-week` precisely to stop that.
  //
  // The principle: **day size GATES which hosts are acceptable; spacing OPTIMISES among them.**
  // Spacing choosing the host is spacing making a day-size decision it has no information about.
  // ⛔ `pressAdjacencyShortfall` IS THE LIFT-SPACING TERM NOW — `upperLowerShortfall` was deleted
  // 2026-08-05 (see 4c). Moving it is a design change, not a refactor — see the block at 4c-ii.
  return [restShortfall, breachPenalty, stackPenalty, stackHostPenalty, spreadPenalty,
    pressAdjacencyShortfall, shapePenalty,
    orderPenalty, preferredMissPenalty, ...canonicalAssignment];
}

function lexLess(a: number[], b: number[]): boolean {
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const x = a[i] ?? 0, y = b[i] ?? 0;
    if (x !== y) return x < y;
  }
  return false;
}

// ── solve() ─────────────────────────────────────────────────────────────────

export function solve(input: SolverInput): SolverResult {
  const { anchors, lifts } = input;
  const maxActive = input.maxActiveDays ?? MAX_ACTIVE_DAYS_DEFAULT;
  const dayOf = (d: SolverDay) => SOLVER_DAYS.indexOf(d);

  // ── Fate 4, checked FIRST: two anchors on one day the matrix forbids (§2.3) ────────────────
  // An anchor collision is a VALIDATION failure, not a precedence question. The solver does not
  // pick a winner and it does not move one — it refuses and names both.
  for (let i = 0; i < anchors.length; i++) {
    for (let j = i + 1; j < anchors.length; j++) {
      if (anchors[i].day !== anchors[j].day) continue;
      if (SAME_DAY_COMPATIBLE[anchors[i].kind]?.[anchors[j].kind] === true) continue;
      return {
        status: 'unsolvable',
        code: 'SOLVER_GRIDLOCK_ANCHOR_COLLISION',
        bindingAnchors: [anchors[i], anchors[j]],
        options: [
          `Move ${anchors[i].label} to another day.`,
          `Move ${anchors[j].label} to another day.`,
        ],
        message:
          `${anchors[i].label} and ${anchors[j].label} are both on ${anchors[i].day}, and they cannot ` +
          `share a day. Both are fixed, so this is yours to resolve — the engine will not pick one.`,
      };
    }
  }

  const anchorPlacements: Placement[] = anchors.map((a) => ({
    kind: a.kind, dayIndex: dayOf(a.day), label: a.label,
  }));
  const anchorDays = new Set(anchorPlacements.map((a) => a.dayIndex));

  // ── Fate 4: arithmetic. Sessions asked for vs days that exist (§0a.1) ─────────────────────
  // ⛔ NOT "drop a lift". §5.2b — the solver never subtracts. It states the arithmetic and stops.
  // ⛔ THE CEILING IS SESSIONS MINUS STACKING CAPACITY, NOT SESSIONS. Corrected during the build:
  // the first draft refused at `anchors + lifts > 7`, which refuses weeks that genuinely fit —
  // stacking an upper lift onto an endurance day costs nothing (§4.1), so nine sessions can occupy
  // seven days. Capacity is the number of UPPER lifts, because only an upper may stack.
  const upperCount = lifts.filter((l) => !l.isLower).length;
  const stackCapacity = Math.min(upperCount, anchors.length);
  if (anchors.length + lifts.length - stackCapacity > 7) {
    return {
      status: 'unsolvable',
      code: 'SOLVER_GRIDLOCK_NO_ROOM',
      bindingAnchors: anchors,
      options: [
        `Reduce the number of fixed endurance days.`,
        `Add an upper lift that can share a fixed day — only upper lifts may stack.`,
      ],
      message:
        `${anchors.length} fixed endurance days and ${lifts.length} lifting days is ` +
        `${anchors.length + lifts.length} sessions. At most ${stackCapacity} can share a day, ` +
        `which still needs ${anchors.length + lifts.length - stackCapacity} days, and a week has seven.`,
    };
  }

  // Canonical lift order for the tie-break vector (§5.1): a property of the lifts, never of the
  // order the caller happened to list them in.
  //
  // ⛔ THE TIE-BREAK OPENS WITH THE PRESS, NOT THE ALPHABET (2026-08-05, Michael's call).
  //
  // It sorted lower-first then by NAME, purely for determinism — which is why a week with no anchors
  // opened `Monday: Back Squat`. "Back Squat" simply sorts before "Deadlift", and lower sorted before
  // upper. Nothing chose it; the alphabet did.
  //
  // ✅ Wendler's basic week (2nd ed. p.11, verified in the PDF) is **Standing Military Press ·
  // Deadlift · Bench Press · Squat**, so that is what an unconstrained week should open as. With
  // this order the default week is Mon Press · Tue Deadlift · Thu Bench · Fri Squat — the book
  // verbatim, on the first of his three suggested day sets.
  //
  // ⚠️ DETERMINISM IS UNCHANGED, which is the only property this vector was ever protecting (§5.1).
  // The book order is a fixed list, exactly as total and as caller-independent as the alphabet was.
  // Lifts outside it — the 3-day shape's paired `"Bench Press + Overhead Press"` slot, and whatever
  // `generate-run-plan` passes — fall through to the previous rule, so nothing that is not one of
  // Wendler's four changes behaviour at all.
  //
  // ⛔ AND IT IS ONLY A TIE-BREAK. It is the LAST element of the score vector, so every real term —
  // clearances, rest, stacks, heavy-leg spread, press spacing, the athlete's preferred days — is
  // settled before this is consulted. A pinned endurance day still moves the lifts wherever it needs
  // to. This decides the shape of a week that has nothing else to decide it.
  const WENDLER_WEEK_ORDER = ['Overhead Press', 'Deadlift', 'Bench Press', 'Back Squat'];
  const canonicalOrder = lifts
    .map((l, i) => {
      const w = WENDLER_WEEK_ORDER.indexOf(l.name);
      // `0:` sorts the book's four ahead of anything else, in p.11 sequence; `1:` keeps the old
      // lower-first-then-alphabetical rule for everything the book does not name.
      return { i, k: w >= 0 ? `0:${w}` : `1:${l.isLower ? '0' : '1'}:${l.name}` };
    })
    .sort((a, b) => (a.k < b.k ? -1 : a.k > b.k ? 1 : 0))
    .map((x) => x.i);

  // ── Enumerate, filter, score, at each relaxation tier in order ─────────────────────────────
  for (const relax of RELAXATION_ORDER) {
    let best: { key: number[]; assignment: number[]; breaches: string[] } | null = null;

    const assignment: number[] = new Array(lifts.length).fill(0);

    const recurse = (liftIndex: number, placed: Placement[]): void => {
      if (liftIndex === lifts.length) {
        const activeSet = new Set<number>([...anchorDays, ...assignment]);
        const restCount = 7 - activeSet.size;
        if (relax === 'strict' && activeSet.size > maxActive) return;

        const breaches: string[] = [];
        let breachMagnitude = 0;
        for (let i = 0; i < lifts.length; i++) {
          const kind: MatrixSessionKind = lifts[i].isLower ? 'lower_body_strength' : 'upper_body_strength';
          const others = placed.filter((_, k) => k !== anchorPlacements.length + i);
          const b = adjacencyBreach(kind, assignment[i], others);
          if (b) {
            breachMagnitude += b.required - b.actual;
            breaches.push(
              `${SOLVER_DAYS[assignment[i]]}'s ${lifts[i].name} sits ${b.actual}h from ` +
              `${b.against.label} (${SOLVER_DAYS[b.against.dayIndex]}); the clearance for that is ${b.required}h.`,
            );
          }
        }
        if (breaches.length > 0 && relax !== 'clearance_as_penalty') return;

        // ⛔ ARITHMETIC GATE ON HOW MANY STACKS, not a score term. `place-week.resolveStacking`:
        // stacksRequired = sessions − MAX_ACTIVE_DAYS. Stacking beyond that is not an improvement,
        // it is consolidating the athlete's week without being asked.
        const stackedIdx = assignment
          .map((d, i) => (anchorDays.has(d) ? i : -1))
          .filter((i) => i >= 0);
        const stacksRequired = Math.max(0, anchors.length + lifts.length - maxActive);
        if (stackedIdx.length > stacksRequired) return;

        // Per-pair cost: does this stack actually compete? (the law's own question)
        let stackCost = 0;
        let longHostedStacks = 0;
        for (const i of stackedIdx) {
          const liftKind: MatrixSessionKind = lifts[i].isLower
            ? 'lower_body_strength' : 'upper_body_strength';
          const a = anchorPlacements.find((p) => p.dayIndex === assignment[i])!;
          if (stackNeedsRecoveryGap(a.kind, liftKind)) stackCost += 1;
          if (a.kind === 'long_run' || a.kind === 'long_ride') longHostedStacks += 1;
        }

        const canonicalAssignment = canonicalOrder.map((i) => assignment[i]);
        const key = scoreKey(assignment, lifts, anchorPlacements, breachMagnitude, restCount,
          stackCost, longHostedStacks, canonicalAssignment, input.preferredDays);
        if (!best || lexLess(key, best.key)) {
          best = { key, assignment: [...assignment], breaches };
        }
        return;
      }

      const lift = lifts[liftIndex];
      const kind: MatrixSessionKind = lift.isLower ? 'lower_body_strength' : 'upper_body_strength';

      for (let d = 0; d < 7; d++) {
        // ⛔ §0c: every rejection below names the session it is about. None of them is a
        // "this weekday is unavailable" decision.
        //
        // ⛔ ONE LIFT PER DAY — §0a constraint #4 is "FOUR LIFTING DAYS", a fixed COUNT OF DAYS, not
        // a count of sessions. The matrix permits `upper_body_strength × lower_body_strength` to
        // share a day and that permission is real, but it belongs to a different block shape. Four
        // lifts on three days is not this block. (Found by the test sweep: without this the solver
        // happily returned a three-day week with three rest days and called it solved.)
        if (assignment.slice(0, liftIndex).includes(d)) continue;
        if (input.methodology?.forbidsKindOnDay(kind, SOLVER_DAYS[d])) continue;
        if (!sameDayLegal(kind, d, placed)) continue;
        if (relax !== 'clearance_as_penalty' && adjacencyBreach(kind, d, placed)) continue;

        assignment[liftIndex] = d;
        placed.push({ kind, dayIndex: d, label: lift.name });
        recurse(liftIndex + 1, placed);
        placed.pop();
      }
    };

    recurse(0, [...anchorPlacements]);

    if (best) {
      const b = best as { key: number[]; assignment: number[]; breaches: string[] };
      const activeSet = new Set<number>([...anchorDays, ...b.assignment]);
      const week: SolvedWeek = {
        lifts: lifts.map((l, i) => {
          const anchorHere = anchorPlacements.find((a) => a.dayIndex === b.assignment[i]);
          const kind: MatrixSessionKind = l.isLower ? 'lower_body_strength' : 'upper_body_strength';
          return {
            lift: l.name,
            isLower: l.isLower,
            day: SOLVER_DAYS[b.assignment[i]],
            ...(anchorHere
              ? {
                  stackedWith: {
                    label: anchorHere.label,
                    gapHours: stackNeedsRecoveryGap(anchorHere.kind, kind) ? 6 : 0,
                    // §4.1 / Eddens — always, and it is not a courtesy. It is why the stack is safe.
                    order: 'lift_first' as const,
                  },
                }
              : {}),
          };
        }),
        activeDays: SOLVER_DAYS.filter((_, i) => activeSet.has(i)),
        restDays: SOLVER_DAYS.filter((_, i) => !activeSet.has(i)),
      };

      // ⛔ NOTES ARE STATED COSTS, NOT RULE BREACHES — and they do NOT change `status`.
      //
      // A Saturday-ride/Sunday-run week is not "compromised": it breaks no rule. But it IS shaped by
      // the athlete's own two picks, and §5.0a says the cause must be named rather than the cramped
      // result silently produced. Likewise a clearance met EXACTLY — 24h where 24h is owed — is
      // legal with no buffer, and passing it in silence is the §0f loss: the week is right and fails
      // to say what it cost.
      const CAP = (d: number) => SOLVER_DAYS[d].charAt(0).toUpperCase() + SOLVER_DAYS[d].slice(1);
      const notes: SolverNote[] = [];
      for (let i = 0; i < anchorPlacements.length; i++) {
        for (let j = i + 1; j < anchorPlacements.length; j++) {
          const A = anchorPlacements[i], B = anchorPlacements[j];
          if (gapDays(A.dayIndex, B.dayIndex) !== 1) continue;
          const [first, second] = A.dayIndex === (B.dayIndex + 1) % 7 ? [B, A] : [A, B];
          const reason = adjacencyPenaltyReason(first.kind, second.kind);
          // ⛔ TIGHTENED 2026-07-29. Michael, on the confirm screen: *"can we tighten how this copy
          // works so it all sits on the screen witout scroling its a bit dense and cofusing."*
          //
          // Was 44 words carrying two clauses that said nothing the athlete could act on: *"so the
          // rest of the week is built around that pair"* (the week IS the surrounding grid — they can
          // see it) and *"nothing was moved to make it easier"* (a promise about the engine's
          // behaviour, not a fact about their week). What survives is the pairing, the days, and why
          // it stands: both are theirs.
          notes.push({
            kind: 'cost',
            text:
              // ⚠️ BOTH LABELS ARE STRIPPED. Only the first was, so a real week read "Your long ride
              // and your long run" — the possessive twice in one clause, which is the kind of thing
              // that makes copy feel like it was assembled rather than written.
              `Your ${first.label.replace(/^your\s+/i, '')} and ${second.label.replace(/^your\s+/i, '')} ` +
              `are back to back — ${CAP(first.dayIndex)} into ${CAP(second.dayIndex)}. Both are your ` +
              `days, so the week is built around them.` +
              (reason ? ` ${reason.charAt(0).toUpperCase()}${reason.slice(1)}.` : ''),
          });
        }
      }
      // At-the-floor: legal, no buffer, and worth saying so.
      //
      // ⛔ ONE NOTE PER (ANCHOR, DISTANCE), NOT ONE PER LIFT (2026-07-29). Michael, reading a real
      // block: *"its dense i cant read it."* Two lifts at the floor against the same long run
      // produced two paragraphs identical but for the lift name — the second taught nothing. The
      // lifts are now listed inside one sentence.
      //
      // ⚠️ GROUPED ON (anchor, days, side), NOT ON ANCHOR ALONE. Two lifts can sit at the floor
      // against the same anchor at DIFFERENT distances; merging those would print one distance that
      // is wrong for one of them. The key keeps them apart, so a merged sentence is only ever built
      // from lifts the sentence is true of.
      //
      // ⚠️ THE days === 1 BRANCH STILL READS AS ONE LIFT, and that is not an oversight: two lifts
      // cannot both sit one day from the same anchor on the same side without being the same day,
      // so that group always holds exactly one.
      const floorGroups = new Map<string, { label: string; days: number; actual: number; anchorFollows: boolean; names: string[] }>();
      for (let i = 0; i < lifts.length; i++) {
        const kind: MatrixSessionKind = lifts[i].isLower ? 'lower_body_strength' : 'upper_body_strength';
        for (const a of anchorPlacements) {
          const required = requiredAdjacencyHours(kind, a.kind);
          if (required === 0) continue;
          const actual = gapHours(b.assignment[i], a.dayIndex);
          if (actual !== required) continue;
          // ⚠️ "the day before/after" is only true at a ONE-day gap. At 48h it is two days, and
          //    saying "the day before" there is simply wrong — the note has to describe the real
          //    calendar distance or it is a confident lie in athlete-facing copy.
          const days = gapDays(b.assignment[i], a.dayIndex);
          const anchorFollows = (b.assignment[i] + 1) % 7 === a.dayIndex;
          const key = `${a.dayIndex}|${days}|${anchorFollows}`;
          const g = floorGroups.get(key);
          if (g) g.names.push(lifts[i].name);
          else floorGroups.set(key, {
            label: a.label.replace(/^your\s+/i, ''), days, actual, anchorFollows, names: [lifts[i].name],
          });
        }
      }
      // ⛔ ONE NOTE FOR ALL AT-THE-FLOOR CLEARANCES, NOT ONE PER GROUP (2026-07-29). D-331 grouped
      // these by (anchor, distance) so two lifts stopped producing two identical paragraphs. On a real
      // week that still left TWO paragraphs whose tails were the same fourteen words —
      // *"hours, the minimum the rule allows, with nothing spare"* — printed twice. Michael: *"its a
      // bit dense and cofusing."*
      //
      // ⚠️ SAME FIX, ONE LEVEL UP: group by the FACT TYPE rather than by the instance. "At its
      // minimum with nothing spare" is one fact about the week; which pairings it applies to is a
      // list. The clauses keep their own distances, so nothing is merged that would print a wrong
      // number for one of them.
      const floorClauses = [...floorGroups.values()].map((g) => {
        const list = g.names.length === 1
          ? g.names[0]
          : `${g.names.slice(0, -1).join(', ')} and ${g.names[g.names.length - 1]}`;
        return g.days === 1
          ? `your ${g.label} the day ${g.anchorFollows ? 'after' : 'before'} ${list} (${g.actual}h)`
          : `${list} ${g.days} days from your ${g.label} (${g.actual}h)`;
      });
      if (floorClauses.length === 1) {
        notes.push({
          kind: 'cost',
          text: `One clearance is at its minimum with nothing spare: ${floorClauses[0]}.`,
        });
      } else if (floorClauses.length > 1) {
        notes.push({
          kind: 'cost',
          text: `${floorClauses.length} clearances are at their minimum with nothing spare: `
            + `${floorClauses.slice(0, -1).join('; ')}; and ${floorClauses[floorClauses.length - 1]}.`,
        });
      }

      // ⛔ Q-214 — WHEN PRESS SPACING LOSES, SAY SO. The term is a tie-break by design: it is ranked
      // below the deleted `upperLowerShortfall`, so it could be overruled. Q-214's
      // requirement is that the solver "records which happened, so the next session reads why rather
      // than reconstructing it from the arrangement" — a cost computed and never said is the §0f loss.
      //
      // ⚠️ REPORTED ONLY WHEN THE PRESSES ARE ACTUALLY TIGHT. Silence when the floor is met; this is
      // not a running commentary on a term that did its job.
      // ⚠️ READ OFF `b.assignment`, NOT BACK OFF `week.lifts` — the assignment is the day INDEX the
      // solver scored on, and `gapDays` wraps the week. Re-deriving an index from the day NAME would
      // be a second reading of the same fact, and the kind that silently disagrees.
      const pressIdx = lifts.map((l, i) => (l.isLower ? -1 : b.assignment[i])).filter((d) => d >= 0);
      if (pressIdx.length > 1) {
        let tightestPress = 7;
        for (let i = 0; i < pressIdx.length; i++) {
          for (let j = i + 1; j < pressIdx.length; j++) {
            tightestPress = Math.min(tightestPress, gapDays(pressIdx[i], pressIdx[j]));
          }
        }
        if (tightestPress < 3) {
          const names = lifts.filter((l) => !l.isLower).map((l) => l.name);
          notes.push({
            kind: 'cost',
            text: tightestPress === 1
              ? `${names.join(' and ')} land on back-to-back days. Three days apart is the preferred `
                + `spacing; the rest of the week costs more to move than this does.`
              : `${names.join(' and ')} are ${tightestPress} days apart, under the preferred three. `
                + `The rest of the week costs more to move than this does.`,
          });
        }
      }

      const compromises: string[] = [...b.breaches];
      if (relax !== 'strict' && week.restDays.length === 0) {
        compromises.push(
          `${anchors.length} fixed endurance days and ${lifts.length} lifting days is ` +
          `${activeSet.size} active days, so the week runs with no full rest day.`,
        );
      }
      if (input.methodology && compromises.length === 0) {
        // The methodology bound but did not cost anything nameable — nothing to report.
      }
      // ⚠️ `notes` deliberately do NOT promote a week to `compromised`. Status reports RULE
      // COMPLIANCE; notes report what the shape cost. Conflating them would mark every ordinary
      // weekend-anchored week as compromised and drain the word of meaning.
      return compromises.length === 0
        ? { status: 'solved', week, compromises: [], notes }
        : { status: 'compromised', week, compromises, notes };
    }
  }

  // ── Fate 4: every relaxation exhausted (§5.2) ──────────────────────────────────────────────
  return {
    status: 'unsolvable',
    code: 'SOLVER_GRIDLOCK_LOWER_BODY',
    bindingAnchors: anchors,
    options: [
      'Accept a week with no full rest day.',
      'Accept a heavy leg day closer to a long session than the clearance wants, and see by how much.',
    ],
    message:
      `No legal week exists for ${lifts.length} lifting days around ` +
      `${anchors.map((a) => `${a.label} (${a.day})`).join(', ')}. ` +
      `Both relaxations were tried. ⛔ No session was removed to produce this answer.`,
  };
}
