// ============================================================================
// WENDLER 5/3/1 — THE LOADING MODULE
//
// Pure. No sessions, no days, no endurance, no plan shape. Give it a 1RM and a week,
// get back sets. That is deliberate: `ARCH-strength-spine.md` Layer 2 — Get Stronger is
// the FIRST consumer of this machinery, not its owner. Race plans need the same loading
// at a maintenance dose, and the previous composer kept its loading private (its own
// header said so), which is why the protocol would otherwise be authored twice.
//
// Contract + citations: docs/SPEC-get-stronger.md. Every number here is Wendler's.
// Do not add one that is not.
// ============================================================================

export type CycleKind = 'leader' | 'anchor';

export type WendlerSet = {
  /** Percentage OF THE WORKING NUMBER (not of the true 1RM). 0.65 = 65%. */
  pct: number;
  /** Prescribed reps. On an `amrap` set this is the MINIMUM — the floor, not the target. */
  reps: number;
  /** True = "as many clean reps as you can". Only ever the last set, only in an anchor. */
  amrap: boolean;
  /** True = a warm-up ramp set (Wendler 2nd ed. p.31), not measured work. Excluded from the AMRAP,
   *  the e1RM and workload — it only preps the bar. Absent/false = a work set. */
  warmup?: boolean;
};

// ── The week table ───────────────────────────────────────────────────────────
// Percentages are identical across leader and anchor; only the REPS differ.
//
// ⛔ THE DELOAD ROW LEFT THIS TABLE ON 2026-08-15 (work order §1c). It used to be week 4 —
// `4: [0.40, 0.50, 0.60]` — because a cycle was four weeks with its own deload welded to the end.
// **Forever's cycle is three weeks and the light week is STANDALONE** (pp.20-23): a 7th-week deload
// or a TM-test week, sitting BETWEEN templates rather than inside one, and used "between your Leader
// and Anchor template." Those two shapes are `deloadSingleSets` and `tmTestSets` below.
//
// ⚠️ WEEKS 1-3 ARE UNTOUCHED, AND THAT IS THE WHOLE POINT OF THE CHANGE BEING SAFE. Every percentage
// and every rep count below is exactly what shipped before; what moved is the week that used to
// follow them.
const PCT_BY_WEEK: Record<number, [number, number, number]> = {
  1: [0.65, 0.75, 0.85],
  2: [0.70, 0.80, 0.90],
  3: [0.75, 0.85, 0.95],
};

// Anchor = the standard 5/3/1 rep scheme, last set open.
const ANCHOR_REPS: Record<number, [number, number, number]> = {
  1: [5, 5, 5],
  2: [3, 3, 3],
  3: [5, 3, 1],
};

/**
 * Sets for one lift, one week.
 *
 * **LEADER = every set is five, including the top set. No AMRAP.** That is not a
 * simplification — dropping the all-out set is *half* of what makes the lowered working
 * number lower-fatigue. Pairing an 80–85% working number with AMRAP top sets is an
 * accidental hybrid: lighter weights, same cost. See SPEC §1.
 *
 * **ANCHOR = 5/3/1 proper, last set open.** This is where the measurement lives.
 */
export function setsForWeek(kind: CycleKind, weekInCycle: number): WendlerSet[] {
  const pcts = PCT_BY_WEEK[weekInCycle];
  if (!pcts) throw new Error(`weekInCycle must be 1-${WEEKS_PER_CYCLE}, got ${weekInCycle}`);
  const reps = kind === 'anchor' ? ANCHOR_REPS[weekInCycle] : ([5, 5, 5] as const);
  return pcts.map((pct, i) => ({
    pct,
    reps: reps[i],
    // Never in a leader, and only the last set. ⚠️ The `!isDeload` guard that used to sit here is
    // gone with the deload row — a cycle has no deload week inside it any more.
    amrap: kind === 'anchor' && i === 2,
  }));
}

// ── The two STANDALONE weeks (5/3/1 Forever, pp.20-23) ───────────────────────
//
// ⛔ NEITHER IS A CYCLE WEEK, AND THAT IS WHY THEY LIVE IN THEIR OWN FUNCTIONS. A leader or anchor
// week is `weekInCycle` 1-3 of a three-week block running off `PCT_BY_WEEK`. These are single weeks
// the block layout drops BETWEEN cycles — Wendler's "7th week", so called because in his standard
// 3-week-cycle counting it lands on week 7.
//
// ⛔ AND NEITHER TAKES A WARM-UP RAMP. The old carve-out's reasoning (`warmupSetsForWeek` returns
// nothing on a deload — *"the deload sets ARE the ramp"*) applies to both of these unchanged: they
// open at 70% and climb, so a 40/50/60 ramp in front would run three lighter weights and then
// re-cover the same ground.
//
// ⚠️ THE PERCENTAGES ARE OF THE TRAINING MAX, like every other percentage in this file. `1.0` is the
// training max itself — which is ~85% of the athlete's true 1RM here, so a "TM single" is not a
// max attempt. That buffer is exactly what makes the test week testable rather than dangerous.

/**
 * **The TM-test week.** 70/80/90% × 5, then the training max for 3-5 reps.
 *
 * Forever pp.20-21: *"Prior to any Leader template, I recommend you perform a training max test
 * week"* (bold in the book). His pass bar is 3 reps at a 90% TM or 5 at an 85% TM; **ours is 85%
 * (`WORKING_NUMBER_PCT_OF_1RM`), so 5 is the bar** — see `verdictFromTmTestSet`.
 *
 * ⛔ THE PRESCRIBED MINIMUM IS 5, NOT 3, AND THAT IS DELIBERATE. The book's range is 3-5; writing
 * `3+` on the card and then treating 3 as a HOLD is the trap the anchor's AMRAP note already names —
 * *"the number before the plus is the MINIMUM, not the target"* — except here it would be worse,
 * because the athlete who follows the card exactly gets a verdict that says they fell short. The
 * card asks for the number that passes; the 3-4 band survives in the verdict as tolerance, not as
 * the ask. Copy caps it at 5: five strong reps and the bar goes back on the rack.
 */
export function tmTestSets(): WendlerSet[] {
  return [
    { pct: 0.70, reps: 5, amrap: false },
    { pct: 0.80, reps: 5, amrap: false },
    { pct: 0.90, reps: 5, amrap: false },
    { pct: 1.00, reps: TM_TEST_PASS_REPS, amrap: true },
  ];
}

