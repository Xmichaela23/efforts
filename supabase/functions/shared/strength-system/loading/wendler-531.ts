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
const PCT_BY_WEEK: Record<number, [number, number, number]> = {
  1: [0.65, 0.75, 0.85],
  2: [0.70, 0.80, 0.90],
  3: [0.75, 0.85, 0.95],
  4: [0.40, 0.50, 0.60], // deload
};

// Anchor = the standard 5/3/1 rep scheme, last set open.
const ANCHOR_REPS: Record<number, [number, number, number]> = {
  1: [5, 5, 5],
  2: [3, 3, 3],
  3: [5, 3, 1],
  4: [5, 5, 5],
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
  if (!pcts) throw new Error(`weekInCycle must be 1-4, got ${weekInCycle}`);
  const isDeload = weekInCycle === 4;
  const reps = kind === 'anchor' ? ANCHOR_REPS[weekInCycle] : ([5, 5, 5] as const);
  return pcts.map((pct, i) => ({
    pct,
    reps: reps[i],
    // Never on a deload, never in a leader, and only the last set.
    amrap: kind === 'anchor' && !isDeload && i === 2,
  }));
}

// ── Warm-up ramp (Wendler 2nd ed. p.31) ──────────────────────────────────────
// 1×5 @ 40%, 1×5 @ 50%, 1×3 @ 60% of the working number, before the work sets. Every working week.
//
// ⛔ NONE ON DELOAD. Week 4's work sets are already 40/50/60, so they ARE the ramp — a second
// 40/50/60 in front would run the same three weights twice, then top out at 60% either way. The book
// is silent on it; the deload sets equalling the ramp is the reason (Michael, 2026-08-12).
//
// ⚠️ SEPARATE FROM `setsForWeek` BY DESIGN. The work-set generator and its pin tests stay untouched;
// warm-ups are a distinct list the composer prepends, tagged `warmup`, so nothing downstream that
// counts sets (AMRAP index, e1RM, workload) has to change shape to keep them out.
const WARMUP_PCTS: readonly [number, number, number] = [0.40, 0.50, 0.60];
const WARMUP_REPS: readonly [number, number, number] = [5, 5, 3];

export function warmupSetsForWeek(weekInCycle: number): WendlerSet[] {
  if (weekInCycle < 1 || weekInCycle > 4) throw new Error(`weekInCycle must be 1-4, got ${weekInCycle}`);
  if (weekInCycle === 4) return []; // deload — the work sets are the ramp
  return WARMUP_PCTS.map((pct, i) => ({ pct, reps: WARMUP_REPS[i], amrap: false, warmup: true }));
}

// ── The working number ───────────────────────────────────────────────────────

/** Barbell plates load in 5 lb pairs. Round DOWN — see roundDownToIncrement. */
const INCREMENT_LB = 5;

/** The empty Olympic barbell. Nothing on a barbell lift can be prescribed below it — a warm-up that
 *  computes to 30 lb is un-loadable, so it clamps here (the athlete presses the empty bar). Standard
 *  men's bar; a lighter bar (women's 35, technique bars) is an equipment refinement, not handled yet. */
export const BAR_LB = 45;

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

export const WEEKS_PER_CYCLE = 4;

/**
 * How a block of N weeks divides into leader and anchor cycles.
 *
 * **12 weeks is the default: leader, leader, anchor — exactly Wendler's 2:1.** His listed
 * ratios are 2:1, 3:2 and 2:2. 16 weeks gives 2:2. **8 weeks gives 1:1, which he does not
 * list** — it is coherent (build, then express) but the pick is ours, and it ships as the
 * short, off-ratio option rather than the standard.
 *
 * The anchor always comes LAST: leaders build, the anchor expresses and measures.
 */
