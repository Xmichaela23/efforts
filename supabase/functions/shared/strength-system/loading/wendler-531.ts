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
export function cyclesForBlock(weeks: number): CycleSlot[] {
  const count = Math.max(1, Math.floor(weeks / WEEKS_PER_CYCLE));
  return Array.from({ length: count }, (_, i) => {
    const index = i + 1;
    return {
      index,
      // Exactly one anchor, and it is last. 12wk → leader, leader, anchor.
      kind: index === count ? 'anchor' : 'leader',
      startWeek: i * WEEKS_PER_CYCLE + 1,
      endWeek: (i + 1) * WEEKS_PER_CYCLE,
    } as CycleSlot;
  });
}

export function cycleForWeek(weeks: number, week: number): { slot: CycleSlot; weekInCycle: number } | null {
  const slot = cyclesForBlock(weeks).find((c) => week >= c.startWeek && week <= c.endWeek);
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
): number {
  if (verdict === 'advance') return workingNumber + cycleIncrementLb(isLowerBody);
  if (verdict === 'reset') return roundDownToIncrement(workingNumber * (1 - RESET_FRACTION));
  return workingNumber;
}