/**
 * **The 7th-week deload.** 70% × 5, 80% × 3, 90% × 1, then a single at the training max.
 *
 * Forever p.21 — *"always used between your Leader and Anchor template."* No supplemental (p.19 says
 * so for all three 7th-week functions), no all-out set: the TM single is a prescribed single, and the
 * week's job is to arrive at the anchor recovered.
 *
 * ⚠️ **HIS SECOND SET IS 80% × 3-5 AND WE TAKE THE 3.** Bottom of his range, which is the deload
 * direction — *"the reason to deload is so that you never have to deload"* (p.21). The pick is ours;
 * the range is his.
 */
export function deloadSingleSets(): WendlerSet[] {
  return [
    { pct: 0.70, reps: 5, amrap: false },
    { pct: 0.80, reps: 3, amrap: false },
    { pct: 0.90, reps: 1, amrap: false },
    { pct: 1.00, reps: 1, amrap: false },
  ];
}

// ── Warm-up ramp (Wendler 2nd ed. p.31) ──────────────────────────────────────
// 1×5 @ 40%, 1×5 @ 50%, 1×3 @ 60% of the working number, before the work sets. Every CYCLE week.
//
// ⛔ NONE ON A STANDALONE WEEK, and the reasoning is the old deload carve-out's, unchanged: those
// weeks open at 70% and climb, so they ARE the ramp — a 40/50/60 in front would run three lighter
// weights and then cover the same ground again. The book is silent on it; the sets equalling the
// ramp is the reason (Michael, 2026-08-12). ⚠️ The carve-out USED to live inside this function as
// `weekInCycle === 4`; there is no week 4 any more, so the standalone weeks simply never call it.
//
// ⚠️ SEPARATE FROM `setsForWeek` BY DESIGN. The work-set generator and its pin tests stay untouched;
// warm-ups are a distinct list the composer prepends, tagged `warmup`, so nothing downstream that
// counts sets (AMRAP index, e1RM, workload) has to change shape to keep them out.
const WARMUP_PCTS: readonly [number, number, number] = [0.40, 0.50, 0.60];
const WARMUP_REPS: readonly [number, number, number] = [5, 5, 3];

export function warmupSetsForWeek(weekInCycle: number): WendlerSet[] {
  if (weekInCycle < 1 || weekInCycle > WEEKS_PER_CYCLE) {
    throw new Error(`weekInCycle must be 1-${WEEKS_PER_CYCLE}, got ${weekInCycle}`);
  }
  return WARMUP_PCTS.map((pct, i) => ({ pct, reps: WARMUP_REPS[i], amrap: false, warmup: true }));
}

// ── The working number ───────────────────────────────────────────────────────

/** Barbell plates load in 5 lb pairs. Round DOWN — see roundDownToIncrement. */
const INCREMENT_LB = 5;

/** The empty Olympic barbell. Nothing on a barbell lift can be prescribed below it — a warm-up that
 *  computes to 30 lb is un-loadable, so it clamps here (the athlete presses the empty bar). */
export const BAR_LB = 45;

/** The 35 lb (women's-class) bar — the floor for a lift not yet strong enough to live above 45. */
export const BAR_LB_LIGHT = 35;

/**
 * ⛔ THE PER-LIFT BAR FLOOR (2026-08-13, Michael: "we just flag people under 85 needed a women's
 * bar"). A lift whose lightest normal-week set (65% of the working number) clears the 45 lb bar
 * floors at 45 — only its deload ever clamps, and clamping UP to 45 is correct for that athlete.
 * A lighter lift floors at the 35 lb bar instead, and the PLAN'S COPY flags that those sets assume
 * a women's bar — a flag, not a locked door. The entry gate below 65 lb 1RM (35 / 0.5525) is where
 * the door actually closes, because under that even the light bar cannot be prescribed.
 * ⚠️ Derived from the WORKING NUMBER so both writers (composer, rematerializer) can ask it without
 * a 1RM in hand, and so the answer tracks the number the block actually runs on.
 */
export function barFloorForWorkingNumber(workingNumber: number): number {
  return weightForSet(workingNumber, 0.65) >= BAR_LB ? BAR_LB : BAR_LB_LIGHT;
}

/**
 * ROUND DOWN, never to nearest. Overshoot writes a set the athlete cannot complete;
 * an undershoot is absorbed. The error is not symmetric. On a 5 lb grid the difference is
 * at most 2.5 lb, but the asymmetry is the point. Floors at one increment so nothing
 * resolves to zero.
 */
export function roundDownToIncrement(lb: number, increment = INCREMENT_LB): number {
  if (!Number.isFinite(lb) || lb <= 0) return 0;
  return Math.max(increment, Math.floor(lb / increment) * increment);
}

/**
 * Working number = **85% of the true 1RM**, rounded down.
 *
 * Wendler's standard is 90%; his guidance is to lower it when recovery is uncertain or
 * the athlete carries other physical demands, and 80–85% is his own current advice. An
 * endurance athlete running three days a week is exactly that case, and 85% is the top
 * of his band — the least aggressive deviation from standard that still buys the buffer.
 *
 * This buffer is why week one feels easy. That is conservative loading, NOT an on-ramp,
 * and the plan must never present it as easing the athlete in.
 */
export const WORKING_NUMBER_PCT_OF_1RM = 0.85;

export function workingNumberFrom1RM(oneRM: number): number {
  if (!Number.isFinite(oneRM) || oneRM <= 0) return 0;
  return roundDownToIncrement(oneRM * WORKING_NUMBER_PCT_OF_1RM);
}

/** Upper-body lifts step 5 lb a cycle; lower-body step 10. Wendler's numbers. */
export function cycleIncrementLb(isLowerBody: boolean): number {
  return isLowerBody ? 10 : 5;
}