/**
 * ⛔ HOW MANY CYCLES BUILD BEFORE THE ONES THAT MEASURE. Decided 2026-07-28, Michael's call.
 *
 * The block was always 2 leaders + 1 anchor — the LEAST heavy configuration available, on the block
 * whose stated purpose is heavy work. Nothing chose that; it was the only configuration.
 *
 * The split now derives from training continuity across the four main lifts:
 *
 * | tier       | test                                  | leaders | anchors |
 * |------------|---------------------------------------|---------|---------|
 * | continuous | weeks_since ≤ 2 AND logs ≥ 24         | 0       | all     |
 * | returning  | anything between                      | 1       | rest    |
 * | detrained  | weeks_since ≥ 6 OR logs < 8           | 2       | rest    |
 * | unknown    | no `last_logged` at all               | 2       | rest    |
 *
 * ⚠️ DETRAINED IS THE **LEAST** ANCHOR-WEIGHTED, WHICH IS THE OPPOSITE OF THE FIRST DRAFT.
 * Michael: *"Leaders exist to build a base; detrained is the state where that base is missing.
 * Sending someone to two 95%-and-AMRAP cycles when their connective tissue is nine weeks behind
 * their nervous system is the one configuration that can hurt somebody."* Fewer anchors for the
 * detrained, not more.
 *
 * ⚠️ AND UNKNOWN IS NOT DETRAINED. A cold start has no `exercise_log` at all, so `sample_count: 0`
 * reads identically to "has not lifted in a year" — and those are different people. It gets its own
 * branch, and it resolves to 2+1, which is exactly today's behaviour. **So this ships as a pure
 * addition: every athlete without lifting history sees no change.**
 */
export type ContinuityTier = 'continuous' | 'returning' | 'detrained' | 'unknown';

export type ContinuitySignal = {
  /** Weeks since the most recent log across all four main lifts. Null = never logged. */
  weeksSince: number | null;
  /** Summed `sample_count` across the four lifts, 12-week window. */
  logs: number;
};

export function continuityTier(sig: ContinuitySignal | null | undefined): ContinuityTier {
  if (!sig || sig.weeksSince == null) return 'unknown';
  if (sig.weeksSince >= 6 || sig.logs < 8) return 'detrained';
  if (sig.weeksSince <= 2 && sig.logs >= 24) return 'continuous';
  return 'returning';
}

export type BlockShapeInputs = {
  continuity?: ContinuitySignal | null;
  /** `develop` is the only posture that earns an anchor-weighted block. */
  strengthPosture?: string | null;
  /** ⚠️ OVERRIDES TO 2+1 REGARDLESS OF TIER: a long block, or heavy aerobic load underneath. */
  highAerobicLoad?: boolean;
};

/** How many LEADER cycles a block of `count` cycles carries. */
export function leaderCount(count: number, weeks: number, inputs?: BlockShapeInputs): number {
  const fallback = Math.max(0, count - 1);   // today's shape: everything but the last is a leader
  if (count <= 1) return 0;
  // ⛔ THE OVERRIDES COME FIRST AND THEY ARE NOT TIER-SENSITIVE. Maintain posture is not asking for a
  // heavy block; a 16-week block has room to build; high aerobic load is already spending the
  // recovery an anchor cycle needs.
  if ((inputs?.strengthPosture ?? 'develop') !== 'develop') return fallback;
  if (weeks >= 16) return fallback;
  if (inputs?.highAerobicLoad) return fallback;

  switch (continuityTier(inputs?.continuity)) {
    case 'continuous': return 0;               // every cycle measures
    case 'returning':  return Math.min(1, fallback);
    case 'detrained':  return Math.min(2, fallback);
    case 'unknown':    return fallback;        // = today, exactly
  }
}

export function cyclesForBlock(weeks: number, inputs?: BlockShapeInputs): CycleSlot[] {
  const count = Math.max(1, Math.floor(weeks / WEEKS_PER_CYCLE));
  const leaders = leaderCount(count, weeks, inputs);
  return Array.from({ length: count }, (_, i) => {
    const index = i + 1;
    return {
      index,
      // ⛔ LEADERS FIRST, ANCHORS LAST, ALWAYS. The COUNT varies; the order never does — leaders
      // build and anchors express, so an anchor before a leader is not a different ratio, it is a
      // different programme.
      kind: index <= leaders ? 'leader' : 'anchor',
      startWeek: i * WEEKS_PER_CYCLE + 1,
      endWeek: (i + 1) * WEEKS_PER_CYCLE,
    } as CycleSlot;
  });
}

