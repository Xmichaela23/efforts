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

// ── The working number ───────────────────────────────────────────────────────

/** Barbell plates load in 5 lb pairs. Round DOWN — see roundDownToIncrement. */
const INCREMENT_LB = 5;

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
 * ⛔ THE INCREMENT IS CAPPED IN PERCENTAGE TERMS. Michael, 2026-07-27.
 *
 * Wendler's +5/+10 is calibrated to a barbell where 10 lb is roughly 3% of the training max — a
 * squat in the 300s. It is not wrong; it is OUT OF RANGE below that. On a 90 lb training max, +10 is
 * **11.1% per cycle**, and three cycles walk the training max from 90 to 110 against an entered 1RM
 * of 106. The bar passes the athlete's own max and the anchor AMRAP then measures it and writes it
 * back as the new max.
 *
 * So the step is the SMALLER of Wendler's absolute number and `MAX_CYCLE_STEP_PCT` of the current
 * working number, rounded down to plate granularity, floored at one increment of the bar.
 *
 * ⚠️ NOT TUNED TO ANYONE'S NUMBERS. The cap is relative by construction, so it is a no-op for the
 * athlete Wendler wrote for (at TM 340, 4% is 13.6 — the +10 wins) and it binds exactly where the
 * absolute number stops being proportionate.
 */
/**
 * ⛔ 6%, AND IT IS DERIVED RATHER THAN PICKED. Michael, 2026-07-27.
 *
 * It is the largest relative step Wendler's own absolute increments produce inside the range he
 * wrote for: +10 on a 170 lb training max (a ~200 lb squat, his lightest realistic case) is 5.9%.
 * So the cap bounds **only what he never anticipated** — a bar small enough that +10 is a double-digit
 * percentage — and is a no-op for every load he did.
 *
 * ⚠️ A FIRST DRAFT USED 4% AND OVERREACHED. With 5 lb plate granularity, 4% only reaches +10 at a
 * 250 training max, so every lower-body max from 125 to 249 stepped +5 where Wendler says +10 — a
 * 235 lb squat included. The intent was to bound the out-of-range case, not to slow the lifters the
 * absolute numbers were written for.
 */
export const MAX_CYCLE_STEP_PCT = 0.06;
export const MIN_PLATE_STEP_LB = 5;

export function cappedCycleIncrementLb(workingNumber: number, isLowerBody: boolean): number {
  const absolute = cycleIncrementLb(isLowerBody);
  if (!Number.isFinite(workingNumber) || workingNumber <= 0) return absolute;
  const relative = roundDownToIncrement(workingNumber * MAX_CYCLE_STEP_PCT);
  return Math.max(MIN_PLATE_STEP_LB, Math.min(absolute, relative));
}

/**
 * ⛔ THE INVARIANT THE INCREMENT CAP DOES NOT GIVE YOU: THE TRAINING MAX MAY NEVER EXCEED 90% OF THE
 * CURRENT 1RM. Michael, 2026-07-27: *"the increment cap slows drift, the ceiling bounds it."*
 *
 * The working number starts at 85% of the 1RM precisely so the last set of the anchor is worth
 * measuring. Nothing in the system knew that a training max above the max is impossible — three
 * clean advances walked straight past it. This is the hard stop, checked every cycle **regardless of
 * verdict**.
 *
 * ⚠️ A BREACH IS A GATED FATE, NOT A SILENT CLAMP (§5.2b's family). When an advance would cross the
 * ceiling the working number HOLDS and the reason is reported — the athlete is told their training
 * max has caught up with the max on file and the block needs a new one. Quietly clipping the number
 * would produce a plan that stops progressing for no stated reason.
 */
/**
 * ⛔ 100%: THE TRAINING MAX MAY NEVER EXCEED THE 1RM. Michael, 2026-07-27.
 *
 * ⚠️ A FIRST DRAFT USED 90% AND BOUND IN CYCLE 3 FOR EVERY ATHLETE. The working number STARTS at 85%
 * of the 1RM, so 90% leaves only five points of headroom while three cycles of Wendler's own
 * increments spend about seven — a 315 lb squat held at 275 instead of reaching 285, which stops the
 * standard block advancing in its measuring cycle. That is a far broader change than the drift the
 * ceiling exists to bound.
 *
 * At 100% the CAP does the work and the ceiling is the backstop: it fires only where the capped step
 * would still carry the bar past the max it was derived from.
 */