/**
 * ⛔⛔ SUPERSEDED 2026-08-12 — BOTH THINGS THAT USED TO STAND HERE ARE GONE, AND THEY WERE OURS, NOT
 * WENDLER'S. Slice a; `docs/SLICE-strength-a-wendler-reset-2026-08-12.md`, folding into D-422.
 *
 * What was here, and is now deleted:
 *
 * 1. **`cappedCycleIncrementLb` / `MAX_CYCLE_STEP_PCT` (6%) / `MIN_PLATE_STEP_LB`** — a percentage
 *    cap that shrank Wendler's +5/+10 for a light bar (2026-07-27/28). **Wendler gives every lifter
 *    the same fixed jump.** p90, "5/3/1 for Beginners": *"Generally, I tell everyone to just do the
 *    program as is, regardless of training age."* p107 FAQ: used with *"both beginning and advanced
 *    lifters. Steady, slow progression will never go out of fashion."* The shrink was a patch for a
 *    brakeless system — a light training max walking past the 1RM with an AMRAP writing it back —
 *    and that writeback is dead (`adapt-plan`'s auto-progression was deleted; nothing takes a
 *    strength AMRAP and writes it back as the 1RM).
 *
 * 2. **`TM_CEILING_PCT_OF_1RM` (90%) / `tmCeilingLb`** — a hard bound of the training max at 90% of
 *    the 1RM ON FILE (2026-07-27/28), with the breaching step truncated onto it. **Wendler has no
 *    such ceiling.** p30: *"You keep on increasing the max you're working from every four weeks
 *    until you can no longer hit the prescribed sets and reps."* The brake is a MISS, not a number
 *    on file.
 *
 * ⛔ AND THE CEILING WAS NOT MERELY UN-BOOKISH — IT FROZE BLOCKS. Whenever ONE plate step covered the
 * 5-percentage-point gap between the 85% start and the 90% bound, cycles 2 and 3 came out
 * byte-identical: an OHP max ≲ 100 or a squat max ≲ 110 printed the same week 7 and week 11. That is
 * structural, not a light-lifter edge case, and it is the bug this slice kills.
 *
 * ⚠️ THE CIRCULARITY THE CEILING GUARDED IS GUARDED ELSEWHERE. The displayed e1RM record obeys the
 * trusted-rep ceiling (D-417, `trustedMaxRepsFor`), and the only writes to
 * `user_baselines.performance_numbers` for strength are the athlete's own typed number and
 * `save-baseline-test`. The cap was a door on a bricked-up wall.
 *
 * ⚠️ WHAT REPLACES BOTH: the hold-then-drop brake below (`STALL_CONFIRM_SESSIONS`). The number stops
 * rising the instant the athlete stops beating the target, and comes down 10% only on a CONFIRMED
 * stall. Everything above is history — do not reinstate a ratio guard without reading it.
 */

/**
 * The working number for a given cycle. Cycle 1 uses the base; every cycle after adds one
 * increment.
 *
 * ⚠️ **Do NOT recompute this from an AMRAP result.** A big top set is tempting to convert
 * into a new max and a new working number — Wendler deliberately does not. The increment
 * stays +5/+10 and the reps are *feedback*, not an input. Conservative by design.
 */
export function workingNumberForCycle(
  baseWorkingNumber: number,
  cycleIndex: number,
  isLowerBody: boolean,
): number {
  const steps = Math.max(0, cycleIndex - 1);
  return baseWorkingNumber + steps * cycleIncrementLb(isLowerBody);
}

/** Prescribed weight for a set. Rounded down, same rule as everywhere else. */
export function weightForSet(workingNumber: number, pct: number): number {
  return roundDownToIncrement(workingNumber * pct);
}

// ── Block shape ──────────────────────────────────────────────────────────────

export type CycleSlot = { index: number; kind: CycleKind; startWeek: number; endWeek: number };

/**
 * ⛔ THREE, NOT FOUR — changed 2026-08-15 (work order §1c). **A Forever cycle is three weeks and its
 * light week is standalone.** The 4 was the 2nd edition's shape (three work weeks plus a welded-on
 * deload) and it is what every consumer of this constant assumed.
 *
 * ⚠️ `startWeek + WEEKS_PER_CYCLE - 1` STILL GIVES A CYCLE'S LAST WEEK, so the arithmetic that reads
 * this constant is still correct — it just no longer covers a deload, because the deload is not in
 * the cycle. `rematerialize-strength-block`'s `cyclesFromStoredPhases` is the one caller that relied
 * on it spanning four; it is right by construction now.
 */
export const WEEKS_PER_CYCLE = 3;

/**
 * ⛔ THE PASS BAR ON A TM-TEST WEEK, AND IT IS OURS BECAUSE OUR TRAINING MAX IS.
 *
 * Forever pp.20-21 gives two bars for the same test: **3 reps at a 90% training max, or 5 reps at an
 * 85% one.** `WORKING_NUMBER_PCT_OF_1RM` is 0.85, so 5 is the one that applies to this engine. An
 * athlete hitting 3 has met his 90% bar against a number that is not 90%, which is why 3-4 HOLDS
 * rather than advancing — see `verdictFromTmTestSet`.
 */
export const TM_TEST_PASS_REPS = 5;

/**
 * How a block of N weeks divides into leader and anchor cycles.
 *
 * **12 weeks is the default: leader, leader, anchor — exactly Wendler's 2:1**, which he names as his
 * recommendation "for just about every lifter" (Forever p.17). **8 weeks gives 1:1, which he does
 * not list** — coherent (build, then express), but the pick is ours and it ships as the short
 * option, not the standard.
 *
 * ⛔ **16 WEEKS IS NOT OFFERED (2026-08-16).** Four cycles cannot be 2:1. Two anchors back to back
 * is the configuration this block exists to avoid for a concurrent athlete; three leaders and one
 * anchor detrains heavy expression. Rather than build a shape neither source supports, the length
 * is refused — see `blockWeeks`.
 *
 * The anchor always comes LAST: leaders build, the anchor expresses and measures.
 */
/**
 * ⛔⛔ SUPERSEDED 2026-08-16 — THE CONTINUITY TIERS ARE DELETED, AND THE RATIO IS FIXED AT 2:1.
 *
 * What stood here: `ContinuityTier` / `ContinuitySignal` / `continuityTier()` and a switch that
 * chose the leader:anchor split from how recently the athlete had lifted (continuous → 1 leader,
 * returning → 1, detrained → 2, unknown → 2), fed by a reader in
 * `generate-strength-plan/index.ts` over `learned_fitness.strength_1rms`.
 *
 * **Two bugs lived inside it, both verified by execution 2026-08-16:**
 *   1. `continuous` and `returning` produced **1 leader : 2 anchors** at three cycles — not one of
 *      Forever's three published models (3:2, 2:2, 2:1 — p.17), all of which are leader-weighted.
 *   2. That extra anchor cost a week, so the opening TM-test week was dropped for exactly those
 *      athletes. The shape furthest from the book, handed to the athletes most likely to use it.
 *
 * ⛔ **AND THE WHOLE AXIS WAS WRONG FOR THIS BLOCK.** Michael, 2026-08-16: an endurance load is a
 * permanent stressor, so this athlete never has the recovery headroom for back-to-back anchor
 * cycles. The tiers existed to graduate a well-trained lifter toward MORE anchors, which is the
 * wrong direction for every athlete Strong Focus serves. Deleted rather than corrected.
 *
 * **The rule now: every cycle but the last is a leader, and there are never more than two.**
 * 3 cycles → 2:1 (Wendler's own recommendation "for just about every lifter", p.17).
 * 2 cycles → 1:1 (ours — he does not publish it; it ships as the short option, not the standard).
 */
