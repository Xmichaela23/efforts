// WHAT THE STRENGTH BLOCK IS TRYING TO DO (2026-07-19)
//
// WHY THIS EXISTS: a weekly read that looks only at trend lines is a robot. It sees a number move and
// calls it good or bad, with no idea what the block was DESIGNED to make that number do. The same
// observation inverts by protocol:
//
//   - On 5×5 the prescribed load climbs 70%→85% every week (protocols/five-by-five.ts). So reps-in-
//     reserve FALL by design, and the RIR-adjusted e1RM estimate falls with them. Reporting that as
//     "your strength is sliding" is reporting linear progression working correctly.
//   - On a MAINTENANCE dose (minimum_dose) the entire job is to hold. There, sliding IS the story —
//     the one thing the block was for did not happen.
//   - On a hypertrophy block (upper_aesthetics) e1RM is fatigue-suppressed for the duration by design;
//     volume is the instrument, and an e1RM read is close to meaningless.
//   - On durability work the RIR target itself steps 3→2 across Base (protocols/foundation-durability.ts),
//     so a falling RIR is the prescription, and the adaptation isn't a 1RM anyway.
//
// So: the protocol owns the reading. This module answers two questions per protocol — what is DESIGNED
// behaviour (and therefore must never be reported as decay), and what is the signal actually worth
// saying. A protocol we have not grounded returns null: silence beats a confident misread.
//
// GROUNDING: readings below are taken from each protocol module's own definition + docs/
// SCIENCE-5x5-linear-progression.md. Nothing here is invented; where a protocol's intent is not
// documented well enough to read honestly, it is listed as UNGROUNDED and stays silent.

export type StrengthTrendVerdict = 'improving' | 'holding' | 'sliding' | 'needs_data';

export interface StrengthProtocolContext {
  /** Protocol id as registered in shared/strength-system/protocols/*.ts */
  protocolId?: string | null;
  /** 1-based week within the current block. */
  weekInBlock?: number | null;
  /** A planned unloading week — its lighter load is the prescription, never a shortfall. */
  isDeloadWeek?: boolean | null;
  /** Current prescribed working load as %1RM (5×5 ramps 70→85; the 85 ceiling is a terminal signal). */
  workingPct?: number | null;
  /** The spine's noise-guarded e1RM direction (state-trend/strength.ts StrengthFitness.e1rm). */
  e1rmVerdict?: StrengthTrendVerdict | null;
  /** Reps missed at the PRESCRIBED load — on a linear block this is the stall, the real event. */
  missedPrescribedReps?: boolean | null;
}

/** The 5×5 linear-progression ceiling: the block's own terminal condition (SCIENCE §2/§4 → retest). */
const FIVE_BY_FIVE_CEILING_PCT = 85;

/**
 * The block's reading. Returns a sentence, or null when the protocol says nothing is worth saying —
 * which is the common case, because most weeks of a working block are simply the block working.
 */
export function readStrengthProtocol(ctx: StrengthProtocolContext | null | undefined): string | null {
  if (!ctx) return null;
  const id = String(ctx.protocolId || '').toLowerCase();
  const sliding = ctx.e1rmVerdict === 'sliding';

  // A planned deload is the prescription. Nothing about a light week is news, in any protocol.
  if (ctx.isDeloadWeek === true) return null;

  switch (id) {
    // ── LINEAR PROGRESSION (five-by-five.ts): load climbs 70→85% at ~1.25%/week. ───────────────────
    // DESIGNED: falling RIR, and therefore a falling e1RM estimate off working sets. NEVER reported.
    // SIGNAL: the stall (reps missed at the prescribed load), and the 85% ceiling that ends the block.
    case 'five_by_five': {
      if (ctx.missedPrescribedReps === true) {
        return 'You missed reps at the prescribed load — on a linear block that is the stall, and it is what ends the ramp rather than a bad week.';
      }
      if (typeof ctx.workingPct === 'number' && ctx.workingPct >= FIVE_BY_FIVE_CEILING_PCT) {
        return `You are at the top of the 5×5 ramp (${Math.round(ctx.workingPct)}% of your max). Linear progression runs out here — a retest is what sets the next block's numbers.`;
      }
      return null; // The ramp is climbing and you are completing it. That is the protocol working.
    }

    // ── MAINTENANCE DOSE (minimum-dose.ts): "keep strength from sliding, minimal time/cost". ───────
    // DESIGNED: low volume. Never read as a shortfall — spending less time IS the point.
    // SIGNAL: sliding, because holding is the single job this block has.
    case 'minimum_dose': {
      if (sliding) {
        return 'Your lifts have drifted down while on a maintenance dose — holding is the one thing that block is for, so it is worth a look.';
      }
      return null;
    }

    // ── NEURAL / MAX STRENGTH (performance-neural.ts): 85-90% 1RM, 2-3 reps, volume deliberately ───
    //    too low to trigger hypertrophy.
    // DESIGNED: low volume. e1RM IS the right instrument here — this block is explicitly max-strength.
    case 'neural_speed': {
      if (sliding) {
        return 'Your top-end strength has drifted down through a block built to raise it — the loads are heavy and the volume is deliberately low, so the lifts themselves are the read.';
      }
      return null;
    }

    // ── DURABILITY (foundation-durability.ts): progressive injury-proofing; the RIR TARGET itself ──
    //    steps 3→2 across Base, and the adaptation is tendon/tissue, not a 1RM.
    // DESIGNED: falling RIR. And e1RM is the wrong instrument entirely for tempo/eccentric/unilateral
    // work, so no e1RM claim is made at all.
    case 'durability':
      return null;

    // ── HYPERTROPHY PERIODIZATION (upper-priority-hybrid.ts, `upper_aesthetics`). ──────────────────
    // DESIGNED: e1RM is fatigue-suppressed for the block's duration; volume is the instrument.
    // An e1RM verdict here is close to meaningless, so it is not surfaced.
    case 'upper_aesthetics':
      return null;

    // ── UNGROUNDED — `triathlon`, `triathlon_performance`, and anything unrecognised. Their intent
    //    has not been traced closely enough to invert or endorse a trend honestly. Silence.
    default:
      return null;
  }
}

/**
 * Does this protocol DESIGN the behaviour that a naive trend read would call decay? Used by the week
 * composer to suppress its generic strength claim when the protocol already accounts for the movement.
 * Defaults to TRUE for unknown protocols — the safe direction is to say nothing, not to accuse.
 */
export function protocolExpectsE1rmToDip(protocolId?: string | null): boolean {
  const id = String(protocolId || '').toLowerCase();
  // Linear progression walks the load up until it stalls; hypertrophy and durability blocks suppress or
  // simply don't measure a 1RM. In all three a dipping estimate is the design, not a finding.
  return id === 'five_by_five' || id === 'upper_aesthetics' || id === 'durability';
}