export const TM_CEILING_PCT_OF_1RM = 1.00;

export function tmCeilingLb(oneRM: number): number {
  if (!Number.isFinite(oneRM) || oneRM <= 0) return Number.POSITIVE_INFINITY;
  return roundDownToIncrement(oneRM * TM_CEILING_PCT_OF_1RM);
}

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
 * Wendler: **you should always be able to hit at least five reps at 95% of the working
 * number. If you can't, the number is too high — reset it.** His reasoning: on your worst
 * day you can still complete the minimum.
 *
 * That check already sits inside the block — **week 3 of every cycle is the 95% set.** So
 * weeks 3 and 7 are stall triggers and week 11 is the block-to-block transition gate.
 *
 * ⛔ **This replaces an adherence threshold, and is better than one.** An athlete can
 * attend every session and still be carrying a working number that is too heavy;
 * attendance cannot detect that, the rep count can. Do not add an attendance percentage.
 */
export const VALIDITY_CHECK_PCT = 0.95;
export const VALIDITY_CHECK_MIN_REPS = 5;

export type WorkingNumberVerdict = 'advance' | 'reset' | 'hold';

/**
 * What happens to the working number, given the reps achieved on the 95% set.
 * `null` reps = the session was not done: no evidence to advance on, so hold.
 */
export function verdictFrom95Set(repsAchieved: number | null | undefined): WorkingNumberVerdict {
  if (repsAchieved == null || !Number.isFinite(repsAchieved)) return 'hold';
  return repsAchieved >= VALIDITY_CHECK_MIN_REPS ? 'advance' : 'reset';
}

/** A reset drops the working number 10% — the same mechanism as a stall. */
export const RESET_FRACTION = 0.10;

export function applyVerdict(
  workingNumber: number,
  verdict: WorkingNumberVerdict,
  isLowerBody: boolean,
  /** The athlete's 1RM for this lift. Omitted → no ceiling is enforced (legacy callers). */
  oneRM?: number,
): { workingNumber: number; ceilingHit: boolean } {
  if (verdict === 'reset') {
    return { workingNumber: roundDownToIncrement(workingNumber * (1 - RESET_FRACTION)), ceilingHit: false };
  }
  if (verdict !== 'advance') return { workingNumber, ceilingHit: false };

  const stepped = workingNumber + cappedCycleIncrementLb(workingNumber, isLowerBody);
  const ceiling = oneRM == null ? Number.POSITIVE_INFINITY : tmCeilingLb(oneRM);
  // ⛔ HOLD AT THE CEILING, do not clip to it. Clipping produces a number nobody asked for; holding
  // is the same "no advance" the verdict system already expresses, and it carries a reason out.
  if (stepped > ceiling) return { workingNumber, ceilingHit: true };
  return { workingNumber: stepped, ceilingHit: false };
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
 *   advance → +5 / +10 (Wendler's step, and what an absent verdict means)
 *   reset   → −10%, the same mechanism as a stall
 *   hold    → unchanged; the session was not done, so there is no evidence to advance on
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
    /** The athlete's 1RM, so the ceiling can be enforced. Omitted → no ceiling. */
    oneRM?: number;
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
): { workingNumber: number; ceilingHitAtCycle: number | null } {
  const unknown = opts?.unknownMeans ?? 'hold';
  let wn = baseWorkingNumber;
  let ceilingHitAtCycle: number | null = null;
  for (let step = 0; step < Math.max(0, cycleIndex - 1); step += 1) {
    const r = applyVerdict(wn, verdicts?.[step] ?? unknown, isLowerBody, opts?.oneRM);
    wn = r.workingNumber;
    if (r.ceilingHit && ceilingHitAtCycle === null) ceilingHitAtCycle = step + 2;
  }
  return { workingNumber: wn, ceilingHitAtCycle };
}