export type BlockShapeInputs = {
  /**
   * ⚠️ READ BY `assistanceTotalReps`, NOT BY THE BLOCK SHAPE. The leader/anchor ratio is fixed (see
   * `leaderCount`) — posture cannot buy an athlete more anchor cycles.
   */
  strengthPosture?: string | null;
};

/**
 * How many LEADER cycles a block of `count` cycles carries.
 *
 * ⛔ **EVERY CYCLE BUT THE LAST, CAPPED AT TWO. No inputs, no tiers, no overrides.** The anchor is
 * always last and there is always exactly one of it: leaders build, the anchor expresses and
 * measures. At the two lengths this block offers (§`blockWeeks`) that is 2:1 at three cycles and
 * 1:1 at two.
 *
 * ⚠️ THE ARGUMENTS ARE GONE ON PURPOSE. `weeks` and `inputs` used to steer this; a signature that
 * accepts inputs it ignores invites the next session to reconnect them.
 */
export function leaderCount(count: number): number {
  return Math.min(Math.max(0, count - 1), 2);
}

// ── THE WEEK MAP ─────────────────────────────────────────────────────────────
//
// ⛔ THE BLOCK IS NO LONGER "N FOUR-WEEK CYCLES END TO END" (2026-08-15, work order §1c). It is a
// SEQUENCE of three-week cycles with standalone light weeks placed between them, and a TM-test week
// at each end where the budget allows. `cyclesForBlock` is now a VIEW over this map rather than the
// thing that decides the shape.
//
// The order, and every piece of it is Forever's:
//
//   [TM test]  leader × L   [7th-week deload]   anchor   [deload]   anchor …   TM test
//
//   · the opening test week      — p.21, *"Prior to any Leader template, I recommend you perform a
//                                  training max test week"* (bold in the book)
//   · leaders before anchors     — p.18, build then express. Unchanged from before this rewrite.
//   · the deload between them    — p.21, *"always used between your Leader and Anchor template"*
//   · a deload between anchors   — p.21's *"may choose to use it after any cycle"* licence; two
//                                  anchor cycles back to back with no unload is not a shape he runs
//   · the closing test week      — the block-to-block transition gate (SPEC §1b's outstanding debt)
//
// ⛔ THE OPENING TEST WEEK IS THE PIECE THAT YIELDS WHEN THE BUDGET IS SHORT, and only that piece.
// An 8-week block costs 9 with it, so it drops and the entry gate's 1RM stands in — which the plan
// copy states rather than leaving implied. Everything else is structural.
//
// Worked, against the work order's §0 map:
//   12 weeks · L-L-A → test + 3 + 3 + deload + 3 + test              = 1+3+3+1+3+1 = 12 ✓
//   16 weeks · L-L-A-A → test + 3+3 + deload + 3 + deload + 3 + test = 1+3+3+1+3+1+3+1 = 16 ✓
//    8 weeks · L-A → 3 + deload + 3 + test                           = 3+1+3+1 = 8 ✓ (no opening test)

export type WeekKind =
  /** A week inside a three-week leader or anchor cycle. */
  | 'cycle'
  /** A standalone TM-test week (Forever pp.20-21). */
  | 'tm_test'
  /** A standalone 7th-week deload (Forever p.21). */
  | 'deload_single';

export type BlockWeek = {
  /** 1-based plan week. */
  week: number;
  kind: WeekKind;
  /** Cycle weeks only: which cycle (1-based, counting only cycles). */
  cycleIndex?: number;
  cycleKind?: CycleKind;
  /** Cycle weeks only: 1..WEEKS_PER_CYCLE. */
  weekInCycle?: number;
  /**
   * ⛔ WHOSE WORKING NUMBER THIS WEEK RUNS ON — present on EVERY week, standalone ones included.
   *
   * A standalone week has no cycle of its own, so it takes the number of the cycle immediately
   * BEFORE it: a 7th-week deload unloads the training max just used, and the closing TM test tests
   * the number the block arrived at, which is what makes its verdict the next block's gate.
   */
  workingNumberCycle: number;
};

export type BlockLayout = {
  cycles: number;
  leaders: number;
  anchors: number;
  /** The exact number of weeks this layout occupies. */
  weeks: number;
};

/**
 * ⛔ THE TWO LENGTHS THIS BLOCK OFFERS, AND THERE ARE NO OTHERS (2026-08-16).
 *
 * A cycle costs three weeks, every cycle but the last is followed by a light week, and the closing
 * TM test costs one: `3c + (c − 1) + 1 = 4c`. So the shape is a multiple of four by arithmetic, and
 * the product offers exactly two of them.
 *
 * ⚠️ **16 IS DELIBERATELY ABSENT.** Four cycles cannot be 2:1 — see the note on `leaderCount`.
 * ⚠️ **4 IS DELIBERATELY ABSENT.** One cycle is a single anchor with no leader in front of it: no
 * build phase, straight to 95% and rep-outs. That is not a block, it is a test.
 */
export const BLOCK_WEEKS_OFFERED: readonly number[] = [8, 12];

/**
 * ⛔ THE SHORTEST BLOCK THE PRODUCT BUILDS. Two cycles — one leader, one anchor — plus the light
 * week between them and the closing test.
 */
export const MIN_BLOCK_WEEKS = BLOCK_WEEKS_OFFERED[0];

function cyclesForLength(weeks: number): number {
  return Math.max(1, Math.round(weeks / (WEEKS_PER_CYCLE + 1)));
}

/**
 * The layout for a block length.
 *
 * ⚠️ **NO `inputs` ANY MORE (2026-08-16).** The shape used to depend on continuity tier, posture and
 * aerobic load, so two blocks of the same LENGTH could have different internal maps. They cannot
 * now: **length alone determines the map.** That is why the composer's stored `phase_structure` and
 * any later re-derivation can no longer disagree.
 */
export function blockLayoutFor(weeks: number): BlockLayout {
  const w = blockWeeks(weeks);
  const cycles = cyclesForLength(w);
  const leaders = leaderCount(cycles);
  return { cycles, leaders, anchors: cycles - leaders, weeks: w };
}

/**
 * ⛔ A BLOCK IS ONE OF `BLOCK_WEEKS_OFFERED` — anything else SNAPS DOWN to the nearest offered
 * length, and anything under the minimum resolves to the minimum.
 *
 * ⚠️ It is not a search any more. A malformed request degrades to a complete legal block rather than
 * to whatever arithmetic happened to fit.
 */
