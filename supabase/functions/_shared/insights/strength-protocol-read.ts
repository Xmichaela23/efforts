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
        return 'Reps came up short at the prescribed load. On a linear block that stall is the signal the ramp is done — a retest sets the next block.';
      }
      if (typeof ctx.workingPct === 'number' && ctx.workingPct >= FIVE_BY_FIVE_CEILING_PCT) {
        return `You are at the top of the 5×5 ramp (${Math.round(ctx.workingPct)}% of your max). Linear progression runs out here — a retest is what sets the next block's numbers.`;
      }
      return null; // The ramp is climbing and you are completing it. That is the protocol working.
    }

    // ── THE PREVIOUS PROGRAM the previous program (strength_primary): the working number is FIXED at plan creation and the ─────
    //    prescription deliberately walks 40% → 95% of it across each four-week cycle.
    // DESIGNED: an e1RM estimate that rises and falls with the week's percentage. Eight of a twelve-week
    // block's weeks are sub-maximal by prescription, and the deload weeks sit near 60%, so a naive read
    // of the estimate is mostly reading the calendar. NEVER reported as decay.
    // SIGNAL: failing the prescribed reps. the previous program — *"You keep on increasing the max you're working
    // from every four weeks until you can no longer hit the prescribed sets and reps."* Advancement is
    // the default and a MISS is the event, so a miss is the one thing here worth saying.
    // ⛔ NO CEILING CLAUSE. 5×5 has a terminal 85% that ends the block; the previous program has no such condition —
    // it cycles indefinitely. Inventing one would be a claim the protocol does not make.
    case 'strength_primary': {
      if (ctx.missedPrescribedReps === true) {
        return 'Reps came up short at the prescribed load. On this program that miss is the signal — the working number comes down and the cycle restarts from there.';
      }
      return null; // The percentages are moving as written and you are completing them.
    }

    // ── MAINTENANCE DOSE (minimum-dose.ts): "keep strength from sliding, minimal time/cost". ───────
    // DESIGNED: low volume. Never read as a shortfall — spending less time IS the point.
    // SIGNAL: sliding, because holding is the single job this block has.
    case 'minimum_dose': {
      if (sliding) {
        return 'Estimated maxes have drifted down on a maintenance dose — the one job of that block is to hold them.';
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
  //
  // ⛔ `strength_primary` ADDED 2026-07-30 — audit F3, and it is the strongest case in this list.
  // the previous program does not merely tolerate a dipping estimate, it PRESCRIBES one: each cycle runs 65/75/85 →
  // 70/80/90 → 75/85/95 → 40/50/60% of a working number that is itself only 85-90% of the true max.
  // Two weeks in four are deliberately sub-maximal and one is a deload, so on this protocol the
  // estimate is largely a readout of the week number. The generic *"estimated one-rep maxes have been
  // sliding — the one being built"* fired on exactly that, which is the Q-166 class of error: a true
  // sentence about a number, and a false claim about the athlete.
  //
  // ⚠️ THE DOCSTRING ABOVE SAYS THE DEFAULT IS TRUE AND THE CODE SAYS FALSE. The code is what runs,
  // and the contradiction is left standing on purpose: flipping the default would silence this claim
  // for every plan with no protocol at all — a far larger behaviour change than this audit, and one
  // that needs its own decision. Filed rather than smuggled in.
  return id === 'five_by_five' || id === 'upper_aesthetics' || id === 'durability' || id === 'strength_primary';
}