export function cycleForWeek(
  weeks: number,
  week: number,
  inputs?: BlockShapeInputs,
): { slot: CycleSlot; weekInCycle: number } | null {
  const slot = cyclesForBlock(weeks, inputs).find((c) => week >= c.startWeek && week <= c.endWeek);
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
 * ⛔ THE REP COUNT ABOVE WHICH THE ESTIMATE IS NOT TRUSTED — and it does NOT withhold the advance.
 *
 * Two facts point in opposite directions on a big set, and collapsing them is the mistake this
 * constant exists to prevent:
 *
 * - **Physiologically the athlete is stronger than the training max says.** Twelve reps at 95% means
 *   the number is too conservative, and that is Wendler's own read. Withholding the advance would
 *   punish an athlete for outperforming the prescription.
 * - **But the e1RM computed off that set is in the range where the equation degrades.** Brzycki's
 *   accuracy is best at 3-5 reps and falls away above ~10: LeSuer et al. 1997 found accuracy improved
 *   markedly when restricted to 2-10 rep sets; Reynolds et al. 2006 found 5RM the best predictor with
 *   substantial degradation higher; Mayhew et al. 2008 put the boundary under 10 reps.
 *
 * So the number ADVANCES and the estimate is MARKED. See `advance_untrusted`.
 *
 * ⚠️ 8 IS OURS. The literature gives a degradation zone, not a line — best accuracy 3-5, clear
 * degradation above 10. Eight sits inside the defensible band with a margin, and it must be stated
 * as a product decision wherever it is published rather than attributed to any of the papers above.
 */
export const ESTIMATE_TRUSTED_MAX_REPS = 8;

/**
 * ⛔ DEADLIFT GETS LESS ROPE, AND THE ERROR IS DIRECTIONAL NOT RANDOM.
 *
 * LeSuer et al. 1997 (*JSCR* 11(4):211-213) tested seven equations across bench, squat and deadlift.
 * Correlations were uniformly high (r > 0.95) — and **every equation significantly UNDERESTIMATED the
 * deadlift.** That is a bias with a direction, not scatter.
 *
 * ⚠️ AND IT COMPOUNDS WITH OURS. Brzycki already tends to underestimate. Both push the same way, so a
 * deadlift e1RM is systematically low rather than merely uncertain. Five reps is the range Reynolds
 * et al. 2006 found best (R² = 0.993 bench), so trusting the estimate only that far is where the
 * evidence is strongest — for the one lift that needs it most.
 *
 * ⚠️ 5 IS OURS, like the 8 above. The literature gives the direction and the degradation zone; it does
 * not name a line for any individual lift.
 */
export const ESTIMATE_TRUSTED_MAX_REPS_DEADLIFT = 5;

/**
 * The rep count above which this lift's estimate stops being trusted.
 *
 * ⚠️ MATCHED ON THE LIFT NAME, deliberately kept to a substring test so it survives "Deadlift",
 * "Conventional Deadlift" and "Trap Bar Deadlift" alike. A lift that does not match gets the general
 * ceiling, which is the safe direction: a new lift added later is trusted no MORE than the others.
 */
export function trustedMaxRepsFor(liftName?: string | null): number {
  return /deadlift/i.test(String(liftName ?? ''))
    ? ESTIMATE_TRUSTED_MAX_REPS_DEADLIFT
    : ESTIMATE_TRUSTED_MAX_REPS;
}

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
export type WorkingNumberVerdict =
  | 'advance'
  | 'advance_untrusted'
  | 'reset'
  | 'hold'
  | 'miss';

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