export function blockWeeks(requested: number): number {
  const w = Number(requested);
  if (!Number.isFinite(w) || w < MIN_BLOCK_WEEKS) return MIN_BLOCK_WEEKS;
  const floored = Math.floor(w);
  let best = MIN_BLOCK_WEEKS;
  for (const offered of BLOCK_WEEKS_OFFERED) if (offered <= floored) best = offered;
  return best;
}

/**
 * The block, week by week.
 *
 * ⛔ **THE SHAPE, AND EVERY PIECE OF IT IS FOREVER'S:**
 * `leader ×L · [light] · anchor · [light] … · TM test`
 *
 * · **A light week after EVERY cycle, not only between the templates** — p.21's own licence: the
 *   7th-week deload *"may be used as a deload after any cycle, especially older lifters and taxing
 *   programs — this is your responsibility."* A concurrent athlete is the taxing case, and three
 *   uninterrupted weeks is the ceiling this block runs to (2026-08-16, Michael).
 * · **No opening TM-test week.** ⛔ **KNOWINGLY OVERRIDES p.21's bolded recommendation** to test
 *   before any leader template. Michael, 2026-08-16: a test week is a data-collection event, not a
 *   training stimulus, and spending a week of recovery capital to confirm a number the intake can
 *   derive is inefficient for an athlete carrying endurance load. **Ours, not his — and the plan's
 *   copy must say the block starts from a derived number rather than a tested one.**
 * · **The closing TM test** is the block-to-block gate; its verdict sets the next block's number.
 *
 * ⚠️ THE LAST CYCLE IS FOLLOWED BY THE TEST WEEK, NOT BY A DELOAD — the test week IS a light week
 * (it opens at 70% and carries no supplemental), so a deload in front of it would be two in a row.
 */
export function buildWeekMap(weeks: number): BlockWeek[] {
  const layout = blockLayoutFor(weeks);
  const out: BlockWeek[] = [];
  let week = 1;
  let cycleIndex = 0;

  const pushCycle = (kind: CycleKind) => {
    cycleIndex += 1;
    for (let w = 1; w <= WEEKS_PER_CYCLE; w += 1) {
      out.push({ week: week++, kind: 'cycle', cycleIndex, cycleKind: kind, weekInCycle: w, workingNumberCycle: cycleIndex });
    }
  };
  const pushStandalone = (kind: 'tm_test' | 'deload_single') => {
    // A standalone week runs on the number of the cycle before it.
    out.push({ week: week++, kind, workingNumberCycle: Math.max(1, cycleIndex) });
  };

  const kinds: CycleKind[] = [
    ...Array.from({ length: layout.leaders }, () => 'leader' as const),
    ...Array.from({ length: layout.anchors }, () => 'anchor' as const),
  ];
  kinds.forEach((kind, i) => {
    pushCycle(kind);
    // A light week after every cycle EXCEPT the last, whose light week is the closing test.
    if (i < kinds.length - 1) pushStandalone('deload_single');
  });
  pushStandalone('tm_test');
  return out;
}

/** One week's shape. Null when the week falls outside the block. */
export function blockWeekFor(weeks: number, week: number): BlockWeek | null {
  return buildWeekMap(weeks).find((w) => w.week === week) ?? null;
}

/**
 * The leader/anchor cycles, as start/end week ranges. ⛔ A VIEW OVER `buildWeekMap`, not a second
 * shape decision — the two cannot disagree.
 *
 * ⚠️ `endWeek` IS THE CYCLE'S LAST WORK WEEK AND NO LONGER INCLUDES A DELOAD. Anything that used
 * `startWeek..endWeek` to mean "this cycle including its unload" now covers three weeks, not four,
 * and the standalone weeks between cycles belong to NO cycle. That is the correct answer — a 7th
 * week is not part of either template — but it is a real change for anything grouping logged work.
 */
export function cyclesForBlock(weeks: number): CycleSlot[] {
  const byIndex = new Map<number, CycleSlot>();
  for (const w of buildWeekMap(weeks)) {
    if (w.kind !== 'cycle' || w.cycleIndex == null) continue;
    const cur = byIndex.get(w.cycleIndex);
    if (cur) cur.endWeek = w.week;
    // ⛔ LEADERS FIRST, ANCHORS LAST, ALWAYS. The COUNT varies; the order never does — leaders
    // build and anchors express, so an anchor before a leader is not a different ratio, it is a
    // different programme. `buildWeekMap` emits them in that order and this preserves it.
    else byIndex.set(w.cycleIndex, { index: w.cycleIndex, kind: w.cycleKind!, startWeek: w.week, endWeek: w.week });
  }
  return [...byIndex.values()].sort((a, b) => a.index - b.index);
}

/**
 * The cycle a week belongs to. ⛔ **NULL ON A STANDALONE WEEK** — a TM-test or 7th-week deload is
 * inside no cycle, and every caller must handle that rather than treating null as "outside the
 * block". Use `blockWeekFor` when you need to tell the two apart.
 */
export function cycleForWeek(
  weeks: number,
  week: number,
): { slot: CycleSlot; weekInCycle: number } | null {
  const slot = cyclesForBlock(weeks).find((c) => week >= c.startWeek && week <= c.endWeek);
  if (!slot) return null;
  return { slot, weekInCycle: week - slot.startWeek + 1 };
}

// ── The 95% validity check ───────────────────────────────────────────────────

/**
 * ⛔ CORRECTED 2026-07-28 AGAINST THE PRIMARY. This block used to read: *"Wendler: you should
 * always be able to hit at least five reps at 95% of the working number."* **That sentence is not
 * in the book.** The full 134-page 2nd edition was searched — no five-reps-at-95% rule, and the
 * phrase "always be able" does not occur. It came in through a secondary source.
 *
 * ⛔ WHAT THE BOOK PRESCRIBES AT 95% IS ONE REP. p23: week three is
 * `75% x 5 · 85% x 3 · 95% x 1 or more reps`. **One rep at 95% IS the prescription being met.**
 * The old threshold reset an athlete who got four — four times the stated minimum — and dropped
 * their working number 10% for it.
 *
 * ⛔ AND THE BOOK'S ACTUAL TRIGGER IS FAILING THE PRESCRIPTION, NOT FALLING SHORT OF A TARGET.
 * p30: *"You keep on increasing the max you're working from every four weeks **until you can no
 * longer hit the prescribed sets and reps**."* So advancement is the default and a MISS is the
 * event — which is also why an absent verdict must not be a reset (§0h).
 *
 * The 95% set is still the right place to ask: week 3 of every cycle is it, so weeks 3 and 7 are
 * stall triggers and week 11 is the block-to-block transition gate.
 *
 * ⛔ **This replaces an adherence threshold, and is better than one.** An athlete can attend every
 * session and still be carrying a working number that is too heavy; attendance cannot detect that,
 * the rep count can. Do not add an attendance percentage.
 *
 * ⚠️ `5/3/1 Forever` may well carry a five-rep rule — it is where leader/anchor and the 25-50
 * assistance range come from, neither of which is in this edition either. **Until someone reads it,
 * a five-rep threshold cannot be attributed to Wendler and must not behave as though it were.**
 * See Q-220.
 */
export const VALIDITY_CHECK_PCT = 0.95;
/** The PRESCRIBED minimum at 95% — `1+`, from p23. Meeting it is a pass. */
export const VALIDITY_CHECK_MIN_REPS = 1;

/**
 * ⛔ MOVED OUT 2026-08-30 — the trusted-rep ceiling is a measurement-accuracy limit, not programming,
 * and it was the last thing the LIVE strength path imported from this file. It now lives in
 * `_shared/strength/trusted-reps.ts` with its full provenance. Re-exported here so archived code
 * keeps resolving; do NOT redefine it below.
 */
export {
  ESTIMATE_TRUSTED_MAX_REPS,
  ESTIMATE_TRUSTED_MAX_REPS_DEADLIFT,
  trustedMaxRepsFor,
} from '../../../_shared/strength/trusted-reps.ts';
import { trustedMaxRepsFor } from '../../../_shared/strength/trusted-reps.ts';

/**
 * `advance_untrusted` — the number goes up, the estimate does not get to compound.
 *
 * ⛔ IT IS NOT A THIRD KIND OF ADVANCE, IT IS AN ADVANCE PLUS A PROVENANCE FLAG. `applyVerdict`
 * treats it exactly as `advance`; what changes is that the e1RM read off that set is outside the
 * reliable range, so the next standardised read SUPERSEDES it rather than building on it.
 *
 * ⚠️ ANY NEW CONSUMER MUST HANDLE IT. It was added to a union that had three members and is deliberately
 * NOT a member of `advance` — a `verdict === 'advance'` check will now silently miss these sets.
 * Search the union before adding a fourth.
 */
/**
 * ⛔ ONE MEMBER ADDED 2026-08-12 (slice a) — `miss`, which splits what `reset` used to conflate.
 *
 * - **`miss`** — the prescription was not met at the measured set. **One `miss` holds. It is
 *   `workingNumberForCycles` that turns a CONFIRMED run of them into a reset** (p33: one bad day is
 *   not a reset), so a single miss can never drop the bar no matter which caller passes it.
 *
 * `reset` survives as the EXPLICIT instruction — "drop 10% now" — which a caller may still pass and
 * which the stall counter produces internally. Nothing derives it from one session any more.
 *
 * ⚠️ `hold` AND `miss` ARE DIFFERENT FACTS AND MUST NOT BE COLLAPSED BACK. `hold` = no evidence
 * (skipped) · `miss` = evidence of failure. They move the bar identically THIS cycle and diverge
 * entirely across cycles: only a `miss` counts toward a stall.
 *
 * ⛔ A THIRD MEMBER, `hold_at_target`, WAS BUILT AND THEN REJECTED THE SAME DAY. It held the number
 * when the athlete hit the prescribed rep without beating it — "only climb when you beat the target",
 * on field precedent (Juggernaut, StrongLifts). **Michael's call: do what Wendler says, do not
 * interpret.** p24: *"Doing the prescribed reps shows you and your body that you're strong enough for
 * the workout. The extra reps are your way of dominating the workout."* Hitting the minimum is a PASS.
 * p30 makes advancement the default until you *"can no longer hit the prescribed sets and reps."*
 * Do not re-add it: 1 rep at 95% advances.
 *
 * ⚠️ EVERY ALLOWLIST OVER THIS UNION MUST BE WIDENED WITH IT — `generate-strength-plan/index.ts`
 * validates incoming verdicts against a `Set` and silently DISCARDS unlisted values, which would
 * turn a real miss into the forecast's `advance`.
 */
/**
 * ⛔ A SIXTH MEMBER ADDED 2026-08-15 (§1d) — `recalibrate`, and it is the one verdict that does NOT
 * describe a delta.
 *
 * A TM-test week's top set is at the training max itself. Two reps or fewer there is not a bad day
 * and it is not a stall: **the number is simply wrong**, and Forever p.21 says what to do about it —
 * *"use the formula … and adjust your training max to be 85-90% of that."* So the answer is an
 * ABSOLUTE number computed off the set, not a step or a percentage off the old one.
 *
 * ⛔ **`applyVerdict` THEREFORE TREATS IT AS A HOLD, AND THAT IS CORRECT, NOT A GAP.** A pure
 * function that sees one verdict cannot know what the set weighed. The absolute number travels
 * separately, as the next block's `priorTrainingMax` (`trainingMaxFromSet`) — which is the same seam
 * the AMRAP catch-up already uses to raise a number rather than step it.
 *
 * ⚠️ AND IT CLEARS THE STALL RUN rather than counting toward it. A recalibration has already banked
 * the correction; counting it as a miss would then drop the freshly-computed number another 10%.
 */
export type WorkingNumberVerdict =
  | 'advance'
  | 'advance_untrusted'
  | 'reset'
  | 'hold'
  | 'miss'
  | 'recalibrate';

/**
 * ⛔ THE MISS BAND ON A TM-TEST WEEK. Two reps or fewer at the training max.
 *
 * ⚠️ **THIS IS HIS NUMBER, NOT OURS.** Forever p.21, verbatim in
 * `docs/REFERENCE-531-forever-pp16-45.md`: *"TM too high: only 1-2 reps at TM → lower it. Recompute
 * estimated max (weight × reps × .0333 + weight) and set TM to 85-90% of that."* An earlier draft of
 * this comment marked it T3/ours — it is not; the band and the remedy are both on the page.
 *
 * The three bands do not overlap: 5+ passes (his 85%-TM bar, p.20), 3-4 is the tolerance band that
 * holds, and at 2 or fewer the number is wrong rather than the day.
 */
export const TM_TEST_MISS_MAX_REPS = 2;

/**
 * What happens to the working number, given the reps achieved on a TM-TEST week's top set.
 *
 * ⛔ THIS IS A DIFFERENT QUESTION FROM `verdictFrom95Set` AND MUST NOT BE COLLAPSED INTO IT. That one
 * reads a set at **95% of the training max** with a prescribed minimum of ONE rep (2nd ed. p.23);
 * this one reads a set at **100% of it** with a bar of five (Forever p.20-21). Same shape of answer,
 * different prescription, different weights — running either rule over the other's set is how an
 * athlete gets reset for completing the session as written.
 *
 * | reps | verdict | why |
 * |---|---|---|
 * | `null` | `hold` | the test was not done — no evidence either way (§0h) |
 * | `0`–`2` | `recalibrate` | the training max is wrong, not the day. p.21's formula recomputes it |
 * | `3`–`4` | `hold` | his 3-rep bar is for a 90% TM; ours is 85%, so this is short of the pass |
 * | `5`+ | `advance` | the bar is met — the number carries into the next cycle a step higher |
 * | `> trusted` | `advance_untrusted` | advances, but the e1RM off that set is outside Brzycki's range |
 */
export function verdictFromTmTestSet(
  repsAchieved: number | null | undefined,
  liftName?: string | null,
): WorkingNumberVerdict {
  if (repsAchieved == null || !Number.isFinite(repsAchieved)) return 'hold';
  if (repsAchieved <= TM_TEST_MISS_MAX_REPS) return 'recalibrate';
  if (repsAchieved < TM_TEST_PASS_REPS) return 'hold';
  return repsAchieved > trustedMaxRepsFor(liftName) ? 'advance_untrusted' : 'advance';
}

/**
 * What happens to the working number, given the reps achieved on the 95% set.
 *
 * | reps | verdict | why |
 * |---|---|---|
 * | `null` | `hold` | the session was not done — no evidence either way (§0h) |
 * | `0` | `miss` | logged, and the prescribed single was NOT completed. **One miss HOLDS**; the reset needs a confirmed pattern (p33) |
 * | `1`–`8` | `advance` | p23 prescribes `95% x 1 or more reps`. One rep IS the prescription met, and meeting it is a pass |
 * | `> 8` | `advance_untrusted` | the prescription is met and then some — the bar still climbs. What is not trusted is the e1RM off this set, which sits above the range where Brzycki holds |
 *
 * ⛔ THE `1` ROW IS THE BOOK'S, NOT A PRODUCT CALL — AND A "BEAT THE TARGET TO CLIMB" RULE WAS BUILT
 * AND REJECTED HERE ON 2026-08-12. That rule made a bare-minimum single hold the number
 * (`hold_at_target`), reasoning from field precedent rather than from Wendler. Michael's call: do
 * what the book says.
 *   p23 — week three's top set is `95% x 1 or more reps`.
 *   p24 — *"Doing the prescribed reps shows you and your body that you're strong enough for the
 *         workout. The extra reps are your way of dominating the workout."* The minimum is a PASS;
 *         the bonus reps are dominance, not the entry fee.
 *   p30 — *"you keep on increasing the max you're working from every four weeks until you can no
 *         longer hit the prescribed sets and reps."* Advancement is the default. Only a genuine miss
 *         stops it — which is what `miss` is for.
 *
 * ⛔ AND `0` NO LONGER RESETS BY ITSELF. p33 ("Having a Less Than Stellar Day"): the answer to a bad
 * day is *"getting your prescribed weights and leaving"* — not a recalculation. The 10% drop is
 * p31's STALL, which is a pattern; `workingNumberForCycles` confirms it across
 * `STALL_CONFIRM_SESSIONS` measured points before it fires.
 *
 * ⛔ THE TOP BAND STILL WITHHOLDS NOTHING. An earlier draft was going to flag a big set INSTEAD of
 * advancing — Michael caught it: *"A 12-rep set at 95% means the athlete is genuinely much stronger
 * than the TM says. Withholding the advance punishes them for it."* The measurement concern and the
 * training concern are separate questions with opposite answers, and only the measurement one is in
 * doubt. See `ESTIMATE_TRUSTED_MAX_REPS`.
 */
export function verdictFrom95Set(
  repsAchieved: number | null | undefined,
  /** ⚠️ Optional so every existing caller is unchanged. Absent → the general 8-rep ceiling. */
  liftName?: string | null,
): WorkingNumberVerdict {
  if (repsAchieved == null || !Number.isFinite(repsAchieved)) return 'hold';
  if (repsAchieved < VALIDITY_CHECK_MIN_REPS) return 'miss';
  return repsAchieved > trustedMaxRepsFor(liftName) ? 'advance_untrusted' : 'advance';
}

/**
 * A reset drops the working number 10% and rebuilds from there — Wendler's own number.
 *
 * p31: *"I simply take 90% of my max … and start all over again … This is a matter of taking three
 * steps forward and one step back."* Per lift: *"You may stall out with one lift before you do with
 * the others. When this happens, you only need to decrease the one stalled lift."*
 */
export const RESET_FRACTION = 0.10;

/**
 * ⛔ HOW MANY CONSECUTIVE MEASURED MISSES CONFIRM A STALL. Slice a, 2026-08-12. **Two.**
 *
 * It is a locked product decision behind a name, not a magic number, because it is the entire
 * distance between p33 and p31:
 *
 * - **p33, one bad day** — *"you're not always going to have great training days … go into the weight
 *   room with one purpose: getting your prescribed weights and leaving."* A single miss is a bad day.
 *   It must cost the athlete NOTHING: the weight repeats, which is the free re-try.
 * - **p31, the stall** — *"You'll eventually come to a point where you can't make any more progress
 *   on a lift. You won't be able to hit the sets and reps you're supposed to hit."* A pattern. THAT
 *   is what earns the 10%.
 *
 * ⚠️ THE MEASURED POINT IN THIS ENGINE IS THE WEEK-3 95% SET — ONE PER CYCLE. So two consecutive
 * misses means two consecutive CYCLES failing the prescription at the same weight (the first miss
 * held it), which is roughly two months. Field precedent sits either side of that and both hold
 * first: StrongLifts deloads 10% after three consecutive failed SESSIONS; Juggernaut resets after
 * barely-hitting across more than one cycle. Widening the signal beyond the 95% set would make this
 * fire sooner and is deliberately out of scope here.
 *
 * ⚠️ AN UNLOGGED CYCLE IS NOT A MISS AND DOES NOT BREAK THE RUN. A skipped session is no evidence
 * either way, so it neither counts toward a stall nor clears one — the two misses stay consecutive
 * *measured* points. A cycle where the athlete MET the prescription clears the count outright.
 */
export const STALL_CONFIRM_SESSIONS = 2;

/**
 * One cycle's step. Pure and stateless: it applies the verdict it is handed and nothing else.
 *
 * ⛔ IT CANNOT RESET ON A `miss` AND THAT IS THE POINT — a stall is a PATTERN, and a function that
 * sees one cycle cannot see a pattern. `workingNumberForCycles` owns the counting and hands this
 * function an explicit `reset` once the run is confirmed. Do not "fix" `miss` to reset here.
 *
 * ⚠️ RETURNS A BARE NUMBER as of 2026-08-12. It used to return `{ workingNumber, ceilingHit }`
 * because the 90% ceiling had to travel with the number; there is no ceiling now.
 */
export function applyVerdict(
  workingNumber: number,
  verdict: WorkingNumberVerdict,
  isLowerBody: boolean,
): number {
  if (verdict === 'reset') return roundDownToIncrement(workingNumber * (1 - RESET_FRACTION));
  // ⛔ `recalibrate` HOLDS HERE, AND THAT IS THE DESIGN. The new number is computed off the test set
  // itself (`trainingMaxFromSet`) and arrives as an absolute — this function has no set to read.
  // Guessing a delta for it would be inventing a step the book does not prescribe.
  if (verdict === 'recalibrate') return workingNumber;
  // ⛔ `advance_untrusted` ADVANCES. This guard used to be `verdict !== 'advance'`, which would have
  // silently swallowed the new verdict and held the bar — the exact behaviour the verdict exists to
  // avoid. The distrust is about the ESTIMATE, never about the load: a set that beats the
  // prescription earns its step whether or not we believe the number computed off it.
  //
  // ⚠️ `hold` and `miss` both land here and both leave the number ALONE. They are different facts
  // with the same one-cycle consequence; the difference lives in the walker.
  if (verdict !== 'advance' && verdict !== 'advance_untrusted') return workingNumber;

  // ⛔ WENDLER'S FIXED STEP, FOR EVERY ATHLETE. +5 upper / +10 lower, no percentage shrink for a
  // light bar (p90, p107 — see the superseded block at the top of this file).
  return workingNumber + cycleIncrementLb(isLowerBody);
}

/**
 * ⛔ THE EARNABLE ADVANCE — `workingNumberForCycle` with the verdicts applied in order.
 *
 * `workingNumberForCycle(base, cycleIndex, isLowerBody)` takes no performance input at all: it steps
 * +5 upper / +10 lower per cycle and nothing can stop it. Miss the reps and the bar climbs anyway,
 * then the AMRAP measures that bar and writes it back as the athlete's 1RM. The plan grades its own
 * homework (D-326 layer 2).
 *
 * This walks the cycles instead, applying each cycle's verdict to decide what the NEXT one carries:
 *   advance → +5 / +10 (Wendler's step, and what a FORECAST's absent verdict means)
 *   miss    → unchanged the first time; −10% once `STALL_CONFIRM_SESSIONS` in a row confirm it
 *   reset   → −10% now, explicitly
 *   hold    → unchanged; the session was not done, so there is no evidence to advance on
 *
 * ⛔ THE STALL COUNT LIVES HERE, NOT IN `applyVerdict`, AND NOT IN THE READER. It is the only layer
 * that sees more than one cycle. Consequence worth knowing: the count is derived fresh from the
 * verdict array on every call, so nothing is persisted and two calls with the same inputs give the
 * same answer — the purity `q223-block-advance.test.ts` asserts.
 *
 * ⚠️ `verdicts[i]` is the verdict EARNED IN CYCLE i+1, deciding what cycle i+2 gets. A 12-week block
 * has three cycles and therefore at most two verdicts that matter — the third cycle's is the next
 * block's problem.
 *
 * ⚠️ BEHAVIOUR-UNCHANGED with no verdicts: every cycle resolves to `advance`, which is arithmetically
 * identical to `workingNumberForCycle`. Asserted in the tests.
 */
export function workingNumberForCycles(
  baseWorkingNumber: number,
  cycleIndex: number,
  isLowerBody: boolean,
  verdicts?: readonly WorkingNumberVerdict[],
  opts?: {
    /**
     * ⛔ WHAT A MISSING VERDICT MEANS, AND IT DEFAULTS TO `hold`. Michael, 2026-07-27:
     * *"A missing signal is not evidence of progress."*
     *
     * It used to default to `advance`, which meant a complete, tested, correct advancement mechanism
     * with **zero suppliers** advanced unconditionally while appearing to have earned it — the
     * failure looked exactly like normal operation. Silent subtraction's cousin.
     *
     * ⚠️ `'advance'` IS STILL CORRECT IN ONE CASE AND ONE ONLY: **forecasting a block that has not
     * been trained yet.** A fresh 12-week plan projects three cycles into the future; no evidence can
     * exist for them, and flattening the projection would show the athlete identical weights in
     * cycles 1, 2 and 3. That is a FORECAST, and the caller must say so explicitly.
     * ⛔ Regeneration and adaptation must NOT pass it — there, absent means nothing was logged.
     */
    unknownMeans?: WorkingNumberVerdict;
  },
): { workingNumber: number; resetAtCycle: number | null } {
  const unknown = opts?.unknownMeans ?? 'hold';
  let wn = baseWorkingNumber;
  let consecutiveMisses = 0;
  let resetAtCycle: number | null = null;

  for (let step = 0; step < Math.max(0, cycleIndex - 1); step += 1) {
    const verdict = verdicts?.[step] ?? unknown;

    // ⛔ HOLD FIRST, DROP ON THE CONFIRMED SECOND. A `miss` becomes an actual reset only when it is
    // the `STALL_CONFIRM_SESSIONS`th in a row; until then it is a hold, and the athlete repeats the
    // same weight with no penalty (p33).
    let effective: WorkingNumberVerdict = verdict;
    if (verdict === 'miss') {
      consecutiveMisses += 1;
      effective = consecutiveMisses >= STALL_CONFIRM_SESSIONS ? 'reset' : 'hold';
    } else if (verdict !== 'hold') {
      // Evidence that the prescription was met — `advance` / `advance_untrusted`, or an explicit
      // `reset` that already banked the drop — clears the run.
      // ⚠️ A bare `hold` does NOT: no evidence must not launder a stall into a fresh start.
      // ⚠️ `recalibrate` CLEARS IT TOO (2026-08-15): the correction has already been banked as a new
      // absolute number, and counting it as a miss would drop that fresh number another 10%.
      consecutiveMisses = 0;
    }

    if (effective === 'reset') {
      // The rebuild starts clean: after a drop the athlete is working off a new number, so the next
      // miss is a first miss against it, not the third of an old run.
      consecutiveMisses = 0;
      if (resetAtCycle === null) resetAtCycle = step + 2;
    }

    wn = applyVerdict(wn, effective, isLowerBody);
  }

  // ⚠️ `resetAtCycle` IS THE SEAM SLICE b READS AND NOTHING CONSUMES IT TODAY. It replaces
  // `ceilingHitAtCycle` in the same position: the cycle a confirmed stall dropped this lift's number,
  // which is the calibration event that used to be reported as "pinned at the ceiling".
  return { workingNumber: wn, resetAtCycle };
}
